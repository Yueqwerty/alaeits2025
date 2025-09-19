import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
  try {
    console.log('🔍 Debugging database connection...');
    
    // Verificar variables de entorno
    const hasPostgresUrl = !!process.env.POSTGRES_URL;
    console.log('POSTGRES_URL available:', hasPostgresUrl);

    if (!hasPostgresUrl) {
      return res.status(500).json({ 
        error: 'POSTGRES_URL not found in environment variables',
        availableVars: Object.keys(process.env).filter(key => key.includes('POSTGRES') || key.includes('DATABASE'))
      });
    }

    // Test conexión
    const connectionTest = await sql`SELECT NOW() as current_time, 'Connection OK' as status`;
    console.log('✅ Connection test:', connectionTest);

    // Verificar si la tabla existe
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'events'
      ) as exists
    `;
    console.log('📋 Table exists:', tableExists);

    // Contar todos los eventos
    const totalCount = await sql`SELECT COUNT(*) as total FROM events`;
    console.log('📊 Total events:', totalCount);

    // Contar por status
    const statusCount = await sql`
      SELECT status, COUNT(*) as count 
      FROM events 
      GROUP BY status
      ORDER BY count DESC
    `;
    console.log('📊 Events by status:', statusCount);

    // Primeros 3 eventos
    const sampleEvents = await sql`
      SELECT id, event_type, title, status, scheduled_day, authors
      FROM events 
      ORDER BY updated_at DESC
      LIMIT 3
    `;
    console.log('📄 Sample events:', sampleEvents);

    return res.status(200).json({
      success: true,
      connectionTest,
      tableExists,
      totalCount,
      statusCount,
      sampleEvents,
      environment: {
        hasPostgresUrl,
        nodeEnv: process.env.NODE_ENV
      }
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      environment: {
        hasPostgresUrl: !!process.env.POSTGRES_URL,
        nodeEnv: process.env.NODE_ENV
      }
    });
  }
}