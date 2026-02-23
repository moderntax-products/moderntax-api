import { TranscriptionManager } from './transcription.js';
import { analyzeTranscript, generateCallSummary, extractRequestData } from './ai-agent.js';

/**
 * Active call sessions stored in memory.
 * Maps callId -> CallSession instance.
 *
 * Note: In a serverless environment (Vercel), this won't persist
 * across function invocations. For production, consider using
 * Redis or Supabase Realtime for session state. The DB is the
 * source of truth; this is just for the WebSocket handler.
 */
const activeSessions = new Map();

export function getSession(callId) {
  return activeSessions.get(callId);
}

export function getAllSessions() {
  return Array.from(activeSessions.values()).map(s => s.getState());
}

/**
 * Manages the lifecycle of a single PPS call.
 *
 * Coordinates between:
 * - Twilio (telephony)
 * - Deepgram (transcription)
 * - Claude (AI analysis)
 * - Supabase (persistence)
 * - WebSocket clients (live dashboard)
 */
export class CallSession {
  constructor({ callId, callSid, fromNumber, supabase }) {
    this.callId = callId;
    this.callSid = callSid;
    this.fromNumber = fromNumber;
    this.supabase = supabase;

    this.status = 'initializing';
    this.phase = 'dialing';
    this.transcription = null;
    this.wsClients = new Set(); // WebSocket clients listening to this call

    // Accumulated data
    this.transcriptSegments = [];
    this.requests = [];
    this.currentRequest = null;
    this.aiAnalysis = null;
    this.analysisBuffer = [];
    this.analysisTimer = null;

    // Register session
    activeSessions.set(callId, this);
  }

  /**
   * Start real-time transcription for this call.
   */
  async startTranscription() {
    this.transcription = new TranscriptionManager({
      callId: this.callId,
      supabase: this.supabase,
    });

    this.transcription.on('transcript', (segment) => {
      this.transcriptSegments.push(segment);
      this.analysisBuffer.push(segment);
      this._broadcastToClients('transcript', segment);

      // Debounce AI analysis — analyze every 3 seconds of accumulated segments
      this._scheduleAnalysis();
    });

    this.transcription.on('interim', (segment) => {
      this._broadcastToClients('interim', segment);
    });

    this.transcription.on('utterance_complete', (segments) => {
      this._broadcastToClients('utterance_complete', { segments });
    });

    this.transcription.on('error', (err) => {
      console.error(`[CallSession ${this.callId}] Transcription error:`, err);
      this._broadcastToClients('error', { message: 'Transcription error' });
    });

    await this.transcription.start();
    this.status = 'transcribing';
    await this._updateCallStatus('in_progress');
  }

  /**
   * Feed audio data from Twilio media stream.
   */
  sendAudio(base64Audio) {
    if (this.transcription) {
      this.transcription.sendAudio(base64Audio);
    }
  }

  /**
   * Schedule AI analysis after accumulating a few segments.
   */
  _scheduleAnalysis() {
    if (this.analysisTimer) return;

    this.analysisTimer = setTimeout(async () => {
      this.analysisTimer = null;

      if (this.analysisBuffer.length === 0) return;

      const segments = [...this.analysisBuffer];
      this.analysisBuffer = [];

      try {
        const analysis = await analyzeTranscript(segments, {
          currentPhase: this.phase,
          previousRequests: this.requests,
        });

        this.aiAnalysis = analysis;
        this.phase = analysis.phase || this.phase;

        // Check if we have a new request detected
        if (analysis.extracted_data?.current_ein && !this.currentRequest?.ein) {
          await this._createNewRequest(analysis.extracted_data);
        } else if (analysis.extracted_data?.current_ein && this.currentRequest?.ein !== analysis.extracted_data.current_ein) {
          // New EIN = new client on this call
          await this._finalizeCurrentRequest(analysis);
          await this._createNewRequest(analysis.extracted_data);
        } else if (this.currentRequest && analysis.extracted_data) {
          await this._updateCurrentRequest(analysis.extracted_data);
        }

        // Check for confirmation
        if (analysis.extracted_data?.transcripts_confirmed_sent && this.currentRequest) {
          this.currentRequest.status = 'sent';
          this.currentRequest.transcripts_received = true;
          await this._persistCurrentRequest();
        }

        this._broadcastToClients('analysis', analysis);
        await this._updateCallPhase(analysis.phase);
      } catch (err) {
        console.error(`[CallSession ${this.callId}] Analysis failed:`, err);
      }
    }, 3000);
  }

