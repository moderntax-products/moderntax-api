import { supabaseAdmin } from '../../../../lib/supabase-admin.js';

/**
 * POST /api/v1/pps/conference-callback?callId=xxx
 *
 * Twilio calls this with conference events:
 * - start, end, join, leave
 *
 * Used to track when IRS agent / practitioner join/leave
 * the conference call.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const callId = req.query.callId;
  const {
    ConferenceSid,
    StatusCallbackEvent,
    CallSid,
    Muted,
    Hold,
  } = req.body;

  console.log(`[ConferenceCallback] callId=${callId} event=${StatusCallbackEvent} participant=${CallSid}`);

  // Log events for debugging; the main call tracking is handled by status-callback
  if (StatusCallbackEvent === 'participant-join') {
    console.log(`[ConferenceCallback] Participant joined conference for call ${callId}`);
  }

  if (StatusCallbackEvent === 'conference-end') {
    console.log(`[ConferenceCallback] Conference ended for call ${callId}`);
  }

  return res.status(200).send('OK');
}
