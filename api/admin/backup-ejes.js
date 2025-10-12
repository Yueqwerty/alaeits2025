// api/admin/backup-ejes.js
require('dotenv').config({ path: '../../.env.local' });
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido.' });
  }

  try {
    // 1. Verificar autenticación
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token de autorización requerido.' });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET);

    console.log('Iniciando backup de ejes...');

    // 2. Obtener todos los eventos con sus ejes actuales
    const { rows: events } = await pool.query('SELECT id, eje FROM events');

    // 3. Crear directorio de backup si no existe
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // 4. Guardar datos en un archivo JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ejes-backup-${timestamp}.json`;
    const backupPath = path.join(backupDir, filename);

    fs.writeFileSync(backupPath, JSON.stringify(events, null, 2));

    console.log(`   Backup completado: ${backupPath}`);

    return res.status(200).json({
      message: `Backup completado. ${events.length} eventos guardados.`,
      backupFile: filename,
      backupPath: backupPath,
      eventCount: events.length
    });

  } catch (error) {
    console.error('Error durante el backup:', error);

    let errorMessage = 'Error interno del servidor.';
    let statusCode = 500;

    if (error.message.includes('Token') || error.message.includes('autorización')) {
      statusCode = 401;
      errorMessage = 'Token de autorización inválido.';
    }

    return res.status(statusCode).json({
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};