  /**
   * Create a new transcript request entry.
   */
  async _createNewRequest(data) {
    this.currentRequest = {
      call_id: this.callId,
      business_name: data.current_business_name || 'Unknown',
      ein: data.current_ein || '',
      entity_type: data.current_entity_type || null,
      form_types: data.current_form_types || [],
      transcript_types: data.current_transcript_types || [],
      tax_years: data.current_tax_years || [],
      auth_form_type: '8821',
      status: 'in_progress',
      request_order: this.requests.length,
    };

    await this._persistCurrentRequest();
    this._broadcastToClients('new_request', this.currentRequest);
  }

  /**
   * Update the current request with new extracted data.
   */
  async _updateCurrentRequest(data) {
    if (!this.currentRequest) return;

    if (data.current_business_name) this.currentRequest.business_name = data.current_business_name;
    if (data.current_form_types?.length) this.currentRequest.form_types = data.current_form_types;
    if (data.current_transcript_types?.length) this.currentRequest.transcript_types = data.current_transcript_types;
    if (data.current_tax_years?.length) this.currentRequest.tax_years = data.current_tax_years;
    if (data.current_entity_type) this.currentRequest.entity_type = data.current_entity_type;
    if (data.fax_confirmed) {
      this.currentRequest.auth_form_faxed = true;
      this.currentRequest.auth_form_confirmed = true;
    }

    await this._persistCurrentRequest();
    this._broadcastToClients('request_updated', this.currentRequest);
  }

  /**
   * Finalize the current request and move it to the completed list.
   */
  async _finalizeCurrentRequest(analysis) {
    if (!this.currentRequest) return;

    if (this.currentRequest.status === 'in_progress') {
      this.currentRequest.status = analysis?.extracted_data?.transcripts_confirmed_sent ? 'sent' : 'approved';
    }

    this.requests.push({ ...this.currentRequest });
    await this._persistCurrentRequest();
    this.currentRequest = null;
  }

  /**
   * Persist the current request to the database.
   */
  async _persistCurrentRequest() {
    if (!this.supabase || !this.currentRequest) return;

    try {
      if (this.currentRequest.id) {
        // Update existing
        await this.supabase
          .from('pps_call_requests')
          .update({
            business_name: this.currentRequest.business_name,
            ein: this.currentRequest.ein,
            entity_type: this.currentRequest.entity_type,
            form_types: this.currentRequest.form_types,
            transcript_types: this.currentRequest.transcript_types,
            tax_years: this.currentRequest.tax_years,
            auth_form_type: this.currentRequest.auth_form_type,
            auth_form_faxed: this.currentRequest.auth_form_faxed,
            auth_form_confirmed: this.currentRequest.auth_form_confirmed,
            status: this.currentRequest.status,
            transcripts_received: this.currentRequest.transcripts_received,
          })
          .eq('id', this.currentRequest.id);
      } else {
        // Insert new
        const { data, error } = await this.supabase
          .from('pps_call_requests')
          .insert({
            call_id: this.currentRequest.call_id,
            business_name: this.currentRequest.business_name,
            ein: this.currentRequest.ein,
            entity_type: this.currentRequest.entity_type,
            form_types: this.currentRequest.form_types,
            transcript_types: this.currentRequest.transcript_types,
            tax_years: this.currentRequest.tax_years,
            auth_form_type: this.currentRequest.auth_form_type,
            status: this.currentRequest.status,
            request_order: this.currentRequest.request_order,
          })
          .select('id')
          .single();

        if (data) {
          this.currentRequest.id = data.id;
        }
      }
    } catch (err) {
      console.error('[CallSession] Failed to persist request:', err.message);
    }
  }

