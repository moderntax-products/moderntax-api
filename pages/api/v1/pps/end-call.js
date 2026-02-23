import { supabaseAdmin } from '../../../../lib/supabase-admin.js';
import { endCall } from '../../../../lib/pps/twilio-client.js';
import { getSession } from '../../../../lib/pps/call-session.js';

/**
 * POST /api/v1/pps/end-call
 *
 * Manually end a PPS call.
 *
 * Body:
 * {
 *   "callId": "uuid"
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.PPS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { callId } = req.body || {};

  if (!callId) {
    return res.status(400).json({ error: 'callId is required' });
  }

  try {
    // Get call record
    const { data: call } = await supabaseAdmin
      .from('pps_calls')
      .select('id, call_sid, status')
      .eq('id', callId)
      .single();

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    if (call.status === 'completed' || call.status === 'failed') {
      return res.status(400).json({ error: 'Call already ended' });
    }

    // End via Twilio
    if (call.call_sid) {
      await endCall(call.call_sid);
    }

    // End the session (will trigger summary generation)
    const session = getSession(callId);
    if (session) {
      await session.endCall(0);
    } else {
      // No active session, just update the DB
      await supabaseAdmin
        .from('pps_calls')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', callId);
    }

    return res.status(200).json({ status: 'completed', callId });
  } catch (err) {
    console.error('Failed to end call:', err);
    return res.status(500).json({ error: err.message });
  }
}
