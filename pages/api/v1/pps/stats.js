import { supabaseAdmin } from '../../../../lib/supabase-admin.js';

/**
 * GET /api/v1/pps/stats
 *
 * Dashboard statistics for PPS call operations.
 *
 * Query params:
 *   period: 'today' | 'week' | 'month' | 'all' (default: 'today')
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.PPS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const period = req.query.period || 'today';
    let fromDate;

    const now = new Date();
    switch (period) {
      case 'today':
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        break;
      case 'week':
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'month':
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'all':
        fromDate = '2020-01-01T00:00:00Z';
        break;
      default:
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }

    // Total calls in period
    const { count: totalCalls } = await supabaseAdmin
      .from('pps_calls')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fromDate);

    // Completed calls
    const { count: completedCalls } = await supabaseAdmin
      .from('pps_calls')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fromDate)
      .eq('status', 'completed');

    // Failed calls
    const { count: failedCalls } = await supabaseAdmin
      .from('pps_calls')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fromDate)
      .eq('status', 'failed');

    // Active/in-progress calls
    const { count: activeCalls } = await supabaseAdmin
      .from('pps_calls')
      .select('id', { count: 'exact', head: true })
      .in('status', ['dialing', 'in_progress', 'on_hold']);

    // Total transcript requests in period
    const { count: totalRequests } = await supabaseAdmin
      .from('pps_call_requests')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fromDate);

    // Successful transcript requests
    const { count: sentRequests } = await supabaseAdmin
      .from('pps_call_requests')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fromDate)
      .eq('status', 'sent');

    // Average call duration (completed calls)
    const { data: durationData } = await supabaseAdmin
      .from('pps_calls')
      .select('total_duration_seconds')
      .gte('created_at', fromDate)
      .eq('status', 'completed')
      .not('total_duration_seconds', 'is', null);

    const avgDuration = durationData?.length
      ? Math.round(durationData.reduce((sum, c) => sum + (c.total_duration_seconds || 0), 0) / durationData.length)
      : 0;

    // Recent calls
    const { data: recentCalls } = await supabaseAdmin
      .from('pps_calls')
      .select('id, status, from_number, started_at, ended_at, total_duration_seconds, ai_summary')
      .order('created_at', { ascending: false })
      .limit(5);

    return res.status(200).json({
      period,
      stats: {
        totalCalls: totalCalls || 0,
        completedCalls: completedCalls || 0,
        failedCalls: failedCalls || 0,
        activeCalls: activeCalls || 0,
        totalRequests: totalRequests || 0,
        sentRequests: sentRequests || 0,
        successRate: totalRequests > 0 ? Math.round((sentRequests / totalRequests) * 100) : 0,
        avgDurationSeconds: avgDuration,
        avgDurationFormatted: `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`,
      },
      recentCalls: recentCalls || [],
    });
  } catch (err) {
    console.error('Failed to get stats:', err);
    return res.status(500).json({ error: err.message });
  }
}
