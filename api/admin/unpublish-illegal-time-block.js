require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Despublicar eventos con bloque horario ilegal 08:15 - 09:55
 * Los mueve a estado borrador y limpia su información de programación
 */
async function unpublishIllegalTimeBlock() {
  console.log('🔄 Buscando eventos con bloque horario ilegal 08:15 - 09:55...\n');

  try {
    // Buscar todos los eventos con el bloque ilegal
    const { rows: eventosIlegales } = await pool.query(`
      SELECT id, room, scheduled_day, scheduled_time_block, event_type, status,
             title->>'es' as title
      FROM events
      WHERE scheduled_time_block = '08:15 - 09:55'
      ORDER BY scheduled_day, room::integer
    `);

    console.log(`📊 Total de eventos con bloque ilegal: ${eventosIlegales.length}\n`);

    if (eventosIlegales.length === 0) {
      console.log('✅ No hay eventos con el bloque horario ilegal 08:15 - 09:55');
      return;
    }

    // Mostrar resumen
    console.log('📋 Resumen de eventos a despublicar:');
    console.log('='.repeat(80));

    const porDia = {};
    const porEstado = {};

    eventosIlegales.forEach(event => {
      // Contar por día
      if (!porDia[event.scheduled_day]) {
        porDia[event.scheduled_day] = 0;
      }
      porDia[event.scheduled_day]++;

      // Contar por estado
      if (!porEstado[event.status]) {
        porEstado[event.status] = 0;
      }
      porEstado[event.status]++;
    });

    console.log('\n📅 Distribución por día:');
    Object.entries(porDia).forEach(([dia, count]) => {
      console.log(`   ${dia}: ${count} evento(s)`);
    });

    console.log('\n📊 Estado actual:');
    Object.entries(porEstado).forEach(([estado, count]) => {
      console.log(`   ${estado}: ${count} evento(s)`);
    });

    console.log('\n🔄 Despublicando eventos (cambiando a borrador)...\n');

    // Despublicar todos los eventos
    let despublicados = 0;
    let errores = 0;

    for (const evento of eventosIlegales) {
      try {
        await pool.query(`
          UPDATE events
          SET status = 'borrador',
              scheduled_day = NULL,
              scheduled_time_block = NULL,
              room = NULL,
              turn_order = NULL,
              updated_at = NOW()
          WHERE id = $1
        `, [evento.id]);

        if (despublicados < 20) {
          console.log(`  ✅ ${evento.id}: ${evento.status} → borrador (limpiado)`);
        }
        despublicados++;
      } catch (error) {
        console.error(`  ❌ Error al despublicar ${evento.id}:`, error.message);
        errores++;
      }
    }

    if (despublicados > 20) {
      console.log(`  ... y ${despublicados - 20} más`);
    }

    // Resumen final
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMEN FINAL');
    console.log('='.repeat(80));
    console.log(`✅ Eventos despublicados: ${despublicados}`);
    console.log(`❌ Errores: ${errores}`);
    console.log(`📋 Estado: borrador (sin programación)`);
    console.log(`📍 Información limpiada: día, hora, sala, turno`);
    console.log('='.repeat(80));

    // Verificar el resultado
    const { rows: verificacion } = await pool.query(`
      SELECT COUNT(*) as total
      FROM events
      WHERE scheduled_time_block = '08:15 - 09:55'
    `);

    console.log(`\n🔍 Verificación: Eventos restantes con bloque ilegal: ${verificacion[0].total}`);

    if (verificacion[0].total === '0') {
      console.log('✅ ¡Todos los eventos con bloque ilegal han sido despublicados!');
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
  unpublishIllegalTimeBlock()
    .then(() => {
      console.log('\n✅ Script completado.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = unpublishIllegalTimeBlock;
