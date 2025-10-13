require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function fixDuplicates() {
  try {
    // Encontrar grupos con duplicados en turn_order
    const { rows } = await pool.query(`
      SELECT
        scheduled_day, scheduled_time_block, room,
        turn_order, COUNT(*) as count
      FROM events
      WHERE event_type != 'simposio'
        AND turn_order IS NOT NULL
      GROUP BY scheduled_day, scheduled_time_block, room, turn_order
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);

    console.log(`\n🔍 Grupos con turnos duplicados: ${rows.length}\n`);

    rows.forEach(row => {
      console.log(`${row.scheduled_day} | ${row.scheduled_time_block} | Sala ${row.room} | Turno ${row.turn_order}: ${row.count} ponencias`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixDuplicates();
