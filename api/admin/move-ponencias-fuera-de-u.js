require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// Importar mapeo de salas (convertir a CommonJS)
const fs = require('fs');
const path = require('path');
const roomMapPath = path.join(__dirname, '../../src/js/detailed-room-map.js');
const roomMapContent = fs.readFileSync(roomMapPath, 'utf8');

// Extraer el roomMap del archivo (simple parsing)
const roomMapMatch = roomMapContent.match(/export const roomMap = ({[\s\S]*?});/);
const roomMap = eval(`(${roomMapMatch[1]})`);

/**
 * Verificar si una sala está disponible en un horario específico
 * IMPORTANTE: Verifica que TODO el bloque de 100 minutos quepa dentro del turno de la sala
 */
function isSalaDisponible(sala, dia, bloque) {
  const diaKey = dia === 'martes 14 de octubre' ? '14/10' : '15/10';
  const dayRooms = roomMap[diaKey];

  if (!dayRooms || !dayRooms[sala]) return false;

  // Extraer inicio y fin del bloque de horario
  const [bloqueStart, bloqueEnd] = bloque.split(' - ');

  // Convertir inicio del bloque a minutos
  const [blockStartHour, blockStartMinute] = bloqueStart.split(':').map(Number);
  const blockStartInMinutes = blockStartHour * 60 + blockStartMinute;

  // Convertir fin del bloque a minutos
  const [blockEndHour, blockEndMinute] = bloqueEnd.split(':').map(Number);
  const blockEndInMinutes = blockEndHour * 60 + blockEndMinute;

  // Buscar una sala física que cubra TODO el bloque (100 minutos)
  for (const room of dayRooms[sala]) {
    const [startHour, startMinute] = room.inicio.split(':').map(Number);
    const [endHour, endMinute] = room.fin.split(':').map(Number);

    const roomStartInMinutes = startHour * 60 + startMinute;
    const roomEndInMinutes = endHour * 60 + endMinute;

    // Verificar que TANTO el inicio COMO el fin del bloque estén dentro del turno de la sala
    if (blockStartInMinutes >= roomStartInMinutes && blockEndInMinutes <= roomEndInMinutes) {
      return true;
    }
  }

  return false;
}

/**
 * Mover ponencias que están en salas U- a salas regulares
 */

