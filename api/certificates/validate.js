/**
 * API Endpoint: POST /api/certificates/validate
 * Versión robusta con logging y manejo de errores completo
 * Soporta tanto ponentes (paper_id + email) como oyentes (solo email)
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Pool de conexiones a PostgreSQL
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Log helper
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logData = { timestamp, level, message, ...data };
  console.log(JSON.stringify(logData));
}

module.exports = async (req, res) => {
  const startTime = Date.now();

  try {
    // Configurar CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      log('info', 'CORS preflight request');
      return res.status(200).end();
    }

    // Solo permitir POST
    if (req.method !== 'POST') {
      log('warn', 'Method not allowed', { method: req.method });
      return res.status(405).json({
        success: false,
        message: 'Method not allowed. Use POST.'
      });
    }

    // Extraer y validar body
    const { paper_id, email } = req.body || {};

    log('info', 'Validate request received', {
      paper_id: paper_id || 'none',
      email: email ? 'provided' : 'missing',
      type: paper_id ? 'presenter' : 'attendee'
    });

    // Validar que al menos el email esté presente
    if (!email) {
      log('warn', 'Missing email', { paper_id: !!paper_id, email: !!email });
      return res.status(400).json({
        success: false,
        message: 'Se requiere email'
      });
    }

    // Validar formato de email (más estricto)
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      log('warn', 'Invalid email format', { email });
      return res.status(400).json({
        success: false,
        message: 'Formato de email inválido'
      });
    }

    // Validar formato de paper_id solo si está presente (ponentes)
    if (paper_id) {
      const paperIdRegex = /^[A-Z]{1,2}\d{1,5}$/i;
      if (!paperIdRegex.test(paper_id)) {
        log('warn', 'Invalid paper_id format', { paper_id });
        return res.status(400).json({
          success: false,
          message: 'Formato de ID de ponencia inválido'
        });
      }
    }

    // Normalizar credenciales
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPaperId = paper_id ? paper_id.trim().toUpperCase() : null;

    // Sanitizar para prevenir SQL injection (aunque usamos parametrized queries)
    if (normalizedEmail.length > 255 || (normalizedPaperId && normalizedPaperId.length > 20)) {
      log('warn', 'Input too long', { emailLen: normalizedEmail.length, paperIdLen: normalizedPaperId?.length });
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos'
      });
    }

    // Determinar tipo de búsqueda
    const isPresenter = !!normalizedPaperId;
    const searchType = isPresenter ? 'presenter' : 'attendee';

    log('info', `Searching ${searchType} certificate`, {
      paper_id: normalizedPaperId || 'N/A',
      email: normalizedEmail
    });

    let result;
    let certificateData;
    let recordId;

    if (isPresenter) {
      // BÚSQUEDA PARA PONENTES: certificates table
      result = await pool.query(`
        SELECT
          id,
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
          generated_at
        FROM certificates
        WHERE UPPER(paper_id) = $1
          AND LOWER(author_email) = $2
          AND generation_status = 'ok'
        LIMIT 1
      `, [normalizedPaperId, normalizedEmail]);

      if (result.rows.length === 0) {
        log('warn', 'Presenter certificate not found', {
          paper_id: normalizedPaperId,
          email: normalizedEmail
        });
        return res.status(404).json({
          success: false,
          message: 'Credenciales inválidas. Verifique su ID de ponencia y correo electrónico.'
        });
      }

      const cert = result.rows[0];
      recordId = cert.id;
      certificateData = {
        type: 'presenter',
        paper_id: cert.paper_id,
        author_name: cert.author_name,
        author_email: cert.author_email,
        title: cert.title,
        eje: cert.eje,
        paper_type: cert.paper_type,
        country: cert.country,
        institution: cert.institution,
        doc_editable_url: cert.doc_editable_url,
        pdf_url: cert.pdf_url,
        generated_at: cert.generated_at
      };

    } else {
      // BÚSQUEDA PARA OYENTES: attendees table
      result = await pool.query(`
        SELECT
          id,
          full_name,
          email,
          country,
          pdf_url,
          created_at
        FROM attendees
        WHERE LOWER(email) = $1
        LIMIT 1
      `, [normalizedEmail]);

      if (result.rows.length === 0) {
        log('warn', 'Attendee certificate not found', { email: normalizedEmail });
        return res.status(404).json({
          success: false,
          message: 'No se encontró certificado de oyente para este correo electrónico.'
        });
      }

      const attendee = result.rows[0];
      recordId = attendee.id;
      certificateData = {
        type: 'attendee',
        paper_id: null,
        author_name: attendee.full_name,
        author_email: attendee.email,
        title: 'Certificado de Asistencia',
        eje: null,
        paper_type: 'Oyente',
        country: attendee.country,
        institution: null,
        doc_editable_url: null,
        pdf_url: attendee.pdf_url,
        generated_at: attendee.created_at
      };
    }

    // Registrar acceso en la tabla de descargas correspondiente
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.connection?.remoteAddress
      || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
      if (isPresenter) {
        await pool.query(`
          INSERT INTO certificate_downloads (
            certificate_id,
            ip_address,
            user_agent
          ) VALUES ($1, $2, $3)
        `, [recordId, clientIp, userAgent]);
      } else {
        await pool.query(`
          INSERT INTO attendee_downloads (
            attendee_id,
            ip_address,
            user_agent
          ) VALUES ($1, $2, $3)
        `, [recordId, clientIp, userAgent]);
      }

      log('info', 'Access registered', {
        type: searchType,
        paper_id: normalizedPaperId || 'N/A',
        email: normalizedEmail,
        ip: clientIp
      });
    } catch (downloadError) {
      // No fallar si no se puede registrar la descarga
      log('error', 'Failed to register access', { error: downloadError.message });
    }

    const duration = Date.now() - startTime;
    log('info', 'Certificate validated successfully', {
      type: searchType,
      paper_id: normalizedPaperId || 'N/A',
      email: normalizedEmail,
      duration: `${duration}ms`
    });

    // Retornar el certificado
    return res.status(200).json({
      success: true,
      certificate: certificateData
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    log('error', 'Internal server error', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`
    });

    // En desarrollo, incluir más detalles del error
    const isDevelopment = process.env.NODE_ENV !== 'production';

    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      ...(isDevelopment && {
        error: error.message,
        type: error.constructor.name
      })
    });
  }
};
