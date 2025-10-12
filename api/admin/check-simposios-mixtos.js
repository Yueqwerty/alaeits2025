require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Verificar salas donde simposios y ponencias están mezclados
 */

async function checkSimposiosMixtos() {
  console.log('🔍 Verificando mezcla de simposios y ponencias...\n');

  try {
    // Consultar salas/bloques que tienen AMBOS tipos de eventos
    const { rows: mixedSlots } = await pool.query(`
      WITH slot_types AS (
        SELECT
          scheduled_day,
          room,
          scheduled_time_block,
          COUNT(*) as total_eventos,
          COUNT(CASE WHEN event_type = 'simposio' THEN 1 END) as simposios,
          COUNT(CASE WHEN event_type = 'ponencia' THEN 1 END) as ponencias,
          STRING_AGG(id::text, ', ' ORDER BY event_type, id) as event_ids
        FROM events
        WHERE scheduled_day IN ('martes 14 de octubre', 'miércoles 15 de octubre')
          AND room IS NOT NULL
          AND scheduled_time_block IS NOT NULL
        GROUP BY scheduled_day, room, scheduled_time_block
      )
      SELECT *
      FROM slot_types
      WHERE simposios > 0 AND ponencias > 0
      ORDER BY scheduled_day, room::integer, scheduled_time_block
    `);

    console.log(`📊 Total de salas/bloques con MEZCLA: ${mixedSlots.length}\n`);

    if (mixedSlots.length === 0) {
      console.log('✅ No hay salas donde simposios y ponencias estén mezclados.');
      return;
    }

    // Agrupar por día
    const martes = mixedSlots.filter(s => s.scheduled_day === 'martes 14 de octubre');
    const miercoles = mixedSlots.filter(s => s.scheduled_day === 'miércoles 15 de octubre');

    if (martes.length > 0) {
      console.log('📅 MARTES 14 DE OCTUBRE');
      console.log('='.repeat(80));
      martes.forEach(slot => {
        console.log(`\n  Sala ${slot.room} - ${slot.scheduled_time_block}`);
        console.log(`  Total eventos: ${slot.total_eventos}`);
        console.log(`  - Simposios: ${slot.simposios}`);
        console.log(`  - Ponencias: ${slot.ponencias}`);
        console.log(`  IDs: ${slot.event_ids}`);
      });
      console.log('\n');
    }

    if (miercoles.length > 0) {
      console.log('📅 MIÉRCOLES 15 DE OCTUBRE');
      console.log('='.repeat(80));
      miercoles.forEach(slot => {
        console.log(`\n  Sala ${slot.room} - ${slot.scheduled_time_block}`);
        console.log(`  Total eventos: ${slot.total_eventos}`);
        console.log(`  - Simposios: ${slot.simposios}`);
        console.log(`  - Ponencias: ${slot.ponencias}`);
        console.log(`  IDs: ${slot.event_ids}`);
      });
      console.log('\n');
    }

    // Resumen de eventos a mover
    const totalSimposios = mixedSlots.reduce((sum, s) => sum + parseInt(s.simposios), 0);
    const totalPonencias = mixedSlots.reduce((sum, s) => sum + parseInt(s.ponencias), 0);

    console.log('='.repeat(80));
    console.log('📊 RESUMEN');
    console.log('='.repeat(80));
    console.log(`Total salas/bloques afectados: ${mixedSlots.length}`);
    console.log(`Total simposios en estas salas: ${totalSimposios}`);
    console.log(`Total ponencias en estas salas: ${totalPonencias} (DEBEN SER MOVIDAS)`);
    console.log('='.repeat(80));

    // Verificar también si hay simposios en salas incorrectas
    console.log('\n🔍 Verificando ubicación de simposios...\n');

    const { rows: simposiosIncorrectos } = await pool.query(`
      SELECT id, room, scheduled_day, scheduled_time_block
      FROM events
      WHERE event_type = 'simposio'
        AND scheduled_day = 'martes 14 de octubre'
        AND room::integer NOT BETWEEN 22 AND 32
      ORDER BY room::integer, scheduled_time_block
    `);

    const { rows: simposiosIncorrectosMiercoles } = await pool.query(`
      SELECT id, room, scheduled_day, scheduled_time_block
      FROM events
      WHERE event_type = 'simposio'
        AND scheduled_day = 'miércoles 15 de octubre'
        AND room::integer NOT BETWEEN 16 AND 26
      ORDER BY room::integer, scheduled_time_block
    `);

    if (simposiosIncorrectos.length > 0) {
      console.log(`⚠️ Simposios del MARTES en salas incorrectas: ${simposiosIncorrectos.length}`);
      console.log('   (Deberían estar en salas 22-32)');
      simposiosIncorrectos.slice(0, 10).forEach(s => {
        console.log(`   - ID ${s.id}: Sala ${s.room} - ${s.scheduled_time_block}`);
      });
      if (simposiosIncorrectos.length > 10) {
        console.log(`   ... y ${simposiosIncorrectos.length - 10} más`);
      }
      console.log('');
    }

    if (simposiosIncorrectosMiercoles.length > 0) {
      console.log(`⚠️ Simposios del MIÉRCOLES en salas incorrectas: ${simposiosIncorrectosMiercoles.length}`);
      console.log('   (Deberían estar en salas 16-26)');
      simposiosIncorrectosMiercoles.slice(0, 10).forEach(s => {
        console.log(`   - ID ${s.id}: Sala ${s.room} - ${s.scheduled_time_block}`);
      });
      if (simposiosIncorrectosMiercoles.length > 10) {
        console.log(`   ... y ${simposiosIncorrectosMiercoles.length - 10} más`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar
if (require.main === module) {
  checkSimposiosMixtos()
    .then(() => {
      console.log('\n✅ Verificación completada.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

module.exports = checkSimposiosMixtos;
