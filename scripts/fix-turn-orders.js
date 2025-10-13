require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function fixTurnOrders() {
  try {
    console.log('🔍 Corrigiendo turnos duplicados...\n');

    // Obtener todos los grupos (sala + horario + día)
    const { rows: groups } = await pool.query(`
      SELECT DISTINCT scheduled_day, scheduled_time_block, room
      FROM events
      WHERE event_type != 'simposio'
        AND scheduled_day IS NOT NULL
        AND scheduled_time_block IS NOT NULL
        AND room IS NOT NULL
      ORDER BY scheduled_day, scheduled_time_block, room
    `);

    console.log(`📊 Total de grupos a revisar: ${groups.length}\n`);

    let fixed = 0;
    let overloaded = 0;

    for (const group of groups) {
      // Obtener eventos de este grupo ordenados por turn_order actual y luego por id
      const { rows: events } = await pool.query(`
        SELECT id, turn_order
        FROM events
        WHERE event_type != 'simposio'
          AND scheduled_day = $1
          AND scheduled_time_block = $2
          AND room = $3
        ORDER BY turn_order NULLS LAST, id
      `, [group.scheduled_day, group.scheduled_time_block, group.room]);

      if (events.length > 6) {
        console.log(`⚠️  ${group.scheduled_day} | ${group.scheduled_time_block} | Sala ${group.room}: ${events.length} ponencias (excede límite)`);
        overloaded++;
      }

      // Renumerar turnos del 0 al n-1
      for (let i = 0; i < events.length; i++) {
        if (events[i].turn_order !== i) {
          await pool.query(
            'UPDATE events SET turn_order = $1 WHERE id = $2',
            [i, events[i].id]
          );
          fixed++;
        }
      }
    }

    console.log(`\n✅ Turnos corregidos: ${fixed}`);
    if (overloaded > 0) {
      console.log(`⚠️  Mesas con más de 6 ponencias: ${overloaded}`);
    }

    // Reasignar mesas ahora que los turnos están correctos
    console.log('\n🔄 Reasignando IDs de mesa...\n');

    const { rows: ponencias } = await pool.query(`
      SELECT id, scheduled_day, scheduled_time_block, room
      FROM events
      WHERE event_type != 'simposio'
        AND scheduled_day IS NOT NULL
        AND scheduled_time_block IS NOT NULL
        AND room IS NOT NULL
      ORDER BY scheduled_day, scheduled_time_block, room, turn_order
    `);

    const mesas = {};
    ponencias.forEach(p => {
      const key = `${p.scheduled_day}|${p.scheduled_time_block}|${p.room}`;
      if (!mesas[key]) mesas[key] = [];
      mesas[key].push(p);
    });

    let mesaCounter = 1;
    const updates = [];

    Object.values(mesas).forEach(grupo => {
      const mesaId = `mesa-${mesaCounter}`;
      grupo.forEach(p => {
        updates.push({ id: p.id, mesaId });
      });
      mesaCounter++;
    });

    // Update en batch
    const caseStatements = updates.map((u, i) =>
      `WHEN id = $${i * 2 + 1} THEN $${i * 2 + 2}::jsonb`
    ).join(' ');

    const values = updates.flatMap(u => [u.id, JSON.stringify({ es: u.mesaId })]);
    const ids = updates.map(u => `'${u.id}'`).join(', ');

    await pool.query(`
      UPDATE events
      SET mesa_title = CASE ${caseStatements} END
      WHERE id IN (${ids})
    `, values);

    console.log(`✅ ${updates.length} ponencias actualizadas con mesa-1 hasta mesa-${mesaCounter - 1}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixTurnOrders();
