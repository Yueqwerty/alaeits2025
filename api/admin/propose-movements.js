require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// Importar mapeo de salas
const roomMapPath = path.join(__dirname, '../../src/js/detailed-room-map.js');
const roomMapContent = fs.readFileSync(roomMapPath, 'utf8');
const roomMapMatch = roomMapContent.match(/export const roomMap = ({[\s\S]*?});/);
const roomMap = eval(`(${roomMapMatch[1]})`);

// Helper para saber si es sala de simposio (salas U-)
function isSimposioRoom(room, diaKey) {
  const roomNum = parseInt(room);
  return diaKey === '14/10' ? roomNum >= 22 && roomNum <= 32 : roomNum >= 16 && roomNum <= 26;
}

/**
 * Verificar si TODO el bloque cabe en el turno de la sala
 */
function isSalaDisponible(sala, dia, bloque) {
  const diaKey = dia === 'martes 14 de octubre' ? '14/10' : '15/10';
  const dayRooms = roomMap[diaKey];

  if (!dayRooms || !dayRooms[sala]) return false;

  const [bloqueStart, bloqueEnd] = bloque.split(' - ');
  const [blockStartHour, blockStartMinute] = bloqueStart.split(':').map(Number);
  const blockStartInMinutes = blockStartHour * 60 + blockStartMinute;
  const [blockEndHour, blockEndMinute] = bloqueEnd.split(':').map(Number);
  const blockEndInMinutes = blockEndHour * 60 + blockEndMinute;

  for (const room of dayRooms[sala]) {
    const [startHour, startMinute] = room.inicio.split(':').map(Number);
    const [endHour, endMinute] = room.fin.split(':').map(Number);
    const roomStartInMinutes = startHour * 60 + startMinute;
    const roomEndInMinutes = endHour * 60 + endMinute;

    if (blockStartInMinutes >= roomStartInMinutes && blockEndInMinutes <= roomEndInMinutes) {
      return true;
    }
  }

  return false;
}

/**
 * Encontrar sala disponible para PONENCIAS únicamente
 * Verifica que no haya simposios en el slot antes de proponer
 */
async function findAvailableRoom(dia, bloque, pool) {
  const diaKey = dia === 'martes 14 de octubre' ? '14/10' : '15/10';

  // Rango de salas para PONENCIAS según día (excluye salas U-)
  const salasRange = diaKey === '14/10' ? [1, 21] : [1, 15];

  // Obtener todas las ocupaciones del slot (ponencias y simposios)
  const { rows: ocupacion } = await pool.query(`
    SELECT room, 
           COUNT(*) FILTER (WHERE event_type = 'ponencia') as ponencias,
           COUNT(*) FILTER (WHERE event_type = 'simposio') as simposios
    FROM events
    WHERE scheduled_day = $1
      AND scheduled_time_block = $2
      AND room::integer BETWEEN $3 AND $4
    GROUP BY room
  `, [dia, bloque, salasRange[0], salasRange[1]]);

  const ocupacionMap = new Map();
  const salasConSimposio = new Set();

  ocupacion.forEach(row => {
    const roomNum = parseInt(row.room);
    ocupacionMap.set(roomNum, parseInt(row.ponencias));
    if (parseInt(row.simposios) > 0) {
      salasConSimposio.add(roomNum);
    }
  });

  // Buscar sala disponible (máximo 6 ponencias por sala/bloque)
  for (let sala = salasRange[0]; sala <= salasRange[1]; sala++) {
    // CRITICO: Si hay simposio en esta sala/bloque, saltarla
    if (salasConSimposio.has(sala)) {
      continue;
    }

    const ocupados = ocupacionMap.get(sala) || 0;

    // Verificar capacidad (máx 6 ponencias) y disponibilidad horaria
    if (ocupados < 6 && isSalaDisponible(sala.toString(), dia, bloque)) {
      return sala;
    }
  }

  return null;
}

/**
 * Analizar conflictos SOLO de PONENCIAS y proponer movimientos
 */
