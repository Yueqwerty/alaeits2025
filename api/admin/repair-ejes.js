// api/admin/repair-ejes.js
require('dotenv').config({ path: '../../.env.local' });
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

// URLs de las hojas de cálculo
const URL_MBD_PONENCIAS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSPWPcv_xytqMvzC-zRhcdSg7WAU2skCTJ24CjfgpQRDeyayd7O6k-WWdPF5Z9vU8s5FA5ZCCQdxMJu/pub?gid=408175250&single=true&output=csv";
const URL_MBD_SIMPOSIOS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSPWPcv_xytqMvzC-zRhcdSg7WAU2skCTJ24CjfgpQRDeyayd7O6k-WWdPF5Z9vU8s5FA5ZCCQdxMJu/pub?gid=1740533037&single=true&output=csv";
const PRIMARY_LANG = 'es';

// Conexión a la base de datos
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

    console.log('Iniciando reparación de ejes vacíos...');

    // 2. Obtener datos de las hojas
    const [ponenciasRes, simposiosRes] = await Promise.all([
        fetch(URL_MBD_PONENCIAS).catch(err => { throw new Error(`Error al obtener ponencias: ${err.message}`); }),
        fetch(URL_MBD_SIMPOSIOS).catch(err => { throw new Error(`Error al obtener simposios: ${err.message}`); })
    ]);

    if (!ponenciasRes.ok) throw new Error(`Error HTTP en ponencias: ${ponenciasRes.status}`);
    if (!simposiosRes.ok) throw new Error(`Error HTTP en simposios: ${simposiosRes.status}`);

    const ponenciasCSV = await ponenciasRes.text();
    const simposiosCSV = await simposiosRes.text();

    // 3. Parsear los datos
    const { parse } = require('csv-parse/sync');

    const mbdPonencias = parse(ponenciasCSV, { columns: true, skip_empty_lines: true, trim: true });
    const mbdSimposios = parse(simposiosCSV, { columns: true, skip_empty_lines: true, trim: true });

    // 4. Crear un mapa de ID a eje temático
    const ejeMap = new Map();
    [...mbdPonencias, ...mbdSimposios].forEach(row => {
      const id = row.ID_Trabajo;
      if (!id || !row.Eje_Tematico) return;

      ejeMap.set(id, row.Eje_Tematico);
    });

    console.log(`   -> Ejes temáticos mapeados: ${ejeMap.size}`);

    // 5. Obtener IDs con ejes vacíos en la base de datos
    const { rows: eventsWithEmptyEjes } = await pool.query(`
      SELECT id FROM events
      WHERE eje = '{}'::jsonb OR eje IS NULL OR eje->>'${PRIMARY_LANG}' IS NULL
    `);

    console.log(`   -> Eventos con ejes vacíos: ${eventsWithEmptyEjes.length}`);

    if (eventsWithEmptyEjes.length === 0) {
      return res.status(200).json({
        message: `No hay ejes vacíos para reparar.`,
        updatedCount: 0
      });
    }

    // 6. Actualizar los registros con ejes vacíos
    const client = await pool.connect();
    let updatedCount = 0;

    try {
      await client.query('BEGIN');

      for (const event of eventsWithEmptyEjes) {
        const id = event.id;
        if (ejeMap.has(id)) {
          const ejeValue = ejeMap.get(id);
          await client.query(
            `UPDATE events SET eje = $1 WHERE id = $2`,
            [{ [PRIMARY_LANG]: ejeValue }, id]
          );
          updatedCount++;
        }
      }

      await client.query('COMMIT');
      console.log(`   ✅ Reparación completada. Se actualizaron ${updatedCount} eventos.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error durante la actualización: ${error.message}`);
    } finally {
      client.release();
    }

    return res.status(200).json({
      message: `Reparación completada. Se actualizaron ${updatedCount} eventos.`,
      updatedCount
    });

  } catch (error) {
    console.error('❌ Error durante la reparación:', error);

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