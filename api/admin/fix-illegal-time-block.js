require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Mover ponencias con bloque horario ilegal 08:15 - 09:55 a la sala U-102
 */
async function fixIllegalTimeBlock() {
  console.log('🔄 Buscando ponencias con bloque horario ilegal 08:15 - 09:55...\n');

  try {
    // Buscar todas las ponencias con el bloque ilegal
    const { rows: ponenciasIlegales } = await pool.query(`
      SELECT id, room, scheduled_day, scheduled_time_block, event_type,
             title->>'es' as title
      FROM events
      WHERE scheduled_time_block = '08:15 - 09:55'
      ORDER BY scheduled_day, room::integer
    `);

    console.log(`📊 Total de eventos con bloque ilegal: ${ponenciasIlegales.length}\n`);

    if (ponenciasIlegales.length === 0) {
      console.log('✅ No hay eventos con el bloque horario ilegal 08:15 - 09:55');
      return;
    }

    // Mostrar los eventos encontrados
    console.log('📋 Eventos encontrados:');
    console.log('='.repeat(80));
    ponenciasIlegales.forEach((event, index) => {
      console.log(`${index + 1}. ID: ${event.id} | Sala: ${event.room} | Día: ${event.scheduled_day}`);
      console.log(`   Título: ${event.title || 'Sin título'}`);
      console.log(`   Tipo: ${event.event_type}`);
      console.log('-'.repeat(80));
    });

    console.log('\n🔄 Moviendo todos a la sala U-102 (sala 22)...\n');

    // Mover todos a la sala 22 (U-102)
    let movidos = 0;
    let errores = 0;

    for (const ponencia of ponenciasIlegales) {
      try {
        await pool.query(`
          UPDATE events
          SET room = $1
          WHERE id = $2
        `, ['22', ponencia.id]);

        console.log(`  ✅ ${ponencia.id}: Sala ${ponencia.room} → 22 (U-102)`);
        movidos++;
      } catch (error) {
        console.error(`  ❌ Error al mover ${ponencia.id}:`, error.message);
        errores++;
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMEN FINAL');
    console.log('='.repeat(80));
    console.log(`✅ Eventos movidos exitosamente: ${movidos}`);
    console.log(`❌ Errores: ${errores}`);
    console.log(`📍 Todos ahora están en la sala U-102 (sala 22)`);
    console.log('='.repeat(80));

    // Verificar el resultado
    const { rows: verificacion } = await pool.query(`
      SELECT COUNT(*) as total, room
      FROM events
      WHERE scheduled_time_block = '08:15 - 09:55'
      GROUP BY room
      ORDER BY room::integer
    `);

    if (verificacion.length > 0) {
      console.log('\n🔍 Verificación final - Distribución actual:');
      verificacion.forEach(row => {
        console.log(`   Sala ${row.room}: ${row.total} evento(s)`);
      });
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
  fixIllegalTimeBlock()
    .then(() => {
      console.log('\n✅ Script completado.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = fixIllegalTimeBlock;
