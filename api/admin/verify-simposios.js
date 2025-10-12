require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Script para verificar la distribución de simposios en salas U- (22-32)
 */

async function verifySimposios() {
  console.log('🔍 Verificando distribución de simposios en salas U-...\n');

  try {
    // 1. Consultar todos los simposios con sus ubicaciones
    const { rows: simposios } = await pool.query(`
      SELECT
        id,
        event_type,
        room,
        scheduled_day,
        scheduled_time_block,
        status
      FROM events
      WHERE event_type = 'simposio'
      ORDER BY room::integer, scheduled_day, scheduled_time_block
    `);

    console.log(`📊 Total de simposios: ${simposios.length}\n`);

    // 2. Agrupar por sala
    const porSala = {};
    simposios.forEach(s => {
      const sala = s.room || 'Sin asignar';
      if (!porSala[sala]) {
        porSala[sala] = [];
      }
      porSala[sala].push(s);
    });

    // 3. Mostrar distribución
    console.log('📍 DISTRIBUCIÓN POR SALA:');
    console.log('='.repeat(60));

    Object.keys(porSala).sort((a, b) => {
      if (a === 'Sin asignar') return 1;
      if (b === 'Sin asignar') return -1;
      return parseInt(a) - parseInt(b);
    }).forEach(sala => {
      const simposiosSala = porSala[sala];
      const salaNum = parseInt(sala);
      const esCorrect = salaNum >= 22 && salaNum <= 32;
      const icon = esCorrect ? '✅' : '❌';

      console.log(`\n${icon} Sala ${sala}: ${simposiosSala.length} simposios`);

      // Mostrar detalle
      simposiosSala.forEach(s => {
        const programacion = s.scheduled_day && s.scheduled_time_block
          ? `${s.scheduled_day} - ${s.scheduled_time_block}`
          : 'Sin programar';
        console.log(`   • ${s.id} | ${programacion} | ${s.status}`);
      });
    });

    console.log('\n' + '='.repeat(60));

    // 4. Verificar integridad
    const { rows: incorrectos } = await pool.query(`
      SELECT COUNT(*) as total
      FROM events
      WHERE event_type = 'simposio'
        AND room IS NOT NULL
        AND (room::integer < 22 OR room::integer > 32)
    `);

    const { rows: enSalasCorrectas } = await pool.query(`
      SELECT COUNT(*) as total
      FROM events
      WHERE event_type = 'simposio'
        AND room::integer BETWEEN 22 AND 32
    `);

    console.log('\n📊 RESUMEN:');
    console.log(`✅ Simposios en salas correctas (22-32): ${enSalasCorrectas[0].total}`);
    console.log(`❌ Simposios en salas incorrectas: ${incorrectos[0].total}`);

    if (parseInt(incorrectos[0].total) === 0) {
      console.log('\n✨ ¡Perfecto! Todos los simposios están en salas U- (22-32).');
    } else {
      console.log('\n⚠️  Advertencia: Hay simposios en salas incorrectas.');
    }

    // 5. Verificar que no haya eventos regulares en salas U-
    const { rows: eventosRegulaesEnU } = await pool.query(`
      SELECT COUNT(*) as total
      FROM events
      WHERE event_type != 'simposio'
        AND room::integer BETWEEN 22 AND 32
    `);

    if (parseInt(eventosRegulaesEnU[0].total) > 0) {
      console.log(`\n⚠️  ADVERTENCIA: Hay ${eventosRegulaesEnU[0].total} eventos NO-simposio en salas U- (22-32).`);

      const { rows: detalleRegulares } = await pool.query(`
        SELECT id, title, event_type, room, scheduled_day, scheduled_time_block
        FROM events
        WHERE event_type != 'simposio'
          AND room::integer BETWEEN 22 AND 32
        ORDER BY room::integer
      `);

      console.log('\n❌ Eventos regulares que deben ser movidos:');
      detalleRegulares.forEach(e => {
        console.log(`   • ${e.id} (${e.event_type}) en Sala ${e.room}`);
      });
    } else {
      console.log('\n✅ Perfecto: No hay eventos regulares en salas U- (solo simposios).');
    }

  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar el script
if (require.main === module) {
  verifySimposios()
    .then(() => {
      console.log('\n✅ Verificación completada.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Verificación falló:', error);
      process.exit(1);
    });
}

module.exports = verifySimposios;
