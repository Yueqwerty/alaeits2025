require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// Eventos a programar por sala objetivo
const eventsBySala = {
  5: ['P350', 'P232', 'P380', 'E610', 'E499', 'E405'],
  6: ['P561', 'E218', 'E399', 'P574', 'P199', 'E336'],
  7: ['E446', 'P300', 'E83', 'E266', 'P281', 'P460'],
  8: ['E367', 'E169', 'P205', 'P542', 'P329', 'E647'],
  10: ['E174', 'P412', 'E440', 'P443', 'E147', 'P238'],
  11: ['E532', 'E356', 'E267', 'E341', 'E627'],
  12: ['E557', 'E639', 'E66', 'P378', 'Z74', 'z17'],
  14: ['E422', 'E577', 'P66', 'H14', 'E590', 'P130', 'O31', 'E71', 'E521']
};

async function findAvailableSlots() {
  try {
    console.log('🔍 Buscando espacios disponibles en martes...\n');

    // Obtener todos los slots del martes con su capacidad actual
    const { rows: occupiedSlots } = await pool.query(`
      SELECT
        room,
        scheduled_time_block,
        COUNT(*) as count
      FROM events
      WHERE scheduled_day = 'martes 14 de octubre'
        AND status = 'publicado'
        AND event_type != 'discusion'
      GROUP BY room, scheduled_time_block
      ORDER BY room, scheduled_time_block
    `);

    console.log('📊 Ocupación actual del martes:');
    occupiedSlots.forEach(slot => {
      console.log(`  Sala ${slot.room} - ${slot.scheduled_time_block}: ${slot.count} eventos`);
    });

    // Obtener info de simposios para evitar esos bloques
    const { rows: simposioBlocks } = await pool.query(`
      SELECT DISTINCT room, scheduled_time_block
      FROM events
      WHERE scheduled_day = 'martes 14 de octubre'
        AND status = 'publicado'
        AND event_type = 'simposio'
    `);

    const simposioSet = new Set(
      simposioBlocks.map(s => `${s.room}-${s.scheduled_time_block}`)
    );

    console.log('\n🚫 Bloques con simposios (no usar):');
    simposioBlocks.forEach(s => {
      console.log(`  Sala ${s.room} - ${s.scheduled_time_block}`);
    });

    // Identificar slots disponibles (menos de 6 eventos y sin simposios)
    const timeBlocks = ['9:00 - 11:00', '11:30 - 13:30', '15:00 - 17:00', '17:30 - 19:30'];
    const availableSlots = [];

    for (let room = 1; room <= 15; room++) {
      for (const timeBlock of timeBlocks) {
        const slotKey = `${room}-${timeBlock}`;

        // Saltar si hay simposio
        if (simposioSet.has(slotKey)) continue;

        const occupied = occupiedSlots.find(
          s => s.room === room.toString() && s.scheduled_time_block === timeBlock
        );

        const count = occupied ? parseInt(occupied.count) : 0;

        if (count < 6) {
          availableSlots.push({
            room: room.toString(),
            timeBlock,
            currentCount: count,
            availableSpace: 6 - count
          });
        }
      }
    }

    console.log('\n✅ Slots disponibles (con espacio):');
    availableSlots.forEach(slot => {
      console.log(`  Sala ${slot.room} - ${slot.timeBlock}: ${slot.availableSpace} espacios libres`);
    });

    return availableSlots;

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

async function searchEvents() {
  try {
    const allIds = Object.values(eventsBySala).flat();

    console.log('\n\n🔎 Buscando eventos por ID...\n');

    const placeholders = allIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: events } = await pool.query(
      `SELECT id, title, scheduled_day, scheduled_time_block, room, status, event_type
       FROM events
       WHERE id IN (${placeholders})`,
      allIds
    );

    console.log(`📋 Encontrados ${events.length} de ${allIds.length} eventos\n`);

    // Mostrar cuáles están programados y cuáles no (incluyendo borradores)
    const scheduled = events.filter(e => e.scheduled_day && e.scheduled_time_block && e.room && e.status === 'publicado');
    const drafts = events.filter(e => e.status === 'borrador');
    const unscheduled = events.filter(e => !e.scheduled_day || !e.scheduled_time_block || !e.room || e.status === 'borrador');

    console.log(`✅ Ya programados (publicado): ${scheduled.length}`);
    scheduled.forEach(e => {
      console.log(`  ${e.id}: ${e.scheduled_day} - ${e.scheduled_time_block} - Sala ${e.room}`);
    });

    console.log(`\n📝 En borrador: ${drafts.length}`);
    drafts.forEach(e => {
      const loc = e.scheduled_day ? `${e.scheduled_day} - ${e.scheduled_time_block} - Sala ${e.room}` : 'sin programar';
      console.log(`  ${e.id}: ${loc}`);
    });

    console.log(`\n⏳ Sin programar o en borrador: ${unscheduled.length}`);
    unscheduled.forEach(e => {
      const title = e.title || e.titulo || 'Sin título';
      console.log(`  ${e.id}: ${title.substring(0, 60)}...`);
    });

    // Mostrar IDs que no se encontraron
    const foundIds = new Set(events.map(e => e.id));
    const notFound = allIds.filter(id => !foundIds.has(id));

    if (notFound.length > 0) {
      console.log(`\n❌ No encontrados en DB (${notFound.length}):`);
      notFound.forEach(id => console.log(`  ${id}`));
    }

    return { events, scheduled, unscheduled, notFound };

  } catch (error) {
    console.error('❌ Error buscando eventos:', error);
    throw error;
  }
}

async function scheduleEvents(availableSlots, unscheduled) {
  try {
    console.log('\n\n📅 Iniciando programación de eventos...\n');

    let updates = [];
    let slotIndex = 0;
    let turnOrders = {}; // Para trackear el turn_order por slot

    // Agrupar eventos sin programar por sala objetivo
    for (const [targetSala, eventIds] of Object.entries(eventsBySala)) {
      const eventsToSchedule = unscheduled.filter(e => eventIds.includes(e.id));

      console.log(`\n🎯 Sala objetivo ${targetSala}: ${eventsToSchedule.length} eventos`);

      for (const event of eventsToSchedule) {
        // Buscar slot disponible con preferencia por la sala objetivo
        let slot = availableSlots.find(
          s => s.room === targetSala && s.availableSpace > 0
        );

        // Si la sala objetivo no tiene espacio, buscar cualquier otra
        if (!slot) {
          slot = availableSlots.find(s => s.availableSpace > 0);
        }

        if (!slot) {
          console.log(`  ⚠️  ${event.id}: No hay slots disponibles`);
          continue;
        }

        // Calcular turn_order para este slot
        const slotKey = `${slot.room}-${slot.timeBlock}`;
        if (!turnOrders[slotKey]) {
          turnOrders[slotKey] = slot.currentCount; // Empezar desde la cuenta actual
        }
        const turnOrder = turnOrders[slotKey];
        turnOrders[slotKey]++;

        updates.push({
          id: event.id,
          room: slot.room,
          timeBlock: slot.timeBlock,
          turnOrder
        });

        console.log(`  ✓ ${event.id} → Sala ${slot.room} - ${slot.timeBlock} (turno ${turnOrder})`);

        // Actualizar disponibilidad
        slot.availableSpace--;
        slot.currentCount++;
      }
    }

    console.log(`\n📊 Total de actualizaciones a realizar: ${updates.length}`);

    if (updates.length === 0) {
      console.log('⚠️  No hay eventos para actualizar');
      return;
    }

    // Confirmar antes de actualizar
    console.log('\n⚠️  ¿Proceder con las actualizaciones? Revisa el log arriba.');
    console.log('Para aplicar los cambios, ejecuta: node api/admin/schedule-missing-events.js apply\n');

    if (process.argv.includes('apply')) {
      console.log('💾 Aplicando cambios a la base de datos...\n');

      for (const update of updates) {
        await pool.query(
          `UPDATE events
           SET scheduled_day = $1,
               scheduled_time_block = $2,
               room = $3,
               turn_order = $4,
               status = 'publicado'
           WHERE id = $5`,
          ['martes 14 de octubre', update.timeBlock, update.room, update.turnOrder, update.id]
        );
        console.log(`  ✓ ${update.id} actualizado`);
      }

      console.log('\n✅ Todos los eventos han sido programados exitosamente!');
    }

  } catch (error) {
    console.error('❌ Error programando eventos:', error);
    throw error;
  }
}

async function main() {
  try {
    const availableSlots = await findAvailableSlots();
    const { events, scheduled, unscheduled, notFound } = await searchEvents();

    if (unscheduled.length > 0) {
      await scheduleEvents(availableSlots, unscheduled);
    } else {
      console.log('\n✅ Todos los eventos ya están programados!');
    }

  } catch (error) {
    console.error('❌ Error fatal:', error);
  } finally {
    await pool.end();
  }
}

main();
