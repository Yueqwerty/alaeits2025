/**
 * API Endpoint: POST /api/admin/symposiums/migrate
 * Migra certificados de simposios desde CSV a PostgreSQL
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ timestamp, level, message, ...data }));
}

// Parser simple de CSV que respeta comillas
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

async function migrateSymposiums(csvPath, pool) {
  log('info', 'Iniciando migración de simposios', { file: csvPath });

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Archivo no encontrado: ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');

  let insertados = 0;
  let actualizados = 0;
  let errores = 0;
  let saltados = 0;

  // Saltar la primera línea (headers)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      saltados++;
      continue;
    }

    try {
      const fields = parseCSVLine(line);

      if (fields.length < 8) {
        log('warn', `Línea ${i + 1}: Formato inválido, saltando...`, { fieldsCount: fields.length });
        saltados++;
        continue;
      }

      // Extraer campos del CSV
      // {{ID}},{{TITULO}},Tipo_Trabajo,{{AUTOR}},Email_Autor,Estado_Dictamen,Link_DOC,Link_PDF
      const id = fields[0]?.trim();
      const titulo = fields[1]?.trim();
      const tipoTrabajo = fields[2]?.trim();
      const autor = fields[3]?.trim();
      const email = fields[4]?.trim()?.toLowerCase();
      const estadoDictamen = fields[5]?.trim();
      const docUrl = fields[6]?.trim();
      const pdfUrl = fields[7]?.trim();

      // Validar datos obligatorios
      if (!id || !titulo || !autor) {
        log('warn', `Línea ${i + 1}: Faltan datos obligatorios (id, titulo o autor)`);
        saltados++;
        continue;
      }

      // Si no hay email, saltamos la entrada
      if (!email) {
        log('warn', `Línea ${i + 1}: Sin email, saltando...`, { id, autor });
        saltados++;
        continue;
      }

      // Insertar o actualizar en la base de datos
      const result = await pool.query(`
        INSERT INTO symposiums (
          symposium_id,
          author_name,
          author_email,
          title,
          work_type,
          review_status,
          doc_url,
          pdf_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (symposium_id, author_email)
        DO UPDATE SET
          author_name = EXCLUDED.author_name,
          title = EXCLUDED.title,
          work_type = EXCLUDED.work_type,
          review_status = EXCLUDED.review_status,
          doc_url = EXCLUDED.doc_url,
          pdf_url = EXCLUDED.pdf_url,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted;
      `, [
        id,
        autor,
        email,
        titulo,
        tipoTrabajo || 'Simposio',
        estadoDictamen || 'ACEPTADO',
        docUrl,
        pdfUrl
      ]);

      if (result.rows[0].inserted) {
        insertados++;
      } else {
        actualizados++;
      }

    } catch (error) {
      log('error', `Error en línea ${i + 1}`, { error: error.message });
      errores++;
    }
  }

  return { insertados, actualizados, errores, saltados };
}

module.exports = async (req, res) => {
  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed. Use POST.'
      });
    }

    // Verificar autenticación (puedes agregar tu lógica de auth aquí)
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado'
      });
    }

    log('info', 'Iniciando migración de simposios');

    await pool.query('BEGIN');

    const results = {
      simposios: { insertados: 0, actualizados: 0, errores: 0, saltados: 0 }
    };

    // Migrar simposios
    const symposiumsPath = path.join(process.cwd(), 'database', 'simposios-data.csv');

    if (!fs.existsSync(symposiumsPath)) {
      throw new Error(`Archivo no encontrado: ${symposiumsPath}`);
    }

    try {
      results.simposios = await migrateSymposiums(symposiumsPath, pool);
    } catch (error) {
      log('error', 'Error migrando simposios', { error: error.message });
      results.simposios.errores++;
    }

    await pool.query('COMMIT');

    // Obtener estadísticas finales
    const symposiumCount = await pool.query('SELECT COUNT(*) FROM symposiums');

    const statsByStatus = await pool.query(`
      SELECT review_status, COUNT(*) as count
      FROM symposiums
      GROUP BY review_status
      ORDER BY count DESC;
    `);

    const statsBySymposium = await pool.query(`
      SELECT symposium_id, COUNT(*) as count
      FROM symposiums
      GROUP BY symposium_id
      ORDER BY symposium_id;
    `);

    log('info', 'Migración completada exitosamente', { results });

    return res.status(200).json({
      success: true,
      message: 'Simposios migrados correctamente',
      results: {
        simposios: {
          ...results.simposios,
          total: symposiumCount.rows[0].count,
          estadoPorStatus: statsByStatus.rows,
          porSimposio: statsBySymposium.rows
        }
      }
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    log('error', 'Error fatal en migración', { error: error.message, stack: error.stack });

    return res.status(500).json({
      success: false,
      message: 'Error al migrar simposios',
      error: error.message
    });
  }
};