async function movePonenciasFueraDeU() {
  console.log('🔄 Moviendo ponencias fuera de salas U-...\n');

  try {
    // MARTES: Ponencias en salas 22-32 → Mover a salas 1-21
    console.log('📅 MARTES 14/10');
    const { rows: ponenciasMartes } = await pool.query(`
      SELECT id, room, scheduled_time_block, event_type
      FROM events
      WHERE scheduled_day = 'martes 14 de octubre'
        AND event_type != 'simposio'
        AND room::integer BETWEEN 22 AND 32
      ORDER BY scheduled_time_block, room::integer
    `);

    console.log(`📊 Ponencias del martes en salas U-: ${ponenciasMartes.length}`);

    // Obtener capacidad actual de TODAS las salas del martes (1-32)
    const { rows: capacidadMartes } = await pool.query(`
      SELECT room, scheduled_time_block, COUNT(*) as ocupados,
             MAX(CASE WHEN event_type = 'simposio' THEN 1 ELSE 0 END) as tiene_simposio
      FROM events
      WHERE scheduled_day = 'martes 14 de octubre'
        AND room::integer BETWEEN 1 AND 32
      GROUP BY room, scheduled_time_block
    `);

    const ocupacionMartes = new Map();
    const simposiosMartes = new Set();

    capacidadMartes.forEach(row => {
      const key = `${row.room}-${row.scheduled_time_block}`;
      ocupacionMartes.set(key, parseInt(row.ocupados));

      // Marcar salas que tienen simposios (NO pueden recibir ponencias)
      if (row.tiene_simposio === 1) {
        simposiosMartes.add(key);
      }
    });

    // Mover ponencias del martes
    let movidosMartes = 0;
    let errorMartes = 0;

    for (const ponencia of ponenciasMartes) {
      let salaAsignada = null;

      // Buscar sala disponible en TODAS las salas (1-32)
      // Primero intentar salas regulares (1-21), luego U- si es necesario (22-32)
      for (let sala = 1; sala <= 32; sala++) {
        const key = `${sala}-${ponencia.scheduled_time_block}`;
        const ocupados = ocupacionMartes.get(key) || 0;

        // IMPORTANTE: No poner ponencias en salas con simposios
        if (simposiosMartes.has(key)) {
          continue; // Saltar esta sala, tiene un simposio
        }

        // Verificar disponibilidad horaria y capacidad (máximo 6 ponencias)
        if (ocupados < 6 && isSalaDisponible(sala.toString(), 'martes 14 de octubre', ponencia.scheduled_time_block)) {
          salaAsignada = sala;
          ocupacionMartes.set(key, ocupados + 1);
          break;
        }
      }

      if (salaAsignada) {
        await pool.query(`
          UPDATE events
          SET room = $1
          WHERE id = $2
        `, [salaAsignada, ponencia.id]);

        if (movidosMartes < 20) {
          console.log(`  ✅ ${ponencia.id}: Sala ${ponencia.room} → ${salaAsignada} (${ponencia.scheduled_time_block})`);
        }
        movidosMartes++;
      } else {
        console.log(`  ⚠️ ${ponencia.id}: No hay espacio disponible`);
        errorMartes++;
      }
    }

    if (movidosMartes > 20) {
      console.log(`  ... y ${movidosMartes - 20} más`);
    }

    console.log(`\n✅ Martes: ${movidosMartes} movidos, ${errorMartes} sin espacio\n`);

    // MIÉRCOLES: Ponencias en salas 16-26 → Mover a salas 1-15
    console.log('📅 MIÉRCOLES 15/10');
    const { rows: ponenciasMiercoles } = await pool.query(`
      SELECT id, room, scheduled_time_block, event_type
      FROM events
      WHERE scheduled_day = 'miércoles 15 de octubre'
        AND event_type != 'simposio'
        AND room::integer BETWEEN 16 AND 26
      ORDER BY scheduled_time_block, room::integer
    `);

    console.log(`📊 Ponencias del miércoles en salas U-: ${ponenciasMiercoles.length}`);

    // Obtener capacidad actual de TODAS las salas del miércoles (1-26)
    const { rows: capacidadMiercoles } = await pool.query(`
      SELECT room, scheduled_time_block, COUNT(*) as ocupados,
             MAX(CASE WHEN event_type = 'simposio' THEN 1 ELSE 0 END) as tiene_simposio
      FROM events
      WHERE scheduled_day = 'miércoles 15 de octubre'
        AND room::integer BETWEEN 1 AND 26
      GROUP BY room, scheduled_time_block
    `);

    const ocupacionMiercoles = new Map();
    const simposiosMiercoles = new Set();

    capacidadMiercoles.forEach(row => {
      const key = `${row.room}-${row.scheduled_time_block}`;
      ocupacionMiercoles.set(key, parseInt(row.ocupados));

      // Marcar salas que tienen simposios (NO pueden recibir ponencias)
      if (row.tiene_simposio === 1) {
        simposiosMiercoles.add(key);
      }
    });

    // Mover ponencias del miércoles
    let movidosMiercoles = 0;
    let errorMiercoles = 0;

    for (const ponencia of ponenciasMiercoles) {
      let salaAsignada = null;

      // Buscar sala disponible en TODAS las salas (1-26)
      // Primero intentar salas regulares (1-15), luego U- si es necesario (16-26)
      for (let sala = 1; sala <= 26; sala++) {
        const key = `${sala}-${ponencia.scheduled_time_block}`;
        const ocupados = ocupacionMiercoles.get(key) || 0;

        // IMPORTANTE: No poner ponencias en salas con simposios
        if (simposiosMiercoles.has(key)) {
          continue; // Saltar esta sala, tiene un simposio
        }

        // Verificar disponibilidad horaria y capacidad (máximo 6 ponencias)
        if (ocupados < 6 && isSalaDisponible(sala.toString(), 'miércoles 15 de octubre', ponencia.scheduled_time_block)) {
          salaAsignada = sala;
          ocupacionMiercoles.set(key, ocupados + 1);
          break;
        }
      }

      if (salaAsignada) {
        await pool.query(`
          UPDATE events
          SET room = $1
          WHERE id = $2
        `, [salaAsignada, ponencia.id]);

        if (movidosMiercoles < 20) {
          console.log(`  ✅ ${ponencia.id}: Sala ${ponencia.room} → ${salaAsignada} (${ponencia.scheduled_time_block})`);
        }
        movidosMiercoles++;
      } else {
        console.log(`  ⚠️ ${ponencia.id}: No hay espacio disponible`);
        errorMiercoles++;
      }
    }

    if (movidosMiercoles > 20) {
      console.log(`  ... y ${movidosMiercoles - 20} más`);
    }

    console.log(`\n✅ Miércoles: ${movidosMiercoles} movidos, ${errorMiercoles} sin espacio\n`);

    // Resumen final
    console.log('='.repeat(60));
    console.log('📊 RESUMEN FINAL');
    console.log('='.repeat(60));
    console.log(`Total movidos: ${movidosMartes + movidosMiercoles}`);
    console.log(`Total sin espacio: ${errorMartes + errorMiercoles}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar
if (require.main === module) {
  movePonenciasFueraDeU()
    .then(() => {
      console.log('\n✅ Script completado.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

module.exports = movePonenciasFueraDeU;
