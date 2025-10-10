// api/admin/restore-ejes.js
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

    // 2. Obtener nombre del archivo de backup desde el cuerpo de la solicitud
    const { backupFile } = req.body;

    if (!backupFile) {
      return res.status(400).json({ message: 'Nombre de archivo de backup requerido.' });
    }

    const backupDir = path.join(process.cwd(), 'backups');
    const backupPath = path.join(backupDir, backupFile);

    // 3. Verificar que el archivo existe
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({
        message: `Archivo de backup no encontrado: ${backupFile}`,
        availableBackups: fs.readdirSync(backupDir).filter(f => f.endsWith('.json'))
      });
    }

    console.log(`Iniciando restauración desde backup: ${backupFile}`);

    // 4. Leer el archivo de backup
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

    if (!Array.isArray(backupData) || backupData.length === 0) {
      return res.status(400).json({ message: 'Formato de archivo de backup inválido o vacío.' });
    }

    // 5. Restaurar datos
    const client = await pool.connect();
    let restoredCount = 0;

    try {
      await client.query('BEGIN');

      for (const event of backupData) {
        const { id, eje } = event;
        await client.query(
          `UPDATE events SET eje = $1 WHERE id = $2`,
          [eje, id]
        );
        restoredCount++;
      }

      await client.query('COMMIT');
      console.log(`   ✅ Restauración completada. ${restoredCount} eventos restaurados.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error durante la restauración: ${error.message}`);
    } finally {
      client.release();
    }

    return res.status(200).json({
      message: `Restauración completada. ${restoredCount} eventos restaurados.`,
      restoredCount
    });

  } catch (error) {
    console.error('❌ Error durante la restauración:', error);

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