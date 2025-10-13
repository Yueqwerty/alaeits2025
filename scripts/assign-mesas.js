require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function assignMesas() {
  console.log('🔍 Iniciando asignación de mesas...\n');

  try {
    // 1. Obtener todas las ponencias programadas
    const { rows: ponencias } = await pool.query(`
      SELECT id, scheduled_day, scheduled_time_block, room, turn_order
      FROM events
      WHERE event_type != 'simposio'
        AND scheduled_day IS NOT NULL
        AND scheduled_time_block IS NOT NULL
        AND room IS NOT NULL
      ORDER BY scheduled_day, scheduled_time_block, room, turn_order
    `);

    console.log(`📊 Total de ponencias programadas: ${ponencias.length}\n`);

    // 2. Agrupar por (día, horario, sala)
    const mesas = {};

    ponencias.forEach(ponencia => {
      const key = `${ponencia.scheduled_day}|${ponencia.scheduled_time_block}|${ponencia.room}`;
      if (!mesas[key]) {
        mesas[key] = [];
      }
      mesas[key].push(ponencia);
    });

    const mesasArray = Object.entries(mesas);
    console.log(`📋 Total de mesas: ${mesasArray.length}\n`);

    // 3. Asignar mesa-1, mesa-2, etc.
    let mesaCounter = 1;
    const updates = [];

    for (const [key, ponenciasList] of mesasArray) {
      const mesaId = `mesa-${mesaCounter}`;
      const [day, timeBlock, room] = key.split('|');

      console.log(`${mesaId}: ${day} | ${timeBlock} | Sala ${room} (${ponenciasList.length} ponencias)`);

      if (ponenciasList.length > 6) {
        console.log(`   ⚠️  Esta mesa excede 6 ponencias`);
      }

      ponenciasList.forEach(p => {
        updates.push({ id: p.id, mesaId });
      });

      mesaCounter++;
    }

    // 4. Actualizar base de datos en batch
    console.log(`\n💾 Actualizando ${updates.length} ponencias en batch...\n`);

    // Crear el query dinámico con CASE
    const caseStatements = updates.map((update, idx) =>
      `WHEN id = $${idx * 2 + 1} THEN $${idx * 2 + 2}::jsonb`
    ).join(' ');

    const values = updates.flatMap(update => [
      update.id,
      JSON.stringify({ es: update.mesaId })
    ]);

    const ids = updates.map(u => `'${u.id}'`).join(', ');

    const query = `
      UPDATE events
      SET mesa_title = CASE ${caseStatements} END
      WHERE id IN (${ids})
    `;

    await pool.query(query, values);

    console.log(`✅ ¡Completado! Mesas asignadas: mesa-1 hasta mesa-${mesaCounter - 1}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

assignMesas();
