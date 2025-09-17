require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token not provided' });
    }
    
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET);

    const { operation, eventIds, data } = req.body;

    if (!operation || !eventIds || !Array.isArray(eventIds)) {
      return res.status(400).json({ message: 'Invalid request data' });
    }

    let result;

    switch (operation) {
      case 'move_to_draft':
        result = await pool.query(`
          UPDATE events 
          SET status = 'borrador',
              scheduled_day = NULL,
              scheduled_time_block = NULL,
              room = NULL,
              turn_order = NULL,
              updated_at = NOW()
          WHERE id = ANY($1)
          RETURNING id, title
        `, [eventIds]);
        break;

      case 'delete_events':
        result = await pool.query(`
          DELETE FROM events 
          WHERE id = ANY($1)
          RETURNING id, title
        `, [eventIds]);
        break;

      case 'update_type':
        if (!data.event_type) {
          return res.status(400).json({ message: 'Event type is required' });
        }
        result = await pool.query(`
          UPDATE events 
          SET event_type = $1, updated_at = NOW()
          WHERE id = ANY($2)
          RETURNING id, title, event_type
        `, [data.event_type, eventIds]);
        break;

      case 'assign_day':
        if (!data.scheduled_day) {
          return res.status(400).json({ message: 'Scheduled day is required' });
        }
        result = await pool.query(`
          UPDATE events 
          SET scheduled_day = $1,
              status = 'publicado',
              updated_at = NOW()
          WHERE id = ANY($2)
          RETURNING id, title, scheduled_day
        `, [data.scheduled_day, eventIds]);
        break;

      default:
        return res.status(400).json({ message: 'Invalid operation' });
    }

    return res.status(200).json({
      message: `Bulk operation ${operation} completed successfully`,
      affected: result.rows.length,
      events: result.rows
    });

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    console.error('Error in /api/admin/bulk-operations:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};