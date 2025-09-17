// api/admin/event-manager.js (VERSIÓN FINAL CON UPDATE DINÁMICO Y DELETE)

require('dotenv').config({ path: '../../.env.local' });
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.POSTG-RES_URL,
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
        if (!eventId || !updatedData) {
          return res.status(400).json({ message: 'Faltan datos en la petición (eventId o updatedData).' });
        }

        // --- LÓGICA DINÁMICA ---
        // Obtenemos los nombres de las columnas a actualizar desde el objeto `updatedData`
        const fields = Object.keys(updatedData);
        // Obtenemos los valores correspondientes
        const values = Object.values(updatedData);

        // Si no se enviaron campos para actualizar, no hacemos nada
        if (fields.length === 0) {
          return res.status(400).json({ message: 'No se proporcionaron campos para actualizar.' });
        }
        
        // Añadimos 'updated_at' para que siempre se actualice la fecha de modificación
        fields.push('updated_at');
        values.push('NOW()');

        // Construimos la cláusula SET de la consulta SQL dinámicamente
        // Ejemplo: "title" = $1, "authors" = $2, "updated_at" = $3
        const setClause = fields.map((field, i) => `"${field}" = $${i + 1}`).join(', ');

        const query = `UPDATE events SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`;
        
        // El último valor del array de valores es el eventId para el WHERE
        const { rows } = await pool.query(query, [...values, eventId]);

        if (rows.length === 0) {
          return res.status(404).json({ message: 'Evento no encontrado.' });
        }
        return res.status(200).json({ message: 'Evento actualizado exitosamente.', event: rows[0] });
      }

      // --- CASO DE ELIMINACIÓN ---
      case 'DELETE': {
        const { eventId } = req.body;
        if (!eventId) {
          return res.status(400).json({ message: 'Falta el ID del evento.' });
        }

        const { rowCount } = await pool.query('DELETE FROM events WHERE id = $1', [eventId]);

        if (rowCount === 0) {
          return res.status(404).json({ message: 'Evento no encontrado para eliminar.' });
        }
        return res.status(200).json({ message: 'Evento eliminado exitosamente.' });
      }

      // Si es cualquier otro método (GET, POST, etc.)
      default:
        res.setHeader('Allow', ['PUT', 'DELETE']);
        return res.status(405).json({ message: `Método ${req.method} no permitido.` });
    }
  } catch (error) {
    if (error.message === 'Token no proporcionado' || error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Autenticación fallida.' });
    }
    console.error('Error en event-manager:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
};