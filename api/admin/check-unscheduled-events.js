require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Script para verificar eventos sin programar
 */

async function checkUnscheduledEvents() {
  console.log('Verificando eventos sin programar...\n');

  try {
    // Eventos sin sala asignada
    const { rows: sinSala } = await pool.query(`
      SELECT id, event_type, status, title
      FROM events
      WHERE room IS NULL
      ORDER BY event_type, id
    `);

    console.log(`Eventos sin sala asignada: ${sinSala.length}\n`);

    // Eventos sin programación completa
    const { rows: sinProgramar } = await pool.query(`
      SELECT id, event_type, status, title, room, scheduled_day, scheduled_time_block
      FROM events
      WHERE scheduled_day IS NULL OR scheduled_time_block IS NULL OR room IS NULL
      ORDER BY event_type, id
    `);

    console.log(`Eventos sin programación completa: ${sinProgramar.length}\n`);

    // Desglose por tipo
    const { rows: porTipo } = await pool.query(`
      SELECT
        event_type,
        COUNT(*) as total,
        COUNT(CASE WHEN room IS NULL THEN 1 END) as sin_sala,
        COUNT(CASE WHEN scheduled_day IS NULL THEN 1 END) as sin_dia,
        COUNT(CASE WHEN scheduled_time_block IS NULL THEN 1 END) as sin_bloque
      FROM events
      GROUP BY event_type
      ORDER BY event_type
    `);

    console.log('DESGLOSE POR TIPO DE EVENTO:');
    console.log('='.repeat(80));
    console.log('Tipo          | Total | Sin Sala | Sin Día | Sin Bloque');
    console.log('-'.repeat(80));
    porTipo.forEach(row => {
      console.log(
        `${row.event_type.padEnd(13)} | ${String(row.total).padStart(5)} | ${String(row.sin_sala).padStart(8)} | ${String(row.sin_dia).padStart(7)} | ${String(row.sin_bloque).padStart(10)}`
      );
    });
    console.log('='.repeat(80) + '\n');

    // Eventos en estado borrador que fueron modificados recientemente
    const { rows: borradores } = await pool.query(`
      SELECT id, event_type, title, room, scheduled_day, scheduled_time_block
      FROM events
      WHERE status = 'borrador'
        AND event_type != 'simposio'
        AND event_type != 'discusion'
      ORDER BY id
      LIMIT 100
    `);

    console.log(`Eventos en estado BORRADOR (primeros 100):\n`);

    let conProgramacion = 0;
    let sinProgramacion = 0;

    borradores.forEach(e => {
      if (!e.room || !e.scheduled_day || !e.scheduled_time_block) {
        sinProgramacion++;
      } else {
        conProgramacion++;
      }
    });

    console.log(`  Con programación: ${conProgramacion}`);
    console.log(`  Sin programación: ${sinProgramacion}`);
    console.log(`  Total borradores: ${borradores.length}\n`);

    // Eventos que estaban programados y ahora están como borrador sin programación
    console.log('  POSIBLES EVENTOS DESPROGRAMADOS:');
    console.log('    (Borradores sin sala/día/bloque - podrían haber sido desprogramados)\n');

    const desprogramados = borradores.filter(e => !e.room && !e.scheduled_day && !e.scheduled_time_block);

    if (desprogramados.length > 0) {
      console.log(`    Total: ${desprogramados.length} eventos`);
      desprogramados.slice(0, 20).forEach(e => {
        console.log(`    • ${e.id} (${e.event_type})`);
      });
      if (desprogramados.length > 20) {
        console.log(`    ... y ${desprogramados.length - 20} más`);
      }
    } else {
      console.log('    No se encontraron eventos desprogramados');
    }

  } catch (error) {
    console.error('Error durante la verificación:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar el script
if (require.main === module) {
  checkUnscheduledEvents()
    .then(() => {
      console.log('\nVerificación completada.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nVerificación falló:', error);
      process.exit(1);
    });
}

module.exports = checkUnscheduledEvents;
