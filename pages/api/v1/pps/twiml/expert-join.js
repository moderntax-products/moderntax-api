import { WEBHOOK_BASE_URL } from '../../../../../lib/pps/twilio-client.js';
import { supabaseAdmin } from '../../../../../lib/supabase-admin.js';

/**
 * POST /api/v1/pps/twiml/expert-join?callId=xxx
 *
 * TwiML for the expert (Tanya) leg of the call.
 * Expert joins the same conference room as the IRS call.
 *
 * Before joining, we play a brief whisper to the expert:
 * - What batch/requests she has
 * - How many EINs to request
 * - A quick reminder of the first business name/EIN
 */
export default async function handler(req, res) {
  const callId = req.query.callId;

  if (!callId) {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(400).send('<Response><Say>Error: missing call ID</Say></Response>');
  }

  const conferenceName = `pps-${callId}`;

  // Fetch the requests assigned to this call so we can brief the expert
  let briefingText = 'Connecting you to IRS PPS. ';
  try {
    const { data: requests } = await supabaseAdmin
      .from('pps_transcript_requests')
      .select('business_name, ein, form_types, transcript_types, tax_years')
      .eq('assigned_call_id', callId)
      .order('request_order', { ascending: true });

    if (requests?.length) {
      briefingText += `You have ${requests.length} request${requests.length > 1 ? 's' : ''} for this call. `;
      briefingText += `First up: ${requests[0].business_name}. `;
      briefingText += `Check your call script for details. `;
    }
  } catch (err) {
    // Non-critical, continue without briefing
  }

  briefingText += 'You will now be connected to the IRS hold line. Good luck.';

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${briefingText}</Say>
  <Dial>
    <Conference
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      record="record-from-start"
      beep="false"
      waitUrl=""
      waitMethod="GET">
      ${conferenceName}
    </Conference>
  </Dial>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}
