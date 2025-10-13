require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

const ROOM_CAPACITY = 6;
const TARGET_DAY = 'miércoles 15 de octubre';

// MAPEO DE HORARIOS DE DISPONIBILIDAD POR SALA (INCLUYENDO SALAS U-)
const ROOM_AVAILABILITY = {
  1: { start: '08:00', end: '15:30' },    // C-103
  2: { start: '08:00', end: '15:30' },    // D-103
  3: { start: '08:00', end: '15:30' },    // D-207
  4: { start: '08:00', end: '15:30' },    // D-209
  5: { start: '11:00', end: '14:15' },    // D-307 - DISPONIBILIDAD LIMITADA
  6: { start: '08:00', end: '15:30' },    // B-408
  7: { start: '08:00', end: '15:30' },    // D-202
  8: { start: '08:00', end: '15:30' },    // Sala Licenciatura
  9: { start: '08:15', end: '15:35' },    // Aula C
  10: { start: '08:15', end: '15:35' },   // Aula D
  11: { start: '08:15', end: '15:35' },   // Aula D-406
  12: { start: '08:15', end: '15:35' },   // Aula D-407
  13: { start: '08:30', end: '15:30' },   // Salón Rojo
  14: { start: '08:15', end: '15:30' },   // Sala de Internalización
  15: { start: '08:15', end: '13:30' },   // Híbrida 602 - DISPONIBILIDAD LIMITADA
  // SALAS U- TAMBIÉN DISPONIBLES PARA PONENCIAS
  16: { start: '08:00', end: '15:30' },   // U-102
  17: { start: '08:00', end: '15:30' },   // U-103
  18: { start: '08:00', end: '15:30' },   // U-104
  19: { start: '08:00', end: '15:30' },   // U-105
  20: { start: '08:00', end: '15:30' },   // U-201
  21: { start: '08:00', end: '15:30' },   // U-202
  22: { start: '08:00', end: '15:30' },   // U-301
  23: { start: '08:00', end: '15:30' },   // U-302
  24: { start: '08:00', end: '15:30' },   // U-400
  25: { start: '08:00', end: '15:30' },   // U-Biblioteca
  26: { start: '08:00', end: '15:30' }    // U-Sala de Aprendizaje
};

// Función para convertir tiempo a minutos
function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Función para verificar si un horario es compatible con la sala
function isTimeBlockCompatible(roomNumber, timeBlock) {
  const availability = ROOM_AVAILABILITY[roomNumber];
  if (!availability) return false;

  const [blockStart, blockEnd] = timeBlock.split(' - ');
  const blockStartMinutes = timeToMinutes(blockStart);
  const blockEndMinutes = timeToMinutes(blockEnd);
  const roomStartMinutes = timeToMinutes(availability.start);
  const roomEndMinutes = timeToMinutes(availability.end);

  // El bloque debe estar completamente dentro del horario de disponibilidad
  return blockStartMinutes >= roomStartMinutes && blockEndMinutes <= roomEndMinutes;
}

/**
 * Función principal que analiza y propone movimientos
 */