  /**
   * Update call status in the database.
   */
  async _updateCallStatus(status) {
    this.status = status;
    if (!this.supabase) return;

    const updates = { status };
    if (status === 'in_progress') {
      updates.connected_at = new Date().toISOString();
    }
    if (status === 'completed') {
      updates.ended_at = new Date().toISOString();
    }

    await this.supabase
      .from('pps_calls')
      .update(updates)
      .eq('id', this.callId);
  }

  /**
   * Update the detected call phase.
   */
  async _updateCallPhase(phase) {
    if (!phase || phase === this.phase) return;
    this.phase = phase;
  }

  /**
   * Handle Twilio status callback events.
   */
  async handleStatusEvent(event) {
    const { CallStatus, CallDuration } = event;

    switch (CallStatus) {
      case 'in-progress':
        this.status = 'in_progress';
        await this._updateCallStatus('in_progress');
        break;
      case 'completed':
        await this.endCall(parseInt(CallDuration) || 0);
        break;
      case 'failed':
      case 'busy':
      case 'no-answer':
        this.status = 'failed';
        await this._updateCallStatus('failed');
        this._broadcastToClients('call_ended', { status: 'failed', reason: CallStatus });
        this.cleanup();
        break;
    }
  }

  /**
   * End the call and generate summary.
   */
  async endCall(durationSeconds = 0) {
    // Finalize any in-progress request
    await this._finalizeCurrentRequest(this.aiAnalysis);

    // Close transcription
    if (this.transcription) {
      this.transcription.close();
    }

    // Get full transcript
    const fullTranscript = this.transcriptSegments
      .map(s => `[${s.speaker}] ${s.text}`)
      .join('\n');

    // Generate AI summary
    let summary = null;
    try {
      summary = await generateCallSummary(fullTranscript, this.requests);
    } catch (err) {
      console.error('[CallSession] Summary generation failed:', err);
    }

    // Persist final state
    if (this.supabase) {
      await this.supabase
        .from('pps_calls')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          total_duration_seconds: durationSeconds,
          full_transcript: fullTranscript,
          transcript_segments: this.transcriptSegments,
          ai_summary: summary?.overview || null,
          ai_extracted_data: summary || {},
        })
        .eq('id', this.callId);
    }

    this._broadcastToClients('call_ended', {
      status: 'completed',
      duration: durationSeconds,
      summary,
      requests: this.requests,
    });

    this.cleanup();
  }

  /**
   * Register a WebSocket client for live updates.
   */
  addClient(ws) {
    this.wsClients.add(ws);

    // Send current state to new client
    ws.send(JSON.stringify({
      type: 'state',
      data: this.getState(),
    }));

    ws.on('close', () => {
      this.wsClients.delete(ws);
    });
  }

  /**
   * Broadcast an event to all connected WebSocket clients.
   */
  _broadcastToClients(type, data) {
    const message = JSON.stringify({ type, data });
    for (const ws of this.wsClients) {
      try {
        ws.send(message);
      } catch {
        this.wsClients.delete(ws);
      }
    }
  }

  /**
   * Get current session state for API responses.
   */
  getState() {
    return {
      callId: this.callId,
      callSid: this.callSid,
      status: this.status,
      phase: this.phase,
      fromNumber: this.fromNumber,
      requests: this.requests,
      currentRequest: this.currentRequest,
      aiAnalysis: this.aiAnalysis,
      segmentCount: this.transcriptSegments.length,
      recentTranscript: this.transcriptSegments.slice(-10),
    };
  }

  /**
   * Clean up resources.
   */
  cleanup() {
    if (this.analysisTimer) {
      clearTimeout(this.analysisTimer);
    }
    if (this.transcription) {
      this.transcription.close();
    }
    activeSessions.delete(this.callId);
  }
}
