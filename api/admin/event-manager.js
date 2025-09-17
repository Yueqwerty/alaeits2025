require('dotenv').config({ path: '.env.local' }); // CORREGIDO: ruta correcta

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL, // CORREGIDO: nombre correcto
  ssl: { rejectUnauthorized: false },
});

// Función de ayuda para verificar la autenticación
const verifyAuth = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Token no proporcionado');
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = async (req, res) => {
  try {
    // 1. Verificamos la autenticación para cualquier método
    verifyAuth(req);

    // 2. Gestionamos la petición según el método
    switch (req.method) {
      // --- CASO DE ACTUALIZACIÓN ---
      case 'PUT': {
        const { eventId, updatedData } = req.body;
        
        console.log('Event Manager PUT - eventId:', eventId, 'updatedData:', updatedData);
        
        if (!eventId || !updatedData) {
          return res.status(400).json({ 
            message: 'Faltan datos en la petición (eventId o updatedData).' 
          });
        }

        // --- LÓGICA DINÁMICA CORREGIDA ---
        const fields = Object.keys(updatedData);
        const values = Object.values(updatedData);

        if (fields.length === 0) {
          return res.status(400).json({ 
            message: 'No se proporcionaron campos para actualizar.' 
          });
        }
        
        // Construimos la cláusula SET dinámicamente
        const setClause = fields.map((field, i) => `"${field}" = $${i + 1}`).join(', ');
        
        // CORREGIDO: Añadimos updated_at como función SQL, no como parámetro
        const query = `
          UPDATE events 
          SET ${setClause}, updated_at = NOW() 
          WHERE id = $${fields.length + 1} 
          RETURNING *
        `;
        
        console.log('SQL Query:', query);
        console.log('Query params:', [...values, eventId]);
        
        const { rows } = await pool.query(query, [...values, eventId]);

        if (rows.length === 0) {
          return res.status(404).json({ message: 'Evento no encontrado.' });
        }
        console.log('Event updated successfully:', rows[0]);
        return res.status(200).json({ 
          message: 'Evento actualizado exitosamente.', 
          event: rows[0] 
        });
      }

      // --- CASO DE ELIMINACIÓN ---
      case 'DELETE': {
        const { eventId } = req.body;
        
        if (!eventId) {
          return res.status(400).json({ message: 'Falta el ID del evento.' });
        }

        console.log('Deleting event:', eventId);
        
        const { rowCount } = await pool.query('DELETE FROM events WHERE id = $1', [eventId]);

        if (rowCount === 0) {
          return res.status(404).json({ message: 'Evento no encontrado para eliminar.' });
        }
        console.log('Event deleted successfully');
        return res.status(200).json({ message: 'Evento eliminado exitosamente.' });
      }

      // Si es cualquier otro método
      default:
        res.setHeader('Allow', ['PUT', 'DELETE']);
        return res.status(405).json({ 
          message: `Método ${req.method} no permitido.` 
        });
    }
  } catch (error) {
    console.error('Error en event-manager:', error);
    console.error('Error stack:', error.stack);
    
    if (error.message === 'Token no proporcionado' || error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Autenticación fallida.' });
    }
    
    return res.status(500).json({ 
      message: 'Error interno del servidor.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};