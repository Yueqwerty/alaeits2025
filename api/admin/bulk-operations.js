require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { getRoomCapacity } = require('./room-capacity-helper');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Iniciar una transacción para operaciones múltiples
  const client = await pool.connect();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token not provided' });
    }
    
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET);

    const { operation, eventIds, data } = req.body;

    // Para move_slot no necesitamos eventIds, solo operation y data
    if (!operation) {
      return res.status(400).json({ message: 'Operation is required' });
    }

    // Validaciones específicas para move_slot vs otras operaciones
    if (operation === 'move_slot') {
      if (!data || !data.source || !data.destination) {
        return res.status(400).json({ message: 'Source and destination are required for move_slot' });
      }
    } else {
      if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
        return res.status(400).json({ message: 'Event IDs are required for this operation' });
      }
    }

    // Validar que los IDs existan antes de hacer la operación (solo para operaciones que no sean move_slot)
    if (operation !== 'move_slot') {
      const existingEvents = await client.query(
        'SELECT id FROM events WHERE id = ANY($1)',
        [eventIds]
      );

      if (existingEvents.rows.length !== eventIds.length) {
        return res.status(400).json({
          message: 'Some event IDs do not exist',
          found: existingEvents.rows.length,
          requested: eventIds.length
        });
      }
    }

    await client.query('BEGIN');
    let result;

    switch (operation) {
      case 'move_to_draft':
        result = await client.query(`
          UPDATE events 
          SET status = 'borrador',
              scheduled_day = NULL,
              scheduled_time_block = NULL,
              room = NULL,
              turn_order = NULL,
              updated_at = NOW()
          WHERE id = ANY($1)
          RETURNING id, title, status
        `, [eventIds]);
        break;

      case 'publish_events':
        result = await client.query(`
          UPDATE events 
          SET status = 'publicado',
              updated_at = NOW()
          WHERE id = ANY($1) AND status = 'borrador'
          RETURNING id, title, status
        `, [eventIds]);
        break;

      case 'delete_events':
        result = await client.query(`
          DELETE FROM events 
          WHERE id = ANY($1)
          RETURNING id, title
        `, [eventIds]);
        break;

      case 'update_type':
        if (!data.event_type || !['ponencia', 'simposio'].includes(data.event_type)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: 'Valid event type is required (ponencia or simposio)' 
          });
        }
        result = await client.query(`
          UPDATE events 
          SET event_type = $1, updated_at = NOW()
          WHERE id = ANY($2)
          RETURNING id, title, event_type
        `, [data.event_type, eventIds]);
        break;

      case 'assign_day':
        if (!data.scheduled_day) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Scheduled day is required' });
        }
        
        // Validar que el día sea válido
        const validDays = ['martes 14 de octubre', 'miércoles 15 de octubre'];
        if (!validDays.includes(data.scheduled_day)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: 'Invalid scheduled day',
            validDays 
          });
        }

        result = await client.query(`
          UPDATE events 
          SET scheduled_day = $1,
              status = 'publicado',
              updated_at = NOW()
          WHERE id = ANY($2)
          RETURNING id, title, scheduled_day, status
        `, [data.scheduled_day, eventIds]);
        break;

      case 'assign_room':
        if (!data.room || !data.scheduled_time_block || !data.scheduled_day) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: 'Room, time block, and day are required' 
          });
        }

        const roomNumber = parseInt(data.room);
        if (roomNumber < 1 || roomNumber > 30) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: 'Room must be between 1 and 30' 
          });
        }

        // Verificar capacidad del slot - usar capacidad dinámica
        const maxCapacity = getRoomCapacity(data.scheduled_day, roomNumber);

        const currentCapacity = await client.query(`
          SELECT COUNT(*) as count
          FROM events
          WHERE scheduled_day = $1
            AND scheduled_time_block = $2
            AND room = $3
            AND status = 'publicado'
        `, [data.scheduled_day, data.scheduled_time_block, roomNumber]);

        if (parseInt(currentCapacity.rows[0].count) + eventIds.length > maxCapacity) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: `Room ${roomNumber} would exceed capacity (max ${maxCapacity} events per slot)`,
            currentCapacity: parseInt(currentCapacity.rows[0].count),
            trying_to_add: eventIds.length,
            max_capacity: maxCapacity
          });
        }

        result = await client.query(`
          UPDATE events 
          SET scheduled_day = $1,
              scheduled_time_block = $2,
              room = $3,
              status = 'publicado',
              updated_at = NOW()
          WHERE id = ANY($4)
          RETURNING id, title, scheduled_day, scheduled_time_block, room
        `, [data.scheduled_day, data.scheduled_time_block, roomNumber, eventIds]);
        break;

      case 'clear_schedule':
        result = await client.query(`
          UPDATE events
          SET scheduled_day = NULL,
              scheduled_time_block = NULL,
              room = NULL,
              turn_order = NULL,
              updated_at = NOW()
          WHERE id = ANY($1)
          RETURNING id, title
        `, [eventIds]);
        break;

      case 'move_slot':
        // Data esperada: { source: { day, time, room }, destination: { day, time, room } }
        const { source, destination } = data;

        // Validar que todos los datos estén completos
        if (!source.day || !source.time || !source.room || !destination.day || !destination.time || !destination.room) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: 'Source and destination must include day, time, and room'
          });
        }

        const destinationRoom = parseInt(destination.room);

        // Validar que la sala de destino sea válida
        if (destinationRoom < 1 || destinationRoom > 30) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: 'Destination room must be between 1 and 30'
          });
        }

        // 1. Verificar que la sala de destino no esté llena - usar capacidad dinámica
        const maxCapacityDest = getRoomCapacity(destination.day, destinationRoom);

        const capacityCheck = await client.query(`
          SELECT COUNT(*) as count
          FROM events
          WHERE scheduled_day = $1
            AND scheduled_time_block = $2
            AND room = $3
            AND status = 'publicado'
        `, [destination.day, destination.time, destinationRoom]);

        const currentOccupancy = parseInt(capacityCheck.rows[0].count);

        // Contar cuántos eventos vamos a mover
        const sourceEventsCount = await client.query(`
          SELECT COUNT(*) as count
          FROM events
          WHERE scheduled_day = $1
            AND scheduled_time_block = $2
            AND room = $3
            AND status = 'publicado'
        `, [source.day, source.time, parseInt(source.room)]);

        const eventsToMove = parseInt(sourceEventsCount.rows[0].count);

        if (currentOccupancy + eventsToMove > maxCapacityDest) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            message: `La sala ${destinationRoom} no tiene suficiente capacidad. Ocupación actual: ${currentOccupancy}, intentando añadir: ${eventsToMove}, máximo: ${maxCapacityDest}`,
            currentOccupancy,
            eventsToMove,
            maxCapacity: maxCapacityDest
          });
        }

        // 2. Ejecutar la consulta UPDATE principal
        result = await client.query(`
          UPDATE events
          SET scheduled_day = $1,
              scheduled_time_block = $2,
              room = $3,
              updated_at = NOW()
          WHERE scheduled_day = $4
            AND scheduled_time_block = $5
            AND room = $6
            AND status = 'publicado'
          RETURNING id, title, scheduled_day, scheduled_time_block, room
        `, [destination.day, destination.time, destinationRoom, source.day, source.time, parseInt(source.room)]);

        break;

      default:
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          message: 'Invalid operation',
          validOperations: [
            'move_to_draft', 'publish_events', 'delete_events',
            'update_type', 'assign_day', 'assign_room', 'clear_schedule', 'move_slot'
          ]
        });
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Bulk operation '${operation}' completed successfully`,
      operation,
      affected: result.rows.length,
      requested: eventIds.length,
      events: result.rows,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    await client.query('ROLLBACK');
    
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    console.error('Error in /api/admin/bulk-operations:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};