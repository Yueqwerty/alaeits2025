require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Mover simposios a salas U- correctas (22-32 para martes)
 */

async function moveSimposios() {
  console.log('🔄 Moviendo simposios a salas U- correctas...\n');

  try {
    // Consultar simposios del martes en salas incorrectas (1-21)
    const { rows: simposiosMartes } = await pool.query(`
      SELECT id, room, scheduled_time_block, turn_order
      FROM events
      WHERE event_type = 'simposio'
        AND scheduled_day = 'martes 14 de octubre'
        AND room::integer BETWEEN 1 AND 21
      ORDER BY room::integer, scheduled_time_block
    `);

    console.log(`📊 Simposios del martes a mover: ${simposiosMartes.length}\n`);

    // Mapear simposios a salas U- (22-32)
    const salaU = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
    let salaIndex = 0;
    const salasPorBloque = new Map();

    for (const simposio of simposiosMartes) {
      const bloque = simposio.scheduled_time_block;

      if (!salasPorBloque.has(bloque)) {
        salasPorBloque.set(bloque, 0);
      }

      const salaAsignada = salaU[salasPorBloque.get(bloque) % salaU.length];
      salasPorBloque.set(bloque, salasPorBloque.get(bloque) + 1);

      // Actualizar en BD
      await pool.query(`
        UPDATE events
        SET room = $1
        WHERE id = $2
      `, [salaAsignada, simposio.id]);

      console.log(`✅ ${simposio.id}: Sala ${simposio.room} → ${salaAsignada} (${bloque})`);
    }

    console.log('\n✨ Movimiento completado!\n');

    // Verificar resultado
    const { rows: verificacion } = await pool.query(`
      SELECT COUNT(*) as total
      FROM events
      WHERE event_type = 'simposio'
        AND scheduled_day = 'martes 14 de octubre'
        AND room::integer BETWEEN 22 AND 32
    `);

    console.log(`✅ Simposios ahora en salas U- (22-32): ${verificacion[0].total}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar
if (require.main === module) {
  moveSimposios()
    .then(() => {
      console.log('\n✅ Script completado.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

module.exports = moveSimposios;
