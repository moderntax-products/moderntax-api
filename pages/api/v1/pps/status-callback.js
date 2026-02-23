import { supabaseAdmin } from '../../../../lib/supabase-admin.js';
import { getSession } from '../../../../lib/pps/call-session.js';

/**
 * POST /api/v1/pps/status-callback
 *
 * Twilio calls this endpoint with call status updates:
 * - initiated, ringing, in-progress, completed, failed, busy, no-answer
 *
 * We use this to update the call record in the database
 * and trigger the CallSession lifecycle events.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    CallSid,
    CallStatus,
    CallDuration,
    From,
    To,
    Direction,
  } = req.body;

  console.log(`[StatusCallback] CallSid=${CallSid} Status=${CallStatus} Duration=${CallDuration}`);

  try {
    // Find the call record by Twilio SID
    const { data: call } = await supabaseAdmin
      .from('pps_calls')
      .select('id, status')
      .eq('call_sid', CallSid)
      .single();

    if (!call) {
      console.warn(`[StatusCallback] No call record found for SID ${CallSid}`);
      return res.status(200).send('OK');
    }

    // Map Twilio status to our status
    const statusMap = {
      'initiated': 'dialing',
      'ringing': 'dialing',
      'in-progress': 'in_progress',
      'completed': 'completed',
      'failed': 'failed',
      'busy': 'failed',
      'no-answer': 'failed',
      'canceled': 'cancelled',
    };

    const newStatus = statusMap[CallStatus] || CallStatus;

    const updates = { status: newStatus };

    if (CallStatus === 'in-progress') {
      updates.connected_at = new Date().toISOString();
    }

    if (CallStatus === 'completed') {
      updates.ended_at = new Date().toISOString();
      updates.total_duration_seconds = parseInt(CallDuration) || 0;
    }

    await supabaseAdmin
      .from('pps_calls')
      .update(updates)
      .eq('id', call.id);

    // Notify the active session if one exists
    const session = getSession(call.id);
    if (session) {
      await session.handleStatusEvent({
        CallStatus,
        CallDuration,
      });
    }
  } catch (err) {
    console.error('[StatusCallback] Error:', err);
  }

  // Twilio expects a 200 response
  return res.status(200).send('OK');
}
