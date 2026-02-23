import { supabaseAdmin } from '../../../../lib/supabase-admin.js';

/**
 * POST /api/v1/pps/recording-callback
 *
 * Twilio calls this when a recording is ready.
 * We save the recording URL to the call record.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    CallSid,
    RecordingSid,
    RecordingUrl,
    RecordingStatus,
    RecordingDuration,
  } = req.body;

  console.log(`[RecordingCallback] CallSid=${CallSid} RecordingSid=${RecordingSid} Status=${RecordingStatus}`);

  if (RecordingStatus === 'completed' && RecordingUrl) {
    try {
      await supabaseAdmin
        .from('pps_calls')
        .update({
          recording_url: RecordingUrl,
          recording_sid: RecordingSid,
        })
        .eq('call_sid', CallSid);
    } catch (err) {
      console.error('[RecordingCallback] Error saving recording:', err);
    }
  }

  return res.status(200).send('OK');
}
