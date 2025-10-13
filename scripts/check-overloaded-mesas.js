require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function checkOverloadedMesas() {
  try {
    const { rows } = await pool.query(`
      SELECT
        scheduled_day,
        scheduled_time_block,
        room,
        mesa_title->>'es' as mesa_id,
        COUNT(*) as cantidad
      FROM events
      WHERE event_type != 'simposio'
        AND scheduled_day IS NOT NULL
        AND scheduled_time_block IS NOT NULL
        AND room IS NOT NULL
      GROUP BY scheduled_day, scheduled_time_block, room, mesa_title->>'es'
      HAVING COUNT(*) > 6
      ORDER BY cantidad DESC, scheduled_day, scheduled_time_block, room
    `);

    console.log(`\n🔍 Mesas con MÁS de 6 ponencias:\n`);
    console.log(`Total: ${rows.length} mesas sobrecargadas\n`);

    rows.forEach(row => {
      console.log(`${row.mesa_id}: ${row.cantidad} ponencias`);
      console.log(`   📅 ${row.scheduled_day} | ⏰ ${row.scheduled_time_block} | 🚪 Sala ${row.room}\n`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkOverloadedMesas();