async function proposeMovements() {
  console.log('\n=== ANALIZANDO CONFLICTOS DEL MIÉRCOLES (INCLUYENDO SALAS U-) ===\n');
  
  try {
    // 1. Buscar SOLO conflictos de horarios incompatibles y sobrecarga
    const { rows: allEvents } = await pool.query(`
      SELECT 
        id,
        room,
        scheduled_time_block,
        COALESCE(title->>'es', title->>'en', 'Sin título') as title
      FROM events
      WHERE scheduled_day = $1
        AND room IS NOT NULL
        AND scheduled_time_block IS NOT NULL
      ORDER BY room, scheduled_time_block, id
    `, [TARGET_DAY]);

    console.log(`📊 Total eventos del miércoles: ${allEvents.length}`);

    // 2. Analizar conflictos por tipo
    const conflicts = {
      overload: new Map(), // Sobrecarga por sala-horario
      wrongTime: [] // Horarios incompatibles
    };

    // Agrupar por sala-horario para detectar sobrecarga
    const slotOccupation = new Map();
    
    for (const event of allEvents) {
      const roomNum = parseInt(event.room);
      const key = `${event.room}-${event.scheduled_time_block}`;
      
      // Inicializar slot si no existe
      if (!slotOccupation.has(key)) {
        slotOccupation.set(key, []);
      }
      slotOccupation.get(key).push(event);

      // Verificar compatibilidad de horarios (TODAS las salas 1-26)
      if (!isTimeBlockCompatible(roomNum, event.scheduled_time_block)) {
        conflicts.wrongTime.push(event);
        console.log(`🚨 Conflicto horario: Evento ${event.id} en Sala ${roomNum} (${event.scheduled_time_block})`);
      }
    }

    // Detectar sobrecarga
    slotOccupation.forEach((events, key) => {
      if (events.length > ROOM_CAPACITY) {
        conflicts.overload.set(key, {
          events: events,
          excess: events.length - ROOM_CAPACITY
        });
      }
    });

    console.log(`🔥 CONFLICTOS DETECTADOS:`);
    console.log(`   - Sobrecarga: ${conflicts.overload.size} slots`);
    console.log(`   - Horarios incompatibles: ${conflicts.wrongTime.length} eventos\n`);

    // 3. Buscar slots disponibles (TODAS las salas 1-26 con horarios compatibles)
    const availableSlots = [];
    
    // Generar todas las combinaciones válidas sala-horario
    for (let roomNum = 1; roomNum <= 26; roomNum++) {
      const timeBlocks = ['08:30 - 10:10', '10:20 - 12:00', '12:10 - 13:50', '14:00 - 15:30'];
      
      for (const timeBlock of timeBlocks) {
        if (isTimeBlockCompatible(roomNum, timeBlock)) {
          availableSlots.push({ room_num: roomNum, time_block: timeBlock });
        }
      }
    }

    // Verificar ocupación actual de los slots disponibles
    const { rows: occupiedSlots } = await pool.query(`
      SELECT 
        CAST(room as INTEGER) as room_num,
        scheduled_time_block as time_block,
        COUNT(*) as count
      FROM events 
      WHERE scheduled_day = $1
        AND room IS NOT NULL 
      GROUP BY room, scheduled_time_block
    `, [TARGET_DAY]);

    // Crear mapa de ocupación
    const occupationMap = new Map();
    occupiedSlots.forEach(slot => {
      const key = `${slot.room_num}-${slot.time_block}`;
      occupationMap.set(key, slot.count);
    });

    // Filtrar slots disponibles (con espacio < 6)
    const validAvailableSlots = availableSlots.filter(slot => {
      const key = `${slot.room_num}-${slot.time_block}`;
      const currentCount = occupationMap.get(key) || 0;
      return currentCount < ROOM_CAPACITY;
    }).map(slot => {
      const key = `${slot.room_num}-${slot.time_block}`;
      return {
        ...slot,
        current_count: occupationMap.get(key) || 0
      };
    }).sort((a, b) => a.current_count - b.current_count); // Ordenar por ocupación

    console.log(`✅ Slots disponibles válidos: ${validAvailableSlots.length}\n`);

    // 4. Generar propuestas de movimiento
    const proposals = [];
    let availableIndex = 0;

    // PRIORIDAD 1: Resolver horarios incompatibles
    console.log('🚨 RESOLVIENDO HORARIOS INCOMPATIBLES...\n');
    conflicts.wrongTime.forEach(event => {
      if (availableIndex >= validAvailableSlots.length) {
        proposals.push({
          type: 'UNSOLVABLE',
          eventId: event.id,
          title: event.title,
          currentRoom: parseInt(event.room),
          currentTimeBlock: event.scheduled_time_block,
          reason: 'Horario incompatible - No hay slots disponibles',
          priority: 1
        });
        return;
      }

      const targetSlot = validAvailableSlots[availableIndex];
      console.log(`📍 Evento ${event.id} (Sala ${event.room}): horario incompatible → Sala ${targetSlot.room_num} (${targetSlot.time_block})`);
      
      proposals.push({
        type: 'MOVE_SINGLE',
        eventId: event.id,
        title: event.title,
        currentRoom: parseInt(event.room),
        currentDay: TARGET_DAY,
        currentTimeBlock: event.scheduled_time_block,
        proposedRoom: targetSlot.room_num,
        day: TARGET_DAY,
        timeBlock: targetSlot.time_block,
        reason: `Horario incompatible con Sala ${event.room}`,
        priority: 1
      });

      // Actualizar disponibilidad
      targetSlot.current_count++;
      if (targetSlot.current_count >= ROOM_CAPACITY) {
        availableIndex++;
      }
    });

    // PRIORIDAD 2: Resolver sobrecarga
    console.log('\n🚨 RESOLVIENDO SOBRECARGA...\n');
    conflicts.overload.forEach((data, slotKey) => {
      const [room, timeBlock] = slotKey.split('-', 2);
      const eventsToMove = data.events.slice(ROOM_CAPACITY); // Últimos eventos
      
      console.log(`📍 Sala ${room} (${timeBlock}): ${data.excess} eventos excedentes`);
      
      eventsToMove.forEach(event => {
        if (availableIndex >= validAvailableSlots.length) {
          proposals.push({
            type: 'UNSOLVABLE',
            eventId: event.id,
            title: event.title,
            currentRoom: parseInt(event.room),
            currentTimeBlock: event.scheduled_time_block,
            reason: 'Sobrecarga - No hay slots disponibles',
            priority: 2
          });
          return;
        }

        const targetSlot = validAvailableSlots[availableIndex];
        console.log(`📍 Evento ${event.id}: Sala ${room} → Sala ${targetSlot.room_num} (${targetSlot.time_block})`);
        
        proposals.push({
          type: 'MOVE_SINGLE',
          eventId: event.id,
          title: event.title,
          currentRoom: parseInt(event.room),
          currentDay: TARGET_DAY,
          currentTimeBlock: event.scheduled_time_block,
          proposedRoom: targetSlot.room_num,
          day: TARGET_DAY,
          timeBlock: targetSlot.time_block,
          reason: `Sobrecarga: ${data.events.length}/${ROOM_CAPACITY}`,
          priority: 2
        });

        // Actualizar disponibilidad
        targetSlot.current_count++;
        if (targetSlot.current_count >= ROOM_CAPACITY) {
          availableIndex++;
        }
      });
    });

    // 5. Resumen
    const successful = proposals.filter(p => p.type === 'MOVE_SINGLE').length;
    const failed = proposals.filter(p => p.type === 'UNSOLVABLE').length;

    console.log(`\n=== RESUMEN FINAL ===`);
    console.log(`Total propuestas: ${proposals.length}`);
    console.log(`Movimientos exitosos: ${successful}`);
    console.log(`Sin solución: ${failed}`);
    console.log(`Slots disponibles usados: ${availableIndex}/${validAvailableSlots.length}`);

    return {
      success: true,
      proposals,
      summary: {
        total: proposals.length,
        successful,
        failed,
        conflictsSolved: {
          overload: conflicts.overload.size,
          wrongTime: conflicts.wrongTime.length
        }
      }
    };

  } catch (error) {
    console.error('❌ Error en proposeMovements:', error);
    throw error;
  }
}

