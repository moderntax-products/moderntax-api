/**
 * Standalone WebSocket server for IRS PPS Call Automation.
 *
 * Handles two types of WebSocket connections:
 * 1. Twilio Media Streams — receives real-time call audio
 * 2. Dashboard Clients — sends live transcription + analysis to the UI
 *
 * Run this alongside the Next.js app:
 *   node server/ws-server.js
 *
 * Environment variables:
 *   WS_PORT=8080
 *   DEEPGRAM_API_KEY=xxx
 *   ANTHROPIC_API_KEY=xxx
 *   SUPABASE_URL=xxx
 *   SUPABASE_SERVICE_KEY=xxx
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { createClient as createDeepgramClient } from '@deepgram/sdk';
import Anthropic from '@anthropic-ai/sdk';
import http from 'http';
import { URL } from 'url';

const PORT = process.env.WS_PORT || 8080;

// Supabase admin client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Active call sessions
const sessions = new Map();

// ============================================
// HTTP + WebSocket Server
// ============================================
const httpServer = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      activeSessions: sessions.size,
      uptime: process.uptime(),
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const callId = url.searchParams.get('callId');

  console.log(`[WS] New connection: ${path} callId=${callId}`);

  if (path === '/media-stream' && callId) {
    // Twilio media stream connection
    handleMediaStream(ws, callId);
  } else if (path === '/dashboard' && callId) {
    // Dashboard client subscribing to a specific call
    handleDashboardClient(ws, callId);
  } else if (path === '/dashboard') {
    // Dashboard client subscribing to all active calls
    handleDashboardOverview(ws);
  } else {
    ws.close(4000, 'Unknown path');
  }
});

// ============================================
// Media Stream Handler (from Twilio)
// ============================================
async function handleMediaStream(ws, callId) {
  console.log(`[MediaStream] Initializing for call ${callId}`);

  let session = sessions.get(callId);

  if (!session) {
    session = createSession(callId);
    sessions.set(callId, session);
  }

  // Start Deepgram transcription
  try {
    await startTranscription(session);
  } catch (err) {
    console.error(`[MediaStream] Failed to start transcription:`, err.message);
    ws.close(4001, 'Transcription init failed');
    return;
  }

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.event) {
        case 'connected':
          console.log(`[MediaStream] Twilio connected: ${msg.protocol}`);
          break;

        case 'start':
          session.streamSid = msg.start?.streamSid;
          session.callSid = msg.start?.callSid;
          console.log(`[MediaStream] Stream started: ${session.streamSid}`);
          broadcastToDashboard(callId, 'call_connected', { callId, streamSid: session.streamSid });
          break;

        case 'media':
          if (msg.media?.payload && session.deepgramConnection) {
            const audioBuffer = Buffer.from(msg.media.payload, 'base64');
            session.deepgramConnection.send(audioBuffer);
          }
          break;

        case 'stop':
          console.log(`[MediaStream] Stream stopped for call ${callId}`);
          break;
      }
    } catch (err) {
      // Binary data or parse error, ignore
    }
  });

  ws.on('close', () => {
    console.log(`[MediaStream] Twilio disconnected for call ${callId}`);
    endSession(callId);
  });

  ws.on('error', (err) => {
    console.error(`[MediaStream] Error for call ${callId}:`, err.message);
  });
}

// ============================================
// Session Management
// ============================================
function createSession(callId) {
  return {
    callId,
    callSid: null,
    streamSid: null,
    deepgramConnection: null,
    dashboardClients: new Set(),
    segments: [],
    analysisBuffer: [],
    analysisTimer: null,
    currentPhase: 'connecting',
    requests: [],
    currentRequest: null,
    startTime: Date.now(),
  };
}

async function startTranscription(session) {
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) throw new Error('Missing DEEPGRAM_API_KEY');

  const deepgram = createDeepgramClient(deepgramApiKey);

  const connection = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US',
    smart_format: true,
    punctuate: true,
    diarize: true,
    interim_results: true,
    utterance_end_ms: 1500,
    vad_events: true,
    encoding: 'mulaw',
    sample_rate: 8000,
    channels: 1,
  });

  session.deepgramConnection = connection;

  connection.on('open', () => {
    console.log(`[Transcription] Deepgram ready for call ${session.callId}`);
    broadcastToDashboard(session.callId, 'transcription_ready', {});
  });

  connection.on('Results', (data) => {
    const alt = data.channel?.alternatives?.[0];
    if (!alt?.transcript?.trim()) return;

    const text = alt.transcript.trim();
    const isFinal = data.is_final;
    const speaker = alt.words?.[0]?.speaker;
    const confidence = alt.confidence;
    const timestampMs = Date.now() - session.startTime;
    const speakerRole = classifySpeaker(speaker, text);

    if (isFinal) {
      const segment = { speaker: speakerRole, text, confidence, timestampMs, isFinal: true };
      session.segments.push(segment);
      session.analysisBuffer.push(segment);

      // Persist to DB
      persistSegment(session.callId, segment);

      // Broadcast to dashboard
      broadcastToDashboard(session.callId, 'transcript', segment);

      // Schedule AI analysis
      scheduleAnalysis(session);
    } else {
      broadcastToDashboard(session.callId, 'interim', {
        speaker: speakerRole,
        text,
        timestampMs,
        isFinal: false,
      });
    }
  });

  connection.on('error', (err) => {
    console.error(`[Transcription] Error for call ${session.callId}:`, err.message);
  });

  connection.on('close', () => {
    console.log(`[Transcription] Closed for call ${session.callId}`);
  });
}

function classifySpeaker(speakerId, text) {
  const lower = text.toLowerCase();
  const irsPatterns = ['may i help you', 'hold on please', 'put you on hold', 'thank you for holding', 'name of this business', 'what transcripts', 'authorization', 'i\'ll be back', 'on the way', 'sending'];
  const practPatterns = ['my name is', 'my ptin', 'ein number', 'corporation', '1120', '1065', '8821', 'faxing'];

  for (const p of irsPatterns) { if (lower.includes(p)) return 'irs_agent'; }
  for (const p of practPatterns) { if (lower.includes(p)) return 'practitioner'; }

  if (speakerId === 0) return 'practitioner';
  if (speakerId === 1) return 'irs_agent';
  return 'unknown';
}

async function persistSegment(callId, segment) {
  try {
    await supabase.from('pps_transcript_segments').insert({
      call_id: callId,
      speaker: segment.speaker,
      text: segment.text,
      confidence: segment.confidence,
      timestamp_ms: segment.timestampMs,
    });
  } catch (err) {
    console.error('[DB] Failed to persist segment:', err.message);
  }
}

// ============================================
// AI Analysis (debounced)
// ============================================
function scheduleAnalysis(session) {
  if (session.analysisTimer) return;

  session.analysisTimer = setTimeout(async () => {
    session.analysisTimer = null;
    if (session.analysisBuffer.length === 0) return;

    const segments = [...session.analysisBuffer];
    session.analysisBuffer = [];

    try {
      const analysis = await runAnalysis(segments, session);
      session.currentPhase = analysis.phase || session.currentPhase;

      // Handle new EIN detection → new request
      const ein = analysis.extracted_data?.current_ein;
      if (ein && (!session.currentRequest || session.currentRequest.ein !== ein)) {
        if (session.currentRequest) {
          session.requests.push({ ...session.currentRequest });
        }
        session.currentRequest = {
          call_id: session.callId,
          business_name: analysis.extracted_data.current_business_name || 'Unknown',
          ein,
          entity_type: analysis.extracted_data.current_entity_type,
          form_types: analysis.extracted_data.current_form_types || [],
          transcript_types: analysis.extracted_data.current_transcript_types || [],
          tax_years: analysis.extracted_data.current_tax_years || [],
          status: 'in_progress',
          request_order: session.requests.length,
        };
        broadcastToDashboard(session.callId, 'new_request', session.currentRequest);
      }

      broadcastToDashboard(session.callId, 'analysis', analysis);
    } catch (err) {
      console.error('[AI] Analysis error:', err.message);
    }
  }, 3000);
}

async function runAnalysis(segments, session) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const segmentText = segments.map(s => `[${s.speaker}] ${s.text}`).join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `You monitor IRS PPS calls. Analyze transcript segments and extract structured data. Return JSON with: phase, extracted_data (current_ein, current_business_name, current_form_types, current_transcript_types, current_tax_years, current_entity_type, fax_confirmed, transcripts_confirmed_sent), suggestions, issues, summary.`,
    messages: [{
      role: 'user',
      content: `Current phase: ${session.currentPhase}\nNew segments:\n${segmentText}`,
    }],
  });

  const text = response.content[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : { phase: 'unknown', extracted_data: {}, suggestions: [], issues: [], summary: '' };
}

// ============================================
// Session Cleanup
// ============================================
async function endSession(callId) {
  const session = sessions.get(callId);
  if (!session) return;

  // Close Deepgram
  if (session.deepgramConnection) {
    session.deepgramConnection.finish();
  }

  // Clear timers
  if (session.analysisTimer) {
    clearTimeout(session.analysisTimer);
  }

  // Finalize any pending request
  if (session.currentRequest) {
    session.requests.push({ ...session.currentRequest });
  }

  // Build full transcript
  const fullTranscript = session.segments.map(s => `[${s.speaker}] ${s.text}`).join('\n');

  // Update DB
  try {
    await supabase.from('pps_calls').update({
      full_transcript: fullTranscript,
      transcript_segments: session.segments,
    }).eq('id', callId);
  } catch (err) {
    console.error('[DB] Failed to save final transcript:', err.message);
  }

  broadcastToDashboard(callId, 'call_ended', {
    requests: session.requests,
    segmentCount: session.segments.length,
  });

  // Close dashboard clients
  for (const client of session.dashboardClients) {
    client.close(1000, 'Call ended');
  }

  sessions.delete(callId);
  console.log(`[Session] Cleaned up call ${callId}. Active sessions: ${sessions.size}`);
}

// ============================================
// Dashboard Client Handler
// ============================================
function handleDashboardClient(ws, callId) {
  const session = sessions.get(callId);

  if (!session) {
    // No active session, send current state from DB and close
    ws.send(JSON.stringify({ type: 'no_active_session', data: { callId } }));
    ws.close(1000, 'No active session');
    return;
  }

  session.dashboardClients.add(ws);

  // Send current state
  ws.send(JSON.stringify({
    type: 'state',
    data: {
      callId,
      phase: session.currentPhase,
      segments: session.segments.slice(-20),
      requests: session.requests,
      currentRequest: session.currentRequest,
    },
  }));

  ws.on('close', () => {
    session.dashboardClients.delete(ws);
  });
}

function handleDashboardOverview(ws) {
  // Send list of all active sessions
  const active = Array.from(sessions.entries()).map(([id, s]) => ({
    callId: id,
    phase: s.currentPhase,
    segmentCount: s.segments.length,
    requestCount: s.requests.length,
  }));

  ws.send(JSON.stringify({ type: 'active_sessions', data: active }));

  // Keep alive — periodically send updates
  const interval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(interval);
      return;
    }

    const updated = Array.from(sessions.entries()).map(([id, s]) => ({
      callId: id,
      phase: s.currentPhase,
      segmentCount: s.segments.length,
      requestCount: s.requests.length,
    }));

    ws.send(JSON.stringify({ type: 'active_sessions', data: updated }));
  }, 5000);

  ws.on('close', () => {
    clearInterval(interval);
  });
}

function broadcastToDashboard(callId, type, data) {
  const session = sessions.get(callId);
  if (!session) return;

  const message = JSON.stringify({ type, data });
  for (const client of session.dashboardClients) {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    } catch {
      session.dashboardClients.delete(client);
    }
  }
}

// ============================================
// Start Server
// ============================================
httpServer.listen(PORT, () => {
  console.log(`[PPS WS Server] Listening on port ${PORT}`);
  console.log(`[PPS WS Server] Media stream: ws://localhost:${PORT}/media-stream?callId=xxx`);
  console.log(`[PPS WS Server] Dashboard: ws://localhost:${PORT}/dashboard?callId=xxx`);
  console.log(`[PPS WS Server] Health: http://localhost:${PORT}/health`);
});
