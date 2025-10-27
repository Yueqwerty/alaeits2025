require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { getRoomCapacity } = require('./room-capacity-helper');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// Importar mapeo de salas
const roomMapPath = path.join(__dirname, '../../src/js/detailed-room-map.js');
const roomMapContent = fs.readFileSync(roomMapPath, 'utf8');
const roomMapMatch = roomMapContent.match(/export const roomMap = ({[\s\S]*?});/);
const roomMap = eval(`(${roomMapMatch[1]})`);

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

function isSimposioRoom(roomNum, diaKey) {
  return diaKey === '14/10' ? roomNum >= 22 && roomNum <= 32 : roomNum >= 16 && roomNum <= 26;
}

async function analyzeAllConflicts() {
  try {
    console.log('\n========================================');
    console.log('ANÁLISIS COMPLETO DE TODOS LOS CONFLICTOS');
    console.log('========================================\n');

    // Traer TODOS los eventos programados (ponencias y simposios)
    const { rows: allEvents } = await pool.query(`
      SELECT id, title, room, scheduled_time_block, event_type, scheduled_day
      FROM events
      WHERE scheduled_day IN ('martes 14 de octubre', 'miércoles 15 de octubre')
        AND room IS NOT NULL
        AND scheduled_time_block IS NOT NULL
      ORDER BY scheduled_day, scheduled_time_block, room, event_type
    `);

    const ponencias = allEvents.filter(e => e.event_type === 'ponencia');
    const simposios = allEvents.filter(e => e.event_type === 'simposio');

    console.log(`Total eventos programados: ${allEvents.length}`);
    console.log(`  - Ponencias: ${ponencias.length}`);
    console.log(`  - Simposios: ${simposios.length}\n`);

    // CONFLICTO TIPO 1: Ponencias en salas de simposio
    console.log('=== CONFLICTO TIPO 1: Ponencias en salas reservadas para simposios ===');
    let ponenciasEnSalasSimposio = [];
    for (const p of ponencias) {
      const diaKey = p.scheduled_day === 'martes 14 de octubre' ? '14/10' : '15/10';
      const roomNum = parseInt(p.room);
      if (isSimposioRoom(roomNum, diaKey)) {
        ponenciasEnSalasSimposio.push(p);
        console.log(`❌ Ponencia ${p.id} en sala U-${p.room} (${p.scheduled_day}, ${p.scheduled_time_block})`);
      }
    }
    console.log(`Total: ${ponenciasEnSalasSimposio.length} ponencias en salas de simposio\n`);

    // CONFLICTO TIPO 2: Ponencias mezcladas con simposios en la misma sala/bloque
    console.log('=== CONFLICTO TIPO 2: Ponencias mezcladas con simposios (mismo slot) ===');
    const simposioSlots = new Set();
    simposios.forEach(s => {
      simposioSlots.add(`${s.scheduled_day}-${s.room}-${s.scheduled_time_block}`);
    });

    let ponenciasMezcladasConSimposio = [];
    for (const p of ponencias) {
      const slotKey = `${p.scheduled_day}-${p.room}-${p.scheduled_time_block}`;
      if (simposioSlots.has(slotKey)) {
        ponenciasMezcladasConSimposio.push(p);
        console.log(`❌ Ponencia ${p.id} mezclada con simposio en sala ${p.room} (${p.scheduled_day}, ${p.scheduled_time_block})`);
      }
    }
    console.log(`Total: ${ponenciasMezcladasConSimposio.length} ponencias mezcladas con simposios\n`);

    // CONFLICTO TIPO 3: Horarios incompatibles
    console.log('=== CONFLICTO TIPO 3: Eventos en horarios incompatibles con disponibilidad de sala ===');
    let eventosHorarioIncompatible = [];
    for (const event of allEvents) {
      if (!isSalaDisponible(event.room, event.scheduled_day, event.scheduled_time_block)) {
        eventosHorarioIncompatible.push(event);
        const title = event.title?.es || event.title?.en || 'Sin título';
        console.log(`❌ ${event.event_type.toUpperCase()} ${event.id}: "${title.substring(0, 50)}" en sala ${event.room} (${event.scheduled_day}, ${event.scheduled_time_block})`);
      }
    }
    console.log(`Total: ${eventosHorarioIncompatible.length} eventos con horario incompatible\n`);

    // CONFLICTO TIPO 4: Sobrecarga de salas (capacidad dinámica)
    console.log('=== CONFLICTO TIPO 4: Sobrecarga de salas (excede capacidad dinámica) ===');
    const slotCounts = {};
    ponencias.forEach(p => {
      const key = `${p.scheduled_day}-${p.room}-${p.scheduled_time_block}`;
      if (!slotCounts[key]) {
        slotCounts[key] = { count: 0, events: [], room: p.room, day: p.scheduled_day };
      }
      slotCounts[key].count++;
      slotCounts[key].events.push(p);
    });

    let ponenciasSobrecarga = [];
    for (const key in slotCounts) {
      const slot = slotCounts[key];
      const roomNum = parseInt(slot.room);
      const maxCapacity = getRoomCapacity(slot.day, roomNum);

      if (slot.count > maxCapacity) {
        console.log(`❌ Sala ${slot.room} en ${key}: ${slot.count} ponencias (máx: ${maxCapacity})`);
        const excess = slot.events.slice(maxCapacity);
        ponenciasSobrecarga.push(...excess);
        excess.forEach(e => {
          console.log(`   → Ponencia ${e.id} (excedente)`);
        });
      }
    }
    console.log(`Total: ${ponenciasSobrecarga.length} ponencias en sobrecarga\n`);

    // CONFLICTO TIPO 5: Simposios en salas regulares
    console.log('=== CONFLICTO TIPO 5: Simposios en salas NO reservadas para simposios ===');
    let simposiosEnSalasRegulares = [];
    for (const s of simposios) {
      const diaKey = s.scheduled_day === 'martes 14 de octubre' ? '14/10' : '15/10';
      const roomNum = parseInt(s.room);
      if (!isSimposioRoom(roomNum, diaKey)) {
        simposiosEnSalasRegulares.push(s);
        console.log(`❌ Simposio ${s.id} en sala regular ${s.room} (${s.scheduled_day}, ${s.scheduled_time_block})`);
      }
    }
    console.log(`Total: ${simposiosEnSalasRegulares.length} simposios en salas regulares\n`);

    // Resumen
    const totalConflictos = new Set([
      ...ponenciasEnSalasSimposio.map(p => p.id),
      ...ponenciasMezcladasConSimposio.map(p => p.id),
      ...eventosHorarioIncompatible.map(e => e.id),
      ...ponenciasSobrecarga.map(p => p.id),
      ...simposiosEnSalasRegulares.map(s => s.id)
    ]).size;

    console.log('\n========================================');
    console.log('RESUMEN TOTAL');
    console.log('========================================');
    console.log(`Eventos únicos con conflictos: ${totalConflictos}`);
    console.log(`Tipo 1 - Ponencias en salas simposio: ${ponenciasEnSalasSimposio.length}`);
    console.log(`Tipo 2 - Mezcladas con simposios: ${ponenciasMezcladasConSimposio.length}`);
    console.log(`Tipo 3 - Horarios incompatibles: ${eventosHorarioIncompatible.length}`);
    console.log(`Tipo 4 - Sobrecarga: ${ponenciasSobrecarga.length}`);
    console.log(`Tipo 5 - Simposios en salas regulares: ${simposiosEnSalasRegulares.length}`);
    console.log('========================================\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

analyzeAllConflicts();
