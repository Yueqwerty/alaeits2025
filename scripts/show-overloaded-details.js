require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function showDetails() {
  try {
    const { rows: groups } = await pool.query(`
      SELECT scheduled_day, scheduled_time_block, room, COUNT(*) as count
      FROM events
      WHERE event_type != 'simposio'
        AND scheduled_day IS NOT NULL
        AND scheduled_time_block IS NOT NULL
        AND room IS NOT NULL
      GROUP BY scheduled_day, scheduled_time_block, room
      HAVING COUNT(*) > 6
      ORDER BY scheduled_day, scheduled_time_block, room
      LIMIT 5
    `);

    console.log(`\n📊 Primeras 5 mesas sobrecargadas:\n`);

    for (const g of groups) {
      console.log(`\n🚪 ${g.scheduled_day} | ${g.scheduled_time_block} | Sala ${g.room} (${g.count} ponencias):`);

      const { rows: events } = await pool.query(`
        SELECT id, title->>'es' as title, turn_order
        FROM events
        WHERE event_type != 'simposio'
          AND scheduled_day = $1
          AND scheduled_time_block = $2
          AND room = $3
        ORDER BY turn_order
      `, [g.scheduled_day, g.scheduled_time_block, g.room]);

      events.forEach(e => {
        const titleShort = e.title ? e.title.substring(0, 50) : 'Sin título';
        console.log(`   ${e.id} - Turno ${e.turn_order} - ${titleShort}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

showDetails();
