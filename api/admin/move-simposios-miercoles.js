require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Mover simposios del miércoles a salas U- correctas (16-26)
 */

async function moveSimposiosMiercoles() {
  console.log('🔄 Verificando simposios del miércoles...\n');

  try {
    // Consultar simposios del miércoles
    const { rows: simposiosMiercoles } = await pool.query(`
      SELECT id, room, scheduled_time_block, turn_order
      FROM events
      WHERE event_type = 'simposio'
        AND scheduled_day = 'miércoles 15 de octubre'
      ORDER BY room::integer, scheduled_time_block
    `);

    console.log(`📊 Simposios del miércoles encontrados: ${simposiosMiercoles.length}\n`);

    if (simposiosMiercoles.length === 0) {
      console.log('✅ No hay simposios el miércoles. Todo correcto.');
      return;
    }

    // Simposios que NO están en salas 16-26
    const simposiosAMover = simposiosMiercoles.filter(s => {
      const roomNum = parseInt(s.room);
      return roomNum < 16 || roomNum > 26;
    });

    console.log(`📊 Simposios a mover: ${simposiosAMover.length}\n`);

    if (simposiosAMover.length === 0) {
      console.log('✅ Todos los simposios ya están en salas U- (16-26). Todo correcto.');
      return;
    }

    // Mapear simposios a salas U- del miércoles (16-26)
    const salaU = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
    const salasPorBloque = new Map();

    for (const simposio of simposiosAMover) {
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
        AND scheduled_day = 'miércoles 15 de octubre'
        AND room::integer BETWEEN 16 AND 26
    `);

    console.log(`✅ Simposios ahora en salas U- (16-26): ${verificacion[0].total}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar
if (require.main === module) {
  moveSimposiosMiercoles()
    .then(() => {
      console.log('\n✅ Script completado.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

module.exports = moveSimposiosMiercoles;
