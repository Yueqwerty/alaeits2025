require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Método no permitido.' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token no proporcionado.' });
    }
    
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET);

    const { eventId, updatedData } = req.body;

    if (!eventId || !updatedData) {
      return res.status(400).json({ message: 'Faltan eventId o updatedData.' });
    }

    // Si el status cambia a 'borrador', limpiar campos de programación
    if (updatedData.status === 'borrador') {
      updatedData.turn_order = null;
      updatedData.scheduled_day = null;
      updatedData.scheduled_time_block = null;
      updatedData.room = null;
    }

    const { rows } = await pool.query(
      `UPDATE events 
       SET status = $1, 
           scheduled_day = $2, 
           scheduled_time_block = $3, 
           room = $4, 
           turn_order = $5,
           updated_at = NOW()
       WHERE id = $6 
       RETURNING *`,
      [
        updatedData.status,
        updatedData.scheduled_day,
        updatedData.scheduled_time_block,
        updatedData.room,
        updatedData.turn_order,
        eventId
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Evento no encontrado.' });
    }

    return res.status(200).json({ 
      message: 'Evento actualizado exitosamente.',
      event: rows[0]
    });

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Token inválido.' });
    }
    console.error('Error en /api/admin/event-manager:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
};