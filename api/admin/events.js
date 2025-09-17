require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token no proporcionado.' });
    }
    
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await pool.query(`
      SELECT * FROM events 
      WHERE event_type != 'discusion'
      ORDER BY 
        scheduled_day NULLS LAST, 
        scheduled_time_block NULLS LAST, 
        room NULLS LAST, 
        turn_order NULLS LAST,
        id
    `);
    
    const drafts = rows.filter(event => event.status === 'borrador');
    const published = rows.filter(event => event.status === 'publicado');

    return res.status(200).json({ drafts, published });

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Token inválido.' });
    }
    console.error('Error en /api/admin/events:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
};