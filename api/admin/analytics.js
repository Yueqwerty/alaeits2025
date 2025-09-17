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

    // Get comprehensive analytics
    const [
      totalEvents,
      eventsByStatus,
      eventsByType,
      eventsByDay,
      roomUtilization,
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
        SELECT scheduled_day, COUNT(*) as count 
        FROM events 
        WHERE scheduled_day IS NOT NULL 
        GROUP BY scheduled_day 
        ORDER BY scheduled_day
      `),
      
      // Room utilization
      pool.query(`
        SELECT 
          room,
          COUNT(*) as events_count,
          COUNT(DISTINCT scheduled_day || scheduled_time_block) as time_slots_used
        FROM events 
        WHERE room IS NOT NULL 
        GROUP BY room 
        ORDER BY room
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
    const totalScheduled = eventsByStatus.rows.find(r => r.status === 'publicado')?.count || 0;
    const totalDrafts = eventsByStatus.rows.find(r => r.status === 'borrador')?.count || 0;
    const completionRate = totalEvents.rows[0].total > 0 ? 
      (totalScheduled / totalEvents.rows[0].total * 100).toFixed(1) : 0;

    // Room utilization percentage (assuming 30 rooms, 11 total time slots)
    const maxPossibleSlots = 30 * 11; // 30 rooms * 11 time slots
    const usedSlots = roomUtilization.rows.reduce((sum, room) => sum + parseInt(room.time_slots_used), 0);
    const overallUtilization = ((usedSlots / maxPossibleSlots) * 100).toFixed(1);

    const analytics = {
      summary: {
        totalEvents: parseInt(totalEvents.rows[0].total),
        totalScheduled,
        totalDrafts,
        completionRate: parseFloat(completionRate),
        overallUtilization: parseFloat(overallUtilization)
      },
      eventsByStatus: eventsByStatus.rows,
      eventsByType: eventsByType.rows,
      eventsByDay: eventsByDay.rows,
      roomUtilization: roomUtilization.rows.map(row => ({
        ...row,
        events_count: parseInt(row.events_count),
        time_slots_used: parseInt(row.time_slots_used),
        utilization_rate: ((parseInt(row.time_slots_used) / 11) * 100).toFixed(1)
      })),
      timeSlotUtilization: timeSlotUtilization.rows.map(row => ({
        ...row,
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
    return res.status(500).json({ message: 'Internal server error' });
  }
};