async function proposeMovements() {
  try {
    const proposals = [];
    const processedEvents = new Set();

    // SOLO traer PONENCIAS
    const { rows: allEvents } = await pool.query(`
      SELECT id, title, room, scheduled_time_block, event_type, scheduled_day
      FROM events
      WHERE scheduled_day IN ('martes 14 de octubre', 'miércoles 15 de octubre')
        AND event_type = 'ponencia'
        AND room IS NOT NULL
        AND scheduled_time_block IS NOT NULL
    `);

    console.log(`\nAnalizando ${allEvents.length} ponencias programadas...\n`);

    // Obtener todas las salas/bloques que tienen simposios
    const { rows: simposiosData } = await pool.query(`
      SELECT DISTINCT scheduled_day, room, scheduled_time_block
      FROM events
      WHERE scheduled_day IN ('martes 14 de octubre', 'miércoles 15 de octubre')
        AND event_type = 'simposio'
        AND room IS NOT NULL
        AND scheduled_time_block IS NOT NULL
    `);

    const salasConSimposio = new Set();
    simposiosData.forEach(s => {
      salasConSimposio.add(`${s.scheduled_day}-${s.room}-${s.scheduled_time_block}`);
    });

    // FASE 1: Detectar ponencias mezcladas con simposios
    for (const event of allEvents) {
      if (processedEvents.has(event.id)) continue;

      const slotKey = `${event.scheduled_day}-${event.room}-${event.scheduled_time_block}`;
      
      // CONFLICTO: Ponencia compartiendo sala/bloque con simposio
      if (salasConSimposio.has(slotKey)) {
        const newRoom = await findAvailableRoom(
          event.scheduled_day,
          event.scheduled_time_block,
          pool
        );

        if (newRoom) {
          proposals.push({
            eventId: event.id,
            title: event.title?.es || 'Sin título',
            eventType: event.event_type,
            day: event.scheduled_day,
            timeBlock: event.scheduled_time_block,
            currentRoom: parseInt(event.room),
            proposedRoom: newRoom,
            reason: 'Ponencia mezclada con simposio (los simposios deben ir solos)',
            category: 'mixed_with_simposio'
          });
          processedEvents.add(event.id);
          console.log(`CONFLICTO: Ponencia ${event.id} mezclada con simposio en sala ${event.room} -> Mover a sala ${newRoom}`);
        } else {
          console.log(`ERROR: Ponencia ${event.id} mezclada con simposio en sala ${event.room} -> SIN SALA DISPONIBLE`);
        }
      }
    }

    // FASE 3: Detectar conflictos de disponibilidad horaria
    for (const event of allEvents) {
      if (processedEvents.has(event.id)) continue;

      const roomNum = parseInt(event.room);
      
      // CONFLICTO: Sala no disponible en ese horario
      if (!isSalaDisponible(event.room, event.scheduled_day, event.scheduled_time_block)) {
        const newRoom = await findAvailableRoom(
          event.scheduled_day,
          event.scheduled_time_block,
          pool
        );

        if (newRoom) {
          proposals.push({
            eventId: event.id,
            title: event.title?.es || 'Sin título',
            eventType: event.event_type,
            day: event.scheduled_day,
            timeBlock: event.scheduled_time_block,
            currentRoom: roomNum,
            proposedRoom: newRoom,
            reason: 'El horario de la sala no cubre los 100 minutos del bloque',
            category: 'time_mismatch'
          });
          processedEvents.add(event.id);
          console.log(`CONFLICTO: Ponencia ${event.id} horario incompatible sala ${roomNum} -> Mover a sala ${newRoom}`);
        }
      }
    }

    // FASE 4: Detectar sobrecarga de salas (más de 6 ponencias por sala/bloque)
    const slotCounts = allEvents.reduce((acc, event) => {
      const key = `${event.scheduled_day}-${event.room}-${event.scheduled_time_block}`;
      if (!acc[key]) {
        acc[key] = { count: 0, events: [] };
      }
      acc[key].count++;
      acc[key].events.push(event);
      return acc;
    }, {});

    for (const key in slotCounts) {
      const slot = slotCounts[key];
      
      // CONFLICTO: Más de 6 ponencias en el mismo slot
      if (slot.count > 6) {
        // Dejar las primeras 6, mover el resto
        const eventsToMove = slot.events.slice(6).filter(e => !processedEvents.has(e.id));

        console.log(`SOBRECARGA: ${key} tiene ${slot.count} ponencias (máximo 6)`);

        for (const event of eventsToMove) {
          const newRoom = await findAvailableRoom(
            event.scheduled_day,
            event.scheduled_time_block,
            pool
          );

          if (newRoom) {
            proposals.push({
              eventId: event.id,
              title: event.title?.es || 'Sin título',
              eventType: event.event_type,
              day: event.scheduled_day,
              timeBlock: event.scheduled_time_block,
              currentRoom: parseInt(event.room),
              proposedRoom: newRoom,
              reason: `Sobrecarga: ${slot.count} ponencias en sala ${event.room} (máximo 6)`,
              category: 'overload'
            });
            processedEvents.add(event.id);
            console.log(`  -> Ponencia ${event.id} mover a sala ${newRoom}`);
          }
        }
      }
    }

    // Resumen
    const summary = {
      totalConflicts: proposals.length,
      totalPonenciasAnalyzed: allEvents.length,
      byDay: {
        martes: proposals.filter(p => p.day === 'martes 14 de octubre').length,
        miercoles: proposals.filter(p => p.day === 'miércoles 15 de octubre').length
      },
      byCategory: {
        mixed_with_simposio: proposals.filter(p => p.category === 'mixed_with_simposio').length,
        time_mismatch: proposals.filter(p => p.category === 'time_mismatch').length,
        overload: proposals.filter(p => p.category === 'overload').length
      }
    };

    console.log('\n=== RESUMEN DE CONFLICTOS DE PONENCIAS ===');
    console.log(`Total ponencias analizadas: ${summary.totalPonenciasAnalyzed}`);
    console.log(`Total conflictos detectados: ${summary.totalConflicts}`);
    console.log(`  - Mezcladas con simposios: ${summary.byCategory.mixed_with_simposio}`);
    console.log(`  - Horarios incompatibles: ${summary.byCategory.time_mismatch}`);
    console.log(`  - Sobrecarga de salas: ${summary.byCategory.overload}\n`);

    return {
      success: true,
      summary,
      proposals
    };

  } catch (error) {
    console.error('Error al proponer movimientos:', error);
    throw error;
  }
}

