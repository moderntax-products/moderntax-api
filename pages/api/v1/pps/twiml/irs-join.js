import { WEBHOOK_BASE_URL } from '../../../../../lib/pps/twilio-client.js';

/**
 * POST /api/v1/pps/twiml/irs-join?callId=xxx
 *
 * TwiML for the IRS leg of the call.
 * When IRS answers, this call joins a conference room.
 * We also start a media stream for real-time transcription.
 */
export default function handler(req, res) {
  const callId = req.query.callId;

  if (!callId) {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(400).send('<Response><Say>Error: missing call ID</Say></Response>');
  }

  const wsHost = process.env.PPS_WS_HOST || 'localhost:8080';
  const streamUrl = `wss://${wsHost}/media-stream?callId=${callId}`;
  const conferenceName = `pps-${callId}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${streamUrl}" track="both_tracks">
      <Parameter name="callId" value="${callId}" />
      <Parameter name="leg" value="irs" />
    </Stream>
  </Start>
  <Dial>
    <Conference
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      record="record-from-start"
      recordingStatusCallback="${WEBHOOK_BASE_URL}/api/v1/pps/recording-callback"
      recordingStatusCallbackMethod="POST"
      statusCallback="${WEBHOOK_BASE_URL}/api/v1/pps/conference-callback?callId=${callId}"
      statusCallbackEvent="start end join leave"
      statusCallbackMethod="POST"
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
