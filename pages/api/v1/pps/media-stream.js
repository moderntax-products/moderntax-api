import { supabaseAdmin } from '../../../../lib/supabase-admin.js';
import { CallSession, getSession } from '../../../../lib/pps/call-session.js';

/**
 * WebSocket /api/v1/pps/media-stream?callId=xxx
 *
 * Receives the Twilio media stream (real-time audio) and pipes it
 * to Deepgram for transcription via the CallSession manager.
 *
 * NOTE: This endpoint requires WebSocket support. In Vercel's
 * serverless environment, this won't work natively. For production,
 * you'll need one of:
 *
 * 1. A dedicated WebSocket server (e.g., on Railway, Fly.io, or EC2)
 * 2. Vercel's Edge Runtime with WebSocket support (experimental)
 * 3. A proxy service like ngrok for development
 *
 * For now, this is structured as a Next.js API route that can be
 * adapted to whichever WebSocket hosting you choose.
 */

// Disable body parsing for WebSocket upgrade
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Check if this is a WebSocket upgrade request
  if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
    return res.status(426).json({
      error: 'WebSocket upgrade required',
      note: 'This endpoint handles Twilio media streams via WebSocket. See README for deployment options.',
    });
  }

  // In a real WebSocket-capable environment, handle the upgrade here.
  // Below is the message handling logic that would run inside the WS connection.

  res.status(200).json({
    message: 'Media stream endpoint ready. Requires WebSocket-capable hosting.',
    callId: req.query.callId,
  });
}

/**
 * WebSocket message handler for Twilio media streams.
 * Use this function in your WebSocket server implementation.
 *
 * Usage (e.g., in a standalone WS server):
 *
 *   import { WebSocketServer } from 'ws';
 *   import { handleTwilioMediaStream } from './media-stream.js';
 *
 *   const wss = new WebSocketServer({ port: 8080 });
 *   wss.on('connection', (ws, req) => {
 *     const callId = new URL(req.url, 'http://localhost').searchParams.get('callId');
 *     handleTwilioMediaStream(ws, callId);
 *   });
 */
export async function handleTwilioMediaStream(ws, callId) {
  console.log(`[MediaStream] New connection for call ${callId}`);

  let session = getSession(callId);
  let streamSid = null;

  if (!session) {
    // Create a new session
    session = new CallSession({
      callId,
      callSid: null, // Will be set from Twilio events
      fromNumber: null,
      supabase: supabaseAdmin,
    });

    try {
      await session.startTranscription();
    } catch (err) {
      console.error(`[MediaStream] Failed to start transcription:`, err);
      ws.close();
      return;
    }
  }

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.event) {
        case 'connected':
          console.log(`[MediaStream] Connected: ${msg.protocol}`);
          break;

        case 'start':
          streamSid = msg.start.streamSid;
          console.log(`[MediaStream] Stream started: ${streamSid}`);

          // Update session with call SID if available
          if (msg.start.callSid && session) {
            session.callSid = msg.start.callSid;
          }
          break;

        case 'media':
          // Forward audio to transcription
          if (session && msg.media?.payload) {
            session.sendAudio(msg.media.payload);
          }
          break;

        case 'stop':
          console.log(`[MediaStream] Stream stopped: ${streamSid}`);
          break;

        default:
          // Ignore unknown events (mark, dtmf, etc.)
          break;
      }
    } catch (err) {
      console.error('[MediaStream] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[MediaStream] Connection closed for call ${callId}`);
  });

  ws.on('error', (err) => {
    console.error(`[MediaStream] WebSocket error for call ${callId}:`, err);
  });
}