/**
 * Aplicar un movimiento específico
 */
async function applyMovement(eventId, newRoom) {
  try {
    await pool.query(`
      UPDATE events
      SET room = $1
      WHERE id = $2
    `, [newRoom, eventId]);

    return { success: true };
  } catch (error) {
    console.error('Error al aplicar movimiento:', error);
    throw error;
  }
}

/**
 * Aplicar todos los movimientos propuestos
 */
async function applyAllMovements(proposals) {
  try {
    const results = [];

    for (const proposal of proposals) {
      await pool.query(`
        UPDATE events
        SET room = $1
        WHERE id = $2
      `, [proposal.proposedRoom, proposal.eventId]);

      results.push({
        eventId: proposal.eventId,
        success: true
      });
    }

    return {
      success: true,
      applied: results.length,
      results
    };
  } catch (error) {
    console.error('Error al aplicar movimientos:', error);
    throw error;
  }
}

module.exports = {
  proposeMovements,
  applyMovement,
  applyAllMovements
};

// Si se ejecuta directamente
if (require.main === module) {
  (async () => {
    try {
      const result = await proposeMovements();
      console.log('\n=== RESULTADO COMPLETO ===');
      console.log(JSON.stringify(result, null, 2));
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      await pool.end();
      process.exit(1);
    }
  })();
}