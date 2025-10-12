require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Análisis completo de capacidad y conflictos
 */

async function analyzeCapacity() {
  console.log('📊 ANÁLISIS DE CAPACIDAD Y CONFLICTOS\n');
  console.log('='.repeat(80));

  try {
    // 1. EVENTOS POR DÍA Y TIPO
    console.log('\n1️⃣  DISTRIBUCIÓN DE EVENTOS\n');

    const { rows: distribution } = await pool.query(`
      SELECT
        scheduled_day,
        event_type,
        COUNT(*) as total
      FROM events
      WHERE scheduled_day IN ('martes 14 de octubre', 'miércoles 15 de octubre')
        AND room IS NOT NULL
        AND scheduled_time_block IS NOT NULL
      GROUP BY scheduled_day, event_type
      ORDER BY scheduled_day, event_type
    `);

    distribution.forEach(row => {
      console.log(`  ${row.scheduled_day} - ${row.event_type}: ${row.total}`);
    });

    // 2. CAPACIDAD POR DÍA
    console.log('\n2️⃣  ANÁLISIS DE CAPACIDAD\n');

    // Martes
    const martesPonencias = distribution.find(d => d.scheduled_day === 'martes 14 de octubre' && d.event_type === 'ponencia')?.total || 0;
    const martesSimposios = distribution.find(d => d.scheduled_day === 'martes 14 de octubre' && d.event_type === 'simposio')?.total || 0;

    const capacidadMartesPonencias = 21 * 5 * 6; // 21 salas × 5 bloques × 6 ponencias
    const capacidadMartesSimposios = 11 * 5 * 1; // 11 salas × 5 bloques × 1 simposio

    console.log('  MARTES 14/10:');
    console.log(`    Ponencias: ${martesPonencias} / ${capacidadMartesPonencias} (${Math.round(martesPonencias/capacidadMartesPonencias*100)}% ocupado)`);
    console.log(`    Simposios: ${martesSimposios} / ${capacidadMartesSimposios} (${Math.round(martesSimposios/capacidadMartesSimposios*100)}% ocupado)`);

    // Miércoles
    const miercolesPonencias = distribution.find(d => d.scheduled_day === 'miércoles 15 de octubre' && d.event_type === 'ponencia')?.total || 0;
    const miercolesSimposios = distribution.find(d => d.scheduled_day === 'miércoles 15 de octubre' && d.event_type === 'simposio')?.total || 0;

    const capacidadMiercolesPonencias = 15 * 4 * 6; // 15 salas × 4 bloques × 6 ponencias
    const capacidadMiercolesSimposios = 11 * 4 * 1; // 11 salas × 4 bloques × 1 simposio

    console.log('\n  MIÉRCOLES 15/10:');
    console.log(`    Ponencias: ${miercolesPonencias} / ${capacidadMiercolesPonencias} (${Math.round(miercolesPonencias/capacidadMiercolesPonencias*100)}% ocupado)`);
    console.log(`    Simposios: ${miercolesSimposios} / ${capacidadMiercolesSimposios} (${Math.round(miercolesSimposios/capacidadMiercolesSimposios*100)}% ocupado)`);

    // 3. OCUPACIÓN POR SALA/BLOQUE
    console.log('\n3️⃣  SOBRECAPACIDAD (más de 6 ponencias o más de 1 simposio por sala/bloque)\n');

    const { rows: overcapacity } = await pool.query(`
      SELECT
        scheduled_day,
        room,
        scheduled_time_block,
        event_type,
        COUNT(*) as total
      FROM events
      WHERE scheduled_day IN ('martes 14 de octubre', 'miércoles 15 de octubre')
        AND room IS NOT NULL
        AND scheduled_time_block IS NOT NULL
      GROUP BY scheduled_day, room, scheduled_time_block, event_type
      HAVING
        (event_type = 'ponencia' AND COUNT(*) > 6) OR
        (event_type = 'simposio' AND COUNT(*) > 1)
      ORDER BY scheduled_day, room::integer, scheduled_time_block
    `);

    if (overcapacity.length > 0) {
      overcapacity.forEach(row => {
        console.log(`  ⚠️ Sala ${row.room} - ${row.scheduled_time_block}`);
        console.log(`     ${row.event_type}: ${row.total} eventos`);
      });
    } else {
      console.log('  ✅ No hay sobrecapacidad');
    }

    // 4. RANGO DE SALAS USADAS
    console.log('\n4️⃣  RANGO DE SALAS UTILIZADAS\n');

    const { rows: roomRange } = await pool.query(`
      SELECT
        scheduled_day,
        MIN(room::integer) as min_sala,
        MAX(room::integer) as max_sala,
        COUNT(DISTINCT room) as salas_distintas
      FROM events
      WHERE scheduled_day IN ('martes 14 de octubre', 'miércoles 15 de octubre')
        AND room IS NOT NULL
      GROUP BY scheduled_day
      ORDER BY scheduled_day
    `);

    roomRange.forEach(row => {
      console.log(`  ${row.scheduled_day}:`);
      console.log(`    Rango: Sala ${row.min_sala} - Sala ${row.max_sala}`);
      console.log(`    Total salas distintas: ${row.salas_distintas}`);
    });

    // 5. EVENTOS EN SALAS INCORRECTAS
    console.log('\n5️⃣  CONFLICTOS DE UBICACIÓN\n');

    // Simposios fuera de salas U-
    const { rows: simposiosIncorrectos } = await pool.query(`
      SELECT scheduled_day, COUNT(*) as total
      FROM events
      WHERE event_type = 'simposio'
        AND (
          (scheduled_day = 'martes 14 de octubre' AND room::integer NOT BETWEEN 22 AND 32) OR
          (scheduled_day = 'miércoles 15 de octubre' AND room::integer NOT BETWEEN 16 AND 26)
        )
      GROUP BY scheduled_day
    `);

    if (simposiosIncorrectos.length > 0) {
      simposiosIncorrectos.forEach(row => {
        console.log(`  ⚠️ ${row.scheduled_day}: ${row.total} simposios en salas incorrectas`);
      });
    } else {
      console.log('  ✅ Todos los simposios están en salas U-');
    }

    // Ponencias en salas U-
    const { rows: ponenciasEnU } = await pool.query(`
      SELECT scheduled_day, COUNT(*) as total
      FROM events
      WHERE event_type = 'ponencia'
        AND (
          (scheduled_day = 'martes 14 de octubre' AND room::integer BETWEEN 22 AND 32) OR
          (scheduled_day = 'miércoles 15 de octubre' AND room::integer BETWEEN 16 AND 26)
        )
      GROUP BY scheduled_day
    `);

    if (ponenciasEnU.length > 0) {
      ponenciasEnU.forEach(row => {
        console.log(`  ⚠️ ${row.scheduled_day}: ${row.total} ponencias en salas U- (deberían estar en regulares)`);
      });
    } else {
      console.log('  ✅ No hay ponencias en salas U-');
    }

    // 6. SIMPOSIOS MEZCLADOS CON PONENCIAS (ya lo sabemos)
    console.log('\n6️⃣  SIMPOSIOS MEZCLADOS CON PONENCIAS\n');

    const { rows: mixedSlots } = await pool.query(`
      WITH slot_types AS (
        SELECT
          scheduled_day,
          room,
          scheduled_time_block,
          COUNT(CASE WHEN event_type = 'simposio' THEN 1 END) as simposios,
          COUNT(CASE WHEN event_type = 'ponencia' THEN 1 END) as ponencias
        FROM events
        WHERE scheduled_day IN ('martes 14 de octubre', 'miércoles 15 de octubre')
          AND room IS NOT NULL
          AND scheduled_time_block IS NOT NULL
        GROUP BY scheduled_day, room, scheduled_time_block
      )
      SELECT scheduled_day, COUNT(*) as slots_mixtos, SUM(ponencias) as total_ponencias_afectadas
      FROM slot_types
      WHERE simposios > 0 AND ponencias > 0
      GROUP BY scheduled_day
    `);

    if (mixedSlots.length > 0) {
      mixedSlots.forEach(row => {
        console.log(`  ⚠️ ${row.scheduled_day}: ${row.slots_mixtos} salas/bloques con mezcla`);
        console.log(`     Total ponencias a mover: ${row.total_ponencias_afectadas}`);
      });
    } else {
      console.log('  ✅ No hay simposios mezclados con ponencias');
    }

    // RESUMEN FINAL
    console.log('\n' + '='.repeat(80));
    console.log('📋 RESUMEN Y RECOMENDACIONES\n');

    const totalConflictos =
      (simposiosIncorrectos.reduce((sum, r) => sum + parseInt(r.total), 0)) +
      (ponenciasEnU.reduce((sum, r) => sum + parseInt(r.total), 0)) +
      (mixedSlots.reduce((sum, r) => sum + parseInt(r.total_ponencias_afectadas), 0));

    console.log(`Total de eventos con conflictos: ${totalConflictos}`);

    if (martesPonencias > capacidadMartesPonencias || miercolesPonencias > capacidadMiercolesPonencias) {
      console.log('\n⚠️ NECESITAMOS MÁS SALAS:');
      if (martesPonencias > capacidadMartesPonencias) {
        const deficit = martesPonencias - capacidadMartesPonencias;
        const salasExtra = Math.ceil(deficit / (5 * 6));
        console.log(`  Martes: ${salasExtra} salas adicionales`);
      }
      if (miercolesPonencias > capacidadMiercolesPonencias) {
        const deficit = miercolesPonencias - capacidadMiercolesPonencias;
        const salasExtra = Math.ceil(deficit / (4 * 6));
        console.log(`  Miércoles: ${salasExtra} salas adicionales`);
      }
    } else {
      console.log('\n✅ HAY CAPACIDAD SUFICIENTE con las salas actuales');
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar
if (require.main === module) {
  analyzeCapacity()
    .then(() => {
      console.log('\n✅ Análisis completado.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

module.exports = analyzeCapacity;
