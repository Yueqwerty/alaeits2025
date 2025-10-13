require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function fixMesas() {
  try {
    console.log('🔍 Reasignando mesas (excluyendo discusiones)...\n');

    // Obtener ponencias excluyendo simposios Y discusiones
    const { rows: ponencias } = await pool.query(`
      SELECT id, scheduled_day, scheduled_time_block, room, turn_order
      FROM events
      WHERE event_type NOT IN ('simposio', 'discusion')
        AND scheduled_day IS NOT NULL
        AND scheduled_time_block IS NOT NULL
        AND room IS NOT NULL
      ORDER BY scheduled_day, scheduled_time_block, room, turn_order
    `);

    console.log(`📊 Total de ponencias: ${ponencias.length}\n`);

    // Agrupar por sala+horario+día
    const mesas = {};
    ponencias.forEach(p => {
      const key = `${p.scheduled_day}|${p.scheduled_time_block}|${p.room}`;
      if (!mesas[key]) mesas[key] = { events: [], day: p.scheduled_day, time: p.scheduled_time_block, room: p.room };
      mesas[key].events.push(p);
    });

    const mesasArray = Object.values(mesas);
    console.log(`📋 Total de mesas: ${mesasArray.length}\n`);

    // Verificar que ninguna tenga más de 6
    const overloaded = mesasArray.filter(m => m.events.length > 6);
    if (overloaded.length > 0) {
      console.log(`⚠️  Mesas con más de 6 ponencias: ${overloaded.length}`);
      overloaded.slice(0, 3).forEach(m => {
        console.log(`   ${m.day} | ${m.time} | Sala ${m.room}: ${m.events.length} ponencias`);
      });
      console.log('');
    }

    // Asignar IDs mesa-1, mesa-2, etc.
    let mesaCounter = 1;
    const updates = [];

    mesasArray.forEach(mesa => {
      const mesaId = `mesa-${mesaCounter}`;
      mesa.events.forEach(p => {
        updates.push({ id: p.id, mesaId });
      });
      mesaCounter++;
    });

    // Batch update
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

    console.log(`✅ ${updates.length} ponencias actualizadas`);
    console.log(`📌 Mesas creadas: mesa-1 hasta mesa-${mesaCounter - 1}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixMesas();
