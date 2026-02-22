import { WEBHOOK_BASE_URL } from '../../../../lib/pps/twilio-client.js';

/**
 * POST /api/v1/pps/twiml?callId=xxx
 *
 * Returns TwiML instructions when the IRS PPS call connects.
 *
 * This endpoint does three things:
 * 1. Starts recording the call
 * 2. Opens a media stream to send audio to our WebSocket for transcription
 * 3. Connects the call (dials through to IRS PPS or connects to conference)
 *
 * Twilio calls this URL when the outbound call is initiated.
 */
export default async function handler(req, res) {
  const callId = req.query.callId || req.body?.callId;

  if (!callId) {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(400).send('<Response><Say>Error: missing call ID</Say></Response>');
  }

  // The WebSocket URL for our media stream handler
  const wsUrl = WEBHOOK_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
  const streamUrl = `${wsUrl}/api/v1/pps/media-stream?callId=${callId}`;

  // Generate TwiML
  // We use a <Conference> so we can:
  // - Bridge the human practitioner in later
  // - Record all participants
  // - Stream audio for transcription
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${streamUrl}" track="both_tracks">
      <Parameter name="callId" value="${callId}" />
    </Stream>
  </Start>
  <Dial record="record-from-answer-dual"
        recordingStatusCallback="${WEBHOOK_BASE_URL}/api/v1/pps/recording-callback"
        recordingStatusCallbackMethod="POST">
    <Conference
      startConferenceOnEnter="true"
      endConferenceOnExit="false"
      record="record-from-start"
      statusCallback="${WEBHOOK_BASE_URL}/api/v1/pps/conference-callback?callId=${callId}"
      statusCallbackEvent="start end join leave"
      statusCallbackMethod="POST"
      beep="false"
      waitUrl="">
      pps-call-${callId}
    </Conference>
  </Dial>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}
