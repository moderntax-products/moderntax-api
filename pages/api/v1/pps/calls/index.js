import { supabaseAdmin } from '../../../../../lib/supabase-admin.js';

/**
 * GET /api/v1/pps/calls
 *
 * List all PPS calls with pagination and filtering.
 *
 * Query params:
 *   status: Filter by status (queued, dialing, in_progress, completed, failed)
 *   limit: Number of results (default 20, max 100)
 *   offset: Pagination offset
 *   from: Start date (ISO)
 *   to: End date (ISO)
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
    const {
      status,
      limit = 20,
      offset = 0,
      from,
      to,
    } = req.query;

    let query = supabaseAdmin
      .from('pps_calls')
      .select(`
        id, call_sid, status, direction, from_number,
        irs_agent_name, practitioner_name,
        started_at, connected_at, ended_at,
        hold_duration_seconds, total_duration_seconds,
        recording_url, ai_summary,
        created_at
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }

    const { data: calls, count, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      calls,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    console.error('Failed to list calls:', err);
    return res.status(500).json({ error: err.message });
  }
}
