/**
 * API Endpoint: GET /api/admin/download-stats
 * Obtiene estadísticas de descargas de certificados
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed. Use GET.'
      });
    }

    // Verificar autenticación
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado'
      });
    }

    // 1. Estadísticas generales de ponentes
    const presenterStats = await pool.query(`
      SELECT
        COUNT(*) as total_downloads,
        COUNT(DISTINCT certificate_id) as unique_certificates,
        COUNT(*) - COUNT(DISTINCT certificate_id) as repeated_downloads
      FROM certificate_downloads
    `);

    // 2. Estadísticas generales de simposios
    const symposiumStats = await pool.query(`
      SELECT
        COUNT(*) as total_downloads,
        COUNT(DISTINCT symposium_id) as unique_certificates,
        COUNT(*) - COUNT(DISTINCT symposium_id) as repeated_downloads
      FROM symposium_downloads
    `);

    // 3. Estadísticas generales de libros
    const bookStats = await pool.query(`
      SELECT
        COUNT(*) as total_downloads,
        COUNT(DISTINCT book_id) as unique_certificates,
        COUNT(*) - COUNT(DISTINCT book_id) as repeated_downloads
      FROM book_downloads
    `);

    // 4. Estadísticas generales de oyentes
    const attendeeStats = await pool.query(`
      SELECT
        COUNT(*) as total_downloads,
        COUNT(DISTINCT attendee_id) as unique_certificates,
        COUNT(*) - COUNT(DISTINCT attendee_id) as repeated_downloads
      FROM attendee_downloads
    `);

    // 5. Descargas por día (últimos 30 días) - Ponentes
    const presentersByDay = await pool.query(`
      SELECT
        DATE(downloaded_at) as date,
        COUNT(*) as downloads,
        COUNT(DISTINCT certificate_id) as unique_downloads
      FROM certificate_downloads
      WHERE downloaded_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(downloaded_at)
      ORDER BY date DESC
    `);

    // 6. Descargas por día (últimos 30 días) - Simposios
    const symposiumsByDay = await pool.query(`
      SELECT
        DATE(downloaded_at) as date,
        COUNT(*) as downloads,
        COUNT(DISTINCT symposium_id) as unique_downloads
      FROM symposium_downloads
      WHERE downloaded_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(downloaded_at)
      ORDER BY date DESC
    `);

    // 7. Descargas por día (últimos 30 días) - Libros
    const booksByDay = await pool.query(`
      SELECT
        DATE(downloaded_at) as date,
        COUNT(*) as downloads,
        COUNT(DISTINCT book_id) as unique_downloads
      FROM book_downloads
      WHERE downloaded_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(downloaded_at)
      ORDER BY date DESC
    `);

    // 8. Descargas por día (últimos 30 días) - Oyentes
    const attendeesByDay = await pool.query(`
      SELECT
        DATE(downloaded_at) as date,
        COUNT(*) as downloads,
        COUNT(DISTINCT attendee_id) as unique_downloads
      FROM attendee_downloads
      WHERE downloaded_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(downloaded_at)
      ORDER BY date DESC
    `);

    // 9. Top 10 certificados de ponentes más descargados
    const topPresenters = await pool.query(`
      SELECT
        c.paper_id,
        c.author_name,
        c.title,
        COUNT(cd.id) as download_count
      FROM certificates c
      INNER JOIN certificate_downloads cd ON c.id = cd.certificate_id
      GROUP BY c.id, c.paper_id, c.author_name, c.title
      ORDER BY download_count DESC
      LIMIT 10
    `);

    // 10. Top 10 certificados de simposios más descargados
    const topSymposiums = await pool.query(`
      SELECT
        s.symposium_id,
        s.author_name,
        s.title,
        COUNT(sd.id) as download_count
      FROM symposiums s
      INNER JOIN symposium_downloads sd ON s.id = sd.symposium_id
      GROUP BY s.id, s.symposium_id, s.author_name, s.title
      ORDER BY download_count DESC
      LIMIT 10
    `);

    // 11. Top 10 certificados de libros más descargados
    const topBooks = await pool.query(`
      SELECT
        b.book_id,
        b.author_name,
        b.title,
        COUNT(bd.id) as download_count
      FROM books b
      INNER JOIN book_downloads bd ON b.id = bd.book_id
      GROUP BY b.id, b.book_id, b.author_name, b.title
      ORDER BY download_count DESC
      LIMIT 10
    `);

    // 12. Certificados de ponentes con múltiples descargas
    const repeatedPresenters = await pool.query(`
      SELECT
        c.paper_id,
        c.author_name,
        COUNT(cd.id) as download_count
      FROM certificates c
      INNER JOIN certificate_downloads cd ON c.id = cd.certificate_id
      GROUP BY c.id, c.paper_id, c.author_name
      HAVING COUNT(cd.id) > 1
      ORDER BY download_count DESC
    `);

    // 13. Certificados de libros con múltiples descargas
    const repeatedBooks = await pool.query(`
      SELECT
        b.book_id,
        b.author_name,
        COUNT(bd.id) as download_count
      FROM books b
      INNER JOIN book_downloads bd ON b.id = bd.book_id
      GROUP BY b.id, b.book_id, b.author_name
      HAVING COUNT(bd.id) > 1
      ORDER BY download_count DESC
    `);

    // 14. Certificados de oyentes con múltiples descargas
    const repeatedAttendees = await pool.query(`
      SELECT
        a.full_name,
        a.email,
        COUNT(ad.id) as download_count
      FROM attendees a
      INNER JOIN attendee_downloads ad ON a.id = ad.attendee_id
      GROUP BY a.id, a.full_name, a.email
      HAVING COUNT(ad.id) > 1
      ORDER BY download_count DESC
    `);

    // 15. Descargas por hora del día (últimos 7 días)
    const downloadsByHour = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM downloaded_at) as hour,
        COUNT(*) as downloads
      FROM (
        SELECT downloaded_at FROM certificate_downloads WHERE downloaded_at >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT downloaded_at FROM symposium_downloads WHERE downloaded_at >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT downloaded_at FROM book_downloads WHERE downloaded_at >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT downloaded_at FROM attendee_downloads WHERE downloaded_at >= NOW() - INTERVAL '7 days'
      ) as all_downloads
      GROUP BY hour
      ORDER BY hour
    `);

    // 16. Total de certificados disponibles vs descargados
    const totalCertificates = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM certificates) as total_presenter_certs,
        (SELECT COUNT(*) FROM symposiums) as total_symposium_certs,
        (SELECT COUNT(*) FROM books) as total_book_certs,
        (SELECT COUNT(*) FROM attendees) as total_attendee_certs,
        (SELECT COUNT(DISTINCT certificate_id) FROM certificate_downloads) as downloaded_presenter_certs,
        (SELECT COUNT(DISTINCT symposium_id) FROM symposium_downloads) as downloaded_symposium_certs,
        (SELECT COUNT(DISTINCT book_id) FROM book_downloads) as downloaded_book_certs,
        (SELECT COUNT(DISTINCT attendee_id) FROM attendee_downloads) as downloaded_attendee_certs
    `);

    const totalStats = totalCertificates.rows[0];
    const presenterDownloadRate = totalStats.total_presenter_certs > 0
      ? ((totalStats.downloaded_presenter_certs / totalStats.total_presenter_certs) * 100).toFixed(2)
      : 0;
    const symposiumDownloadRate = totalStats.total_symposium_certs > 0
      ? ((totalStats.downloaded_symposium_certs / totalStats.total_symposium_certs) * 100).toFixed(2)
      : 0;
    const bookDownloadRate = totalStats.total_book_certs > 0
      ? ((totalStats.downloaded_book_certs / totalStats.total_book_certs) * 100).toFixed(2)
      : 0;
    const attendeeDownloadRate = totalStats.total_attendee_certs > 0
      ? ((totalStats.downloaded_attendee_certs / totalStats.total_attendee_certs) * 100).toFixed(2)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        presenters: {
          total_downloads: parseInt(presenterStats.rows[0].total_downloads),
          unique_downloads: parseInt(presenterStats.rows[0].unique_certificates),
          repeated_downloads: parseInt(presenterStats.rows[0].repeated_downloads),
          total_certificates: parseInt(totalStats.total_presenter_certs),
          downloaded_certificates: parseInt(totalStats.downloaded_presenter_certs),
          download_rate: parseFloat(presenterDownloadRate),
          by_day: presentersByDay.rows,
          top_downloads: topPresenters.rows,
          repeated: repeatedPresenters.rows
        },
        symposiums: {
          total_downloads: parseInt(symposiumStats.rows[0].total_downloads),
          unique_downloads: parseInt(symposiumStats.rows[0].unique_certificates),
          repeated_downloads: parseInt(symposiumStats.rows[0].repeated_downloads),
          total_certificates: parseInt(totalStats.total_symposium_certs),
          downloaded_certificates: parseInt(totalStats.downloaded_symposium_certs),
          download_rate: parseFloat(symposiumDownloadRate),
          by_day: symposiumsByDay.rows,
          top_downloads: topSymposiums.rows
        },
        books: {
          total_downloads: parseInt(bookStats.rows[0].total_downloads),
          unique_downloads: parseInt(bookStats.rows[0].unique_certificates),
          repeated_downloads: parseInt(bookStats.rows[0].repeated_downloads),
          total_certificates: parseInt(totalStats.total_book_certs),
          downloaded_certificates: parseInt(totalStats.downloaded_book_certs),
          download_rate: parseFloat(bookDownloadRate),
          by_day: booksByDay.rows,
          top_downloads: topBooks.rows,
          repeated: repeatedBooks.rows
        },
        attendees: {
          total_downloads: parseInt(attendeeStats.rows[0].total_downloads),
          unique_downloads: parseInt(attendeeStats.rows[0].unique_certificates),
          repeated_downloads: parseInt(attendeeStats.rows[0].repeated_downloads),
          total_certificates: parseInt(totalStats.total_attendee_certs),
          downloaded_certificates: parseInt(totalStats.downloaded_attendee_certs),
          download_rate: parseFloat(attendeeDownloadRate),
          by_day: attendeesByDay.rows,
          repeated: repeatedAttendees.rows
        },
        combined: {
          total_downloads: parseInt(presenterStats.rows[0].total_downloads) + parseInt(symposiumStats.rows[0].total_downloads) + parseInt(bookStats.rows[0].total_downloads) + parseInt(attendeeStats.rows[0].total_downloads),
          total_unique: parseInt(presenterStats.rows[0].unique_certificates) + parseInt(symposiumStats.rows[0].unique_certificates) + parseInt(bookStats.rows[0].unique_certificates) + parseInt(attendeeStats.rows[0].unique_certificates),
          by_hour: downloadsByHour.rows
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas de descargas:', error);

    return res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas de descargas',
      error: error.message
    });
  }
};
