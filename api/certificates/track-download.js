/**
 * API Endpoint: POST /api/certificates/track-download
 * Registra una descarga de certificado (ponente, simposio, libro u oyente)
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed. Use POST.'
      });
    }

    const { type, paperId, email } = req.body;

    if (!type || !email) {
      return res.status(400).json({
        success: false,
        message: 'Faltan parámetros requeridos: type, email'
      });
    }

    // paperId es requerido excepto para oyentes
    if (!paperId && type !== 'attendee' && type !== 'oyente') {
      return res.status(400).json({
        success: false,
        message: 'El parámetro paperId es requerido para este tipo de certificado'
      });
    }

    // Obtener IP y user agent del request
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] ||
                      req.headers['x-real-ip'] ||
                      req.connection?.remoteAddress ||
                      'unknown';

    const userAgent = req.headers['user-agent'] || 'unknown';

    let downloadId = null;

    if (type === 'presenter' || type === 'ponente') {
      // Buscar el certificado de ponente
      const certResult = await pool.query(
        `SELECT id FROM certificates WHERE paper_id = $1 AND author_email = $2`,
        [paperId, email.toLowerCase()]
      );

      if (certResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Certificado no encontrado'
        });
      }

      const certificateId = certResult.rows[0].id;

      // Registrar la descarga
      const downloadResult = await pool.query(
        `INSERT INTO certificate_downloads (certificate_id, ip_address, user_agent)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [certificateId, ipAddress, userAgent]
      );

      downloadId = downloadResult.rows[0].id;

    } else if (type === 'symposium' || type === 'simposio') {
      // Buscar el certificado de simposio
      const symposiumResult = await pool.query(
        `SELECT id FROM symposiums WHERE symposium_id = $1 AND author_email = $2`,
        [paperId, email.toLowerCase()]
      );

      if (symposiumResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Certificado de simposio no encontrado'
        });
      }

      const symposiumId = symposiumResult.rows[0].id;

      // Registrar la descarga
      const downloadResult = await pool.query(
        `INSERT INTO symposium_downloads (symposium_id, ip_address, user_agent)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [symposiumId, ipAddress, userAgent]
      );

      downloadId = downloadResult.rows[0].id;

    } else if (type === 'book' || type === 'libro') {
      // Buscar el certificado de libro
      const bookResult = await pool.query(
        `SELECT id FROM books WHERE book_id = $1 AND author_email = $2`,
        [paperId, email.toLowerCase()]
      );

      if (bookResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Certificado de libro no encontrado'
        });
      }

      const bookId = bookResult.rows[0].id;

      // Registrar la descarga
      const downloadResult = await pool.query(
        `INSERT INTO book_downloads (book_id, ip_address, user_agent)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [bookId, ipAddress, userAgent]
      );

      downloadId = downloadResult.rows[0].id;

    } else if (type === 'attendee' || type === 'oyente') {
      // Buscar el certificado de oyente
      const attendeeResult = await pool.query(
        `SELECT id FROM attendees WHERE email = $1`,
        [email.toLowerCase()]
      );

      if (attendeeResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Certificado no encontrado'
        });
      }

      const attendeeId = attendeeResult.rows[0].id;

      // Registrar la descarga
      const downloadResult = await pool.query(
        `INSERT INTO attendee_downloads (attendee_id, ip_address, user_agent)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [attendeeId, ipAddress, userAgent]
      );

      downloadId = downloadResult.rows[0].id;

    } else {
      return res.status(400).json({
        success: false,
        message: 'Tipo de certificado inválido. Use "presenter", "symposium", "book" o "attendee"'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Descarga registrada correctamente',
      downloadId
    });

  } catch (error) {
    console.error('Error registrando descarga:', error);

    return res.status(500).json({
      success: false,
      message: 'Error al registrar descarga',
      error: error.message
    });
  }
};