// Resto de funciones igual que antes...
async function applyProposal(proposal) {
  try {
    if (proposal.type === 'MOVE_SINGLE') {
      await pool.query(`
        UPDATE events
        SET room = $1, scheduled_time_block = $2
        WHERE id = $3 AND scheduled_day = $4
      `, [proposal.proposedRoom.toString(), proposal.timeBlock, proposal.eventId, TARGET_DAY]);

      return { success: true, type: 'MOVE_SINGLE', eventId: proposal.eventId };
    } 
    
    if (proposal.type === 'UNSOLVABLE') {
      return { success: false, type: 'UNSOLVABLE', message: 'Sin solución disponible' };
    }

    return { success: false, message: 'Tipo de propuesta desconocido' };

  } catch (error) {
    console.error('❌ Error en applyProposal:', error);
    throw error;
  }
}

async function applyMovement(eventId, newRoom) {
  try {
    await pool.query(`UPDATE events SET room = $1 WHERE id = $2 AND scheduled_day = $3`, [newRoom.toString(), eventId, TARGET_DAY]);
    return { success: true };
  } catch (error) {
    console.error('❌ Error en applyMovement:', error);
    throw error;
  }
}

async function applyAllMovements(proposals) {
  console.log(`\n🔧 Aplicando ${proposals.length} movimientos...`);
  
  const results = [];
  let applied = 0;

  try {
    for (const proposal of proposals) {
      if (proposal.type === 'UNSOLVABLE') {
        console.log(`❌ Saltando evento ${proposal.eventId}: sin solución`);
        results.push({ eventId: proposal.eventId, success: false, reason: 'unsolvable' });
        continue;
      }

      try {
        const result = await applyProposal(proposal);
        
        if (result.success) {
          console.log(`✅ Evento ${proposal.eventId}: Sala ${proposal.currentRoom} → Sala ${proposal.proposedRoom}`);
          applied++;
          results.push({ eventId: proposal.eventId, success: true });
        } else {
          console.log(`❌ Falló evento ${proposal.eventId}: ${result.message}`);
          results.push({ eventId: proposal.eventId, success: false, error: result.message });
        }

      } catch (error) {
        console.error(`❌ Error moviendo evento ${proposal.eventId}:`, error.message);
        results.push({ eventId: proposal.eventId, success: false, error: error.message });
      }
    }

    console.log(`\n✅ Aplicados: ${applied}/${proposals.length}`);

    return { success: true, applied, total: proposals.length, results };

  } catch (error) {
    console.error('❌ Error en applyAllMovements:', error);
    throw error;
  }
}

module.exports = {
  proposeMovements,
  applyProposal,
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
    } catch (error) {
      console.error('Error:', error);
      await pool.end();
      process.exit(1);
    }
  })();
}