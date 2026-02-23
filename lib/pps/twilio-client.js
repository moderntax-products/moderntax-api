import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

let client = null;

export function getTwilioClient() {
  if (!client) {
    if (!accountSid || !authToken) {
      throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
    }
    client = twilio(accountSid, authToken);
  }
  return client;
}

// IRS PPS number
export const IRS_PPS_NUMBER = '+18005829876';

// Base URL for Twilio webhooks
export const WEBHOOK_BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.WEBHOOK_BASE_URL || 'https://moderntax-api-live.vercel.app';

/**
 * Pick the next callback number using round-robin from DB.
 */
export async function getNextCallbackNumber(supabase) {
  const { data: numbers } = await supabase
    .from('pps_callback_numbers')
    .select('*')
    .eq('is_active', true)
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(1);

  if (!numbers?.length) {
    const envNumbers = (process.env.PPS_CALLBACK_NUMBERS || '').split(',').filter(Boolean);
    if (!envNumbers.length) throw new Error('No callback numbers configured');
    return envNumbers[0].trim();
  }

  const chosen = numbers[0];
  await supabase
    .from('pps_callback_numbers')
    .update({ last_used_at: new Date().toISOString(), total_calls: (chosen.total_calls || 0) + 1 })
    .eq('id', chosen.id);

  return chosen.phone_number;
}

/**
 * Start a PPS call session.
 *
 * Creates a Twilio Conference with two legs:
 * 1. Outbound to IRS PPS
 * 2. Outbound to the expert (Tanya)
 *
 * Both join the same conference room so:
 * - Expert hears hold music / IRS agent
 * - IRS agent hears the expert
 * - We record the entire conference
 * - We stream audio to our WS server for live transcription
 */
export async function startPPSCall({ callId, expertPhone, fromNumber, supabase }) {
  const twilioClient = getTwilioClient();
  const from = fromNumber || await getNextCallbackNumber(supabase);

  // Leg 1: Call IRS PPS → joins conference
  const irsCall = await twilioClient.calls.create({
    to: IRS_PPS_NUMBER,
    from,
    url: `${WEBHOOK_BASE_URL}/api/v1/pps/twiml/irs-join?callId=${callId}`,
    method: 'POST',
    statusCallback: `${WEBHOOK_BASE_URL}/api/v1/pps/status-callback`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    timeout: 120,
  });

  // Leg 2: Call the expert → joins same conference
  // Expert joins right away so she's on the line when IRS picks up
  const expertCall = await twilioClient.calls.create({
    to: expertPhone,
    from,
    url: `${WEBHOOK_BASE_URL}/api/v1/pps/twiml/expert-join?callId=${callId}`,
    method: 'POST',
    statusCallback: `${WEBHOOK_BASE_URL}/api/v1/pps/status-callback`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    timeout: 60,
  });

  return {
    irsCallSid: irsCall.sid,
    expertCallSid: expertCall.sid,
    fromNumber: from,
    status: 'dialing',
  };
}

/**
 * End a call gracefully.
 */
export async function endCall(callSid) {
  const twilioClient = getTwilioClient();
  await twilioClient.calls(callSid).update({ status: 'completed' });
}

/**
 * Get call recording URL.
 */
export async function getRecordingUrl(callSid) {
  const twilioClient = getTwilioClient();
  const recordings = await twilioClient.calls(callSid).recordings.list({ limit: 1 });
  if (recordings.length > 0) {
    return `https://api.twilio.com${recordings[0].uri.replace('.json', '.mp3')}`;
  }
  return null;
}
