require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token not provided' });
    }
    
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET);

    const { 
      q: searchQuery = '', 
      status = 'all',
      event_type = 'all',
      scheduled_day = 'all',
      room = 'all',
      limit = 50 
    } = req.query;

    let query = 'SELECT * FROM events WHERE 1=1';
    const params = [];
    let paramCount = 0;

    // Text search in title and authors
    if (searchQuery.trim()) {
      paramCount++;
      query += ` AND (
        LOWER(title->>'es') LIKE LOWER($${paramCount}) OR 
        LOWER(authors->>'es') LIKE LOWER($${paramCount}) OR
        CAST(id AS TEXT) LIKE $${paramCount}
      )`;
      params.push(`%${searchQuery.trim()}%`);
    }

    // Filter by status
    if (status !== 'all') {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    // Filter by event type
    if (event_type !== 'all') {
      paramCount++;
      query += ` AND event_type = $${paramCount}`;
      params.push(event_type);
    }

    // Filter by scheduled day
    if (scheduled_day !== 'all') {
      paramCount++;
      query += ` AND scheduled_day = $${paramCount}`;
      params.push(scheduled_day);
    }

    // Filter by room
    if (room !== 'all') {
      paramCount++;
      query += ` AND room = $${paramCount}`;
      params.push(parseInt(room));
    }

    // Order and limit
    query += ` ORDER BY 
      CASE WHEN status = 'publicado' THEN 0 ELSE 1 END,
      scheduled_day NULLS LAST,
      scheduled_time_block NULLS LAST,
      room NULLS LAST,
      turn_order NULLS LAST,
      id
    `;

    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const { rows } = await pool.query(query, params);

    return res.status(200).json({
      results: rows,
      total: rows.length,
      query: {
        searchQuery,
        status,
        event_type,
        scheduled_day,
        room,
        limit
      }
    });

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    console.error('Error in /api/admin/search:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};