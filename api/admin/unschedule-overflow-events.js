require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Script para desprogramar eventos regulares que quedaron en salas U-
 * porque no hay espacio en salas regulares
 */

async function unscheduleOverflowEvents() {
  console.log('🔍 Desprogramando eventos regulares que quedaron en salas U-...\n');

  try {
    // 1. Encontrar eventos regulares aún en salas U-
    const { rows: eventosEnU } = await pool.query(`
      SELECT id, event_type, room, scheduled_day, scheduled_time_block, status
      FROM events
      WHERE event_type != 'simposio'
        AND room::integer BETWEEN 22 AND 32
      ORDER BY scheduled_day, scheduled_time_block
    `);

    console.log(`📊 Eventos a desprogramar: ${eventosEnU.length}\n`);

    if (eventosEnU.length === 0) {
      console.log('✨ No hay eventos regulares en salas U-. Todo está correcto.');
      return;
    }

    // 2. Desprogramar cada evento
    console.log('🔧 Desprogramando eventos...\n');

    let desprogramados = 0;

    for (const evento of eventosEnU) {
      try {
        await pool.query(`
          UPDATE events
          SET
            room = NULL,
            scheduled_day = NULL,
            scheduled_time_block = NULL,
            turn_order = NULL,
            status = 'borrador'
          WHERE id = $1
        `, [evento.id]);

        if (desprogramados < 20) {
          console.log(`✅ ${evento.id}: Desprogramado (estaba en sala ${evento.room})`);
        }
        desprogramados++;

      } catch (error) {
        console.error(`❌ Error desprogramando ${evento.id}:`, error.message);
      }
    }

    if (desprogramados > 20) {
      console.log(`   ... y ${desprogramados - 20} eventos más`);
    }

    // 3. Resumen
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN');
    console.log('='.repeat(60));
    console.log(`✅ Eventos desprogramados: ${desprogramados}`);
    console.log(`📍 Estos eventos ahora están como BORRADORES sin programar`);
    console.log(`📍 Puedes reprogramarlos manualmente desde el dashboard`);
    console.log('='.repeat(60) + '\n');

    // 4. Verificación final
    const { rows: verificacion } = await pool.query(`
      SELECT COUNT(*) as restantes
      FROM events
      WHERE event_type != 'simposio'
        AND room::integer BETWEEN 22 AND 32
    `);

    if (parseInt(verificacion[0].restantes) === 0) {
      console.log('✨ ¡Perfecto! Ya no hay eventos regulares en salas U-.');
    } else {
      console.log(`⚠️  Aún quedan ${verificacion[0].restantes} eventos regulares en salas U-.`);
    }

  } catch (error) {
    console.error('❌ Error durante la operación:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar el script
if (require.main === module) {
  unscheduleOverflowEvents()
    .then(() => {
      console.log('\n✅ Script completado.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Script falló:', error);
      process.exit(1);
    });
}

module.exports = unscheduleOverflowEvents;
