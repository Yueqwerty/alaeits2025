import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Fetching events from database...');
    console.log('POSTGRES_URL available:', !!process.env.POSTGRES_URL);
    
    const events = await sql`
      SELECT
        id,
        event_type,
        title,
        authors,
        eje,
        mesa_title,
        scheduled_day,
        scheduled_time_block,
        room,
        turn_order,
        status,
        updated_at
      FROM events
      WHERE status = 'publicado'
        AND event_type != 'discusion'
      ORDER BY
        scheduled_day,
        scheduled_time_block,
        room,
        turn_order NULLS LAST
    `;

    console.log(`📊 Found ${events.length} published events`);

    // Transformar datos
    const ponenciasIndividuales = events.map(event => {
      const mesaId = event.mesa_title?.es 
        ? event.mesa_title.es.match(/MESA[- ]?(\d+)/i)?.[0] || 'MESA-' + event.id.substring(0, 3)
        : 'MESA-' + event.id.substring(0, 3);

      return {
        id: event.id,
        titulo: event.title?.es || event.title || 'Sin Título',
        autores: event.authors?.es 
          ? (Array.isArray(event.authors.es) ? event.authors.es : event.authors.es.split(',').map(a => a.trim()))
          : (event.authors ? String(event.authors).split(',').map(a => a.trim()) : []),
        mesaId: mesaId,
        mesaTitulo: event.mesa_title?.es || event.mesa_title || 'Mesa sin título',
        dia: event.scheduled_day || '',
        horario: event.scheduled_time_block || '',
        sala: event.room || '',
        eje: event.eje?.es || event.eje || null,
        esSimposio: event.event_type === 'simposio',
        turnOrder: event.turn_order
      };
    });

    return res.status(200).json({
      success: true,
      data: ponenciasIndividuales,
      count: ponenciasIndividuales.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in events-public endpoint:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error.message,
      stack: error.stack
    });
  }
}