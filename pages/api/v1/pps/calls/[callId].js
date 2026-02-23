import { supabaseAdmin } from '../../../../../lib/supabase-admin.js';

/**
 * GET /api/v1/pps/calls/:callId
 *
 * Get detailed information about a specific PPS call,
 * including all transcript requests and transcript segments.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.PPS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { callId } = req.query;

  try {
    // Fetch call record
    const { data: call, error: callError } = await supabaseAdmin
      .from('pps_calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Fetch associated transcript requests
    const { data: requests } = await supabaseAdmin
      .from('pps_call_requests')
      .select('*')
      .eq('call_id', callId)
      .order('request_order', { ascending: true });

    // Fetch transcript segments
    const { data: segments } = await supabaseAdmin
      .from('pps_transcript_segments')
      .select('speaker, text, confidence, timestamp_ms, ai_intent, ai_extracted, created_at')
      .eq('call_id', callId)
      .order('timestamp_ms', { ascending: true });

    return res.status(200).json({
      call,
      requests: requests || [],
      segments: segments || [],
    });
  } catch (err) {
    console.error('Failed to get call details:', err);
    return res.status(500).json({ error: err.message });
  }
}
