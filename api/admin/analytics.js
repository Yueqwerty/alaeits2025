require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token not provided' });
    }
    
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET);

    // Get comprehensive analytics - CORREGIDO: 6 queries para 6 variables
    const [
      totalEvents,
      eventsByStatus,
      eventsByType,
      eventsByDay,
      timeSlotUtilization,
      recentActivity
    ] = await Promise.all([
      // Total events count
      pool.query('SELECT COUNT(*) as total FROM events'),
      
      // Events by status
      pool.query(`
        SELECT status, COUNT(*) as count 
        FROM events 
        GROUP BY status
      `),
      
      // Events by type
      pool.query(`
        SELECT event_type, COUNT(*) as count 
        FROM events 
        GROUP BY event_type
      `),
      
      // Events by day
      pool.query(`
        SELECT 
          COALESCE(scheduled_day, 'Unscheduled') as scheduled_day, 
          COUNT(*) as count 
        FROM events 
        GROUP BY scheduled_day 
        ORDER BY 
          CASE WHEN scheduled_day IS NULL THEN 1 ELSE 0 END,
          scheduled_day
      `),
      
      // Time slot utilization
      pool.query(`
        SELECT 
          scheduled_day,
          scheduled_time_block,
          COUNT(*) as events_count,
          COUNT(DISTINCT room) as rooms_used
        FROM events 
        WHERE scheduled_day IS NOT NULL AND scheduled_time_block IS NOT NULL
        GROUP BY scheduled_day, scheduled_time_block 
        ORDER BY scheduled_day, scheduled_time_block
      `),
      
      // Recent activity (last 10 updates)
      pool.query(`
        SELECT id, title, status, updated_at, event_type
        FROM events 
        ORDER BY updated_at DESC 
        LIMIT 10
      `)
    ]);

    // Calculate additional metrics
    const totalCount = parseInt(totalEvents.rows[0].total);
    const totalScheduled = eventsByStatus.rows.find(r => r.status === 'publicado')?.count || 0;
    const totalDrafts = eventsByStatus.rows.find(r => r.status === 'borrador')?.count || 0;
    const completionRate = totalCount > 0 ? 
      (totalScheduled / totalCount * 100).toFixed(1) : 0;

    // Calculate room utilization based on actual data
    const totalTimeSlots = timeSlotUtilization.rows.length;
    const maxPossibleSlots = totalTimeSlots * 30; // Assuming 30 rooms max
    const actualUsedSlots = timeSlotUtilization.rows.reduce((sum, slot) => 
      sum + parseInt(slot.rooms_used), 0
    );
    const overallUtilization = maxPossibleSlots > 0 ? 
      ((actualUsedSlots / maxPossibleSlots) * 100).toFixed(1) : 0;

    // Separate room utilization query - NUEVA QUERY
    const roomUtilizationQuery = await pool.query(`
      SELECT 
        room,
        COUNT(*) as events_count,
        COUNT(DISTINCT CONCAT(scheduled_day, '-', scheduled_time_block)) as time_slots_used
      FROM events 
      WHERE room IS NOT NULL AND scheduled_day IS NOT NULL 
      GROUP BY room 
      ORDER BY room::int
    `);

    const analytics = {
      summary: {
        totalEvents: totalCount,
        totalScheduled: parseInt(totalScheduled),
        totalDrafts: parseInt(totalDrafts),
        completionRate: parseFloat(completionRate),
        overallUtilization: parseFloat(overallUtilization)
      },
      eventsByStatus: eventsByStatus.rows.map(row => ({
        status: row.status,
        count: parseInt(row.count)
      })),
      eventsByType: eventsByType.rows.map(row => ({
        event_type: row.event_type,
        count: parseInt(row.count)
      })),
      eventsByDay: eventsByDay.rows.map(row => ({
        scheduled_day: row.scheduled_day,
        count: parseInt(row.count)
      })),
      roomUtilization: roomUtilizationQuery.rows.map(row => ({
        room: parseInt(row.room),
        events_count: parseInt(row.events_count),
        time_slots_used: parseInt(row.time_slots_used),
        utilization_rate: ((parseInt(row.time_slots_used) / 11) * 100).toFixed(1)
      })),
      timeSlotUtilization: timeSlotUtilization.rows.map(row => ({
        scheduled_day: row.scheduled_day,
        scheduled_time_block: row.scheduled_time_block,
        events_count: parseInt(row.events_count),
        rooms_used: parseInt(row.rooms_used),
        utilization_rate: ((parseInt(row.rooms_used) / 30) * 100).toFixed(1)
      })),
      recentActivity: recentActivity.rows
    };

    return res.status(200).json(analytics);

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    console.error('Error in /api/admin/analytics:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};