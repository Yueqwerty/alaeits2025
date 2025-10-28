/**
 * API Endpoint: POST /api/admin/certificates/migrate
 * Migra certificados desde CSV a PostgreSQL (ponentes y oyentes)
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

async function migratePresenters(csvPath, pool) {
  log('info', 'Iniciando migración de ponentes', { file: csvPath });

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Archivo no encontrado: ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');

  let insertados = 0;
  let actualizados = 0;
  let errores = 0;
  let saltados = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      saltados++;
      continue;
    }

    try {
      const fields = parseCSVLine(line);

      if (fields.length < 10) {
        log('warn', `Línea ${i + 1}: Formato inválido, saltando...`);
        saltados++;
        continue;
      }

      const id = fields[0]?.trim();
      const titulo = fields[1]?.trim();
      const eje = fields[2]?.trim();
      const tipo = fields[3]?.trim();
      const autor = fields[4]?.trim();
      const email = fields[5]?.trim()?.toLowerCase();
      const pais = fields[6]?.trim();
      const institucion = fields[7]?.trim();
      const docUrl = fields[8]?.trim();
      const pdfUrl = fields[9]?.trim();
      const status = fields[10]?.trim();
      const fecha = fields[11]?.trim();

      if (!id || !email || !autor) {
        log('warn', `Línea ${i + 1}: Faltan datos obligatorios`);
        saltados++;
        continue;
      }

      let generationStatus = 'pending';
      let generationError = null;
      let generatedAt = null;

      if (status === 'OK') {
        generationStatus = 'ok';
        if (fecha) {
          const [day, month, year] = fecha.split('/');
          generatedAt = new Date(`${year}-${month}-${day}`);
        }
      } else if (status && status !== '') {
        generationStatus = 'error';
        generationError = status;
      }

      const result = await pool.query(`
        INSERT INTO certificates (
          paper_id,
          author_name,
          author_email,
          title,
          eje,
          paper_type,
          country,
          institution,
          doc_editable_url,
          pdf_url,
          generation_status,
          generation_error,
          generated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (paper_id, author_email)
        DO UPDATE SET
          author_name = EXCLUDED.author_name,
          title = EXCLUDED.title,
          eje = EXCLUDED.eje,
          paper_type = EXCLUDED.paper_type,
          country = EXCLUDED.country,
          institution = EXCLUDED.institution,
          doc_editable_url = EXCLUDED.doc_editable_url,
          pdf_url = EXCLUDED.pdf_url,
          generation_status = EXCLUDED.generation_status,
          generation_error = EXCLUDED.generation_error,
          generated_at = EXCLUDED.generated_at,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted;
      `, [
        id,
        autor,
        email,
        titulo,
        eje,
        tipo,
        pais,
        institucion,
        docUrl,
        pdfUrl,
        generationStatus,
        generationError,
        generatedAt
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

async function migrateAttendees(csvPath, pool) {
  log('info', 'Iniciando migración de oyentes', { file: csvPath });

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Archivo no encontrado: ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');

  let insertados = 0;
  let actualizados = 0;
  let errores = 0;
  let saltados = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      saltados++;
      continue;
    }

    try {
      const fields = parseCSVLine(line);

      if (fields.length < 5) {
        log('warn', `Línea ${i + 1}: Formato inválido, saltando...`);
        saltados++;
        continue;
      }

      // Formato CSV: Nombres, Apellido1, Apellido2, País, Correo, {{AUTOR}}, PDF_URL
      const country = fields[3]?.trim();
      const email = fields[4]?.trim()?.toLowerCase();
      const fullName = fields[5]?.trim(); // Columna {{AUTOR}} tiene el nombre completo
      const pdfUrl = fields[6]?.trim();

      if (!fullName || !email) {
        log('warn', `Línea ${i + 1}: Faltan datos obligatorios`);
        saltados++;
        continue;
      }

      const result = await pool.query(`
        INSERT INTO attendees (
          full_name,
          email,
          country,
          pdf_url
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (email)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          country = EXCLUDED.country,
          pdf_url = EXCLUDED.pdf_url,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted;
      `, [fullName, email, country, pdfUrl]);

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

    log('info', 'Iniciando migración de certificados');

    await pool.query('BEGIN');

    const results = {
      ponentes: { insertados: 0, actualizados: 0, errores: 0, saltados: 0 },
      oyentes: { insertados: 0, actualizados: 0, errores: 0, saltados: 0 }
    };

    // Migrar ponentes (cruce-data.csv o cruce-data-updated.csv)
    const presentersPath = path.join(process.cwd(), 'database', 'cruce-data-updated.csv');
    const fallbackPath = path.join(process.cwd(), 'database', 'cruce-data.csv');

    const csvToUse = fs.existsSync(presentersPath) ? presentersPath : fallbackPath;

    try {
      results.ponentes = await migratePresenters(csvToUse, pool);
    } catch (error) {
      log('error', 'Error migrando ponentes', { error: error.message });
      results.ponentes.errores++;
    }

    // Migrar oyentes
    const attendeesPath = path.join(process.cwd(), 'database', 'oyentes-data.csv');

    if (fs.existsSync(attendeesPath)) {
      try {
        results.oyentes = await migrateAttendees(attendeesPath, pool);
      } catch (error) {
        log('error', 'Error migrando oyentes', { error: error.message });
        results.oyentes.errores++;
      }
    }

    await pool.query('COMMIT');

    // Obtener estadísticas finales
    const presenterCount = await pool.query('SELECT COUNT(*) FROM certificates');
    const attendeeCount = await pool.query('SELECT COUNT(*) FROM attendees');

    const statsPresenter = await pool.query(`
      SELECT generation_status, COUNT(*) as count
      FROM certificates
      GROUP BY generation_status
      ORDER BY count DESC;
    `);

    log('info', 'Migración completada exitosamente', { results });

    return res.status(200).json({
      success: true,
      message: 'Certificados actualizados correctamente',
      results: {
        ponentes: {
          ...results.ponentes,
          total: presenterCount.rows[0].count,
          estadoPorStatus: statsPresenter.rows
        },
        oyentes: {
          ...results.oyentes,
          total: attendeeCount.rows[0].count
        }
      }
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    log('error', 'Error fatal en migración', { error: error.message, stack: error.stack });

    return res.status(500).json({
      success: false,
      message: 'Error al actualizar certificados',
      error: error.message
    });
  }
};
