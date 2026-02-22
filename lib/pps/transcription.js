import { createClient } from '@deepgram/sdk';
import { EventEmitter } from 'events';

/**
 * Real-time transcription manager using Deepgram.
 *
 * Receives audio chunks from Twilio's media stream WebSocket,
 * sends them to Deepgram for real-time STT, and emits
 * transcription events for the AI agent to process.
 */
export class TranscriptionManager extends EventEmitter {
  constructor({ callId, supabase }) {
    super();
    this.callId = callId;
    this.supabase = supabase;
    this.deepgram = null;
    this.connection = null;
    this.segmentBuffer = [];
    this.startTime = Date.now();
    this.segmentCount = 0;
  }

  /**
   * Initialize Deepgram live transcription connection.
   */
  async start() {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('Missing DEEPGRAM_API_KEY');
    }

    this.deepgram = createClient(apiKey);
    this.startTime = Date.now();

    this.connection = this.deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      punctuate: true,
      diarize: true,          // Speaker separation
      interim_results: true,
      utterance_end_ms: 1500,
      vad_events: true,
      encoding: 'mulaw',      // Twilio sends mulaw
      sample_rate: 8000,       // Twilio sample rate
      channels: 1,
    });

    this.connection.on('open', () => {
      console.log(`[Transcription] Deepgram connection open for call ${this.callId}`);
      this.emit('ready');
    });

    this.connection.on('Results', (data) => {
      this._handleTranscriptResult(data);
    });

    this.connection.on('UtteranceEnd', () => {
      this._flushBuffer();
    });

    this.connection.on('error', (err) => {
      console.error(`[Transcription] Deepgram error for call ${this.callId}:`, err);
      this.emit('error', err);
    });

    this.connection.on('close', () => {
      console.log(`[Transcription] Deepgram connection closed for call ${this.callId}`);
      this._flushBuffer();
      this.emit('closed');
    });

    return this;
  }

  /**
   * Send audio data from Twilio media stream to Deepgram.
   * Twilio sends base64 encoded mulaw audio.
   */
  sendAudio(base64Audio) {
    if (this.connection) {
      const audioBuffer = Buffer.from(base64Audio, 'base64');
      this.connection.send(audioBuffer);
    }
  }

  /**
   * Handle a transcription result from Deepgram.
   */
  _handleTranscriptResult(data) {
    const transcript = data.channel?.alternatives?.[0];
    if (!transcript?.transcript) return;

    const text = transcript.transcript.trim();
    if (!text) return;

    const isFinal = data.is_final;
    const speaker = transcript.words?.[0]?.speaker;
    const confidence = transcript.confidence;
    const timestampMs = Math.round((Date.now() - this.startTime));

    // Map Deepgram speaker IDs to roles
    // Speaker 0 is typically the first speaker detected (us/practitioner)
    // Speaker 1 is the second speaker (IRS agent)
    const speakerRole = this._classifySpeaker(speaker, text);

    if (isFinal) {
      const segment = {
        speaker: speakerRole,
        speakerId: speaker,
        text,
        confidence,
        timestampMs,
        isFinal: true,
      };

      this.segmentBuffer.push(segment);
      this.emit('transcript', segment);

      // Persist to DB
      this._persistSegment(segment);
    } else {
      // Interim result — emit for live display but don't persist
      this.emit('interim', {
        speaker: speakerRole,
        text,
        timestampMs,
        isFinal: false,
      });
    }
  }

  /**
   * Classify speaker based on diarization ID and content heuristics.
   */
  _classifySpeaker(speakerId, text) {
    const lowerText = text.toLowerCase();

    // IRS agent indicators
    const irsIndicators = [
      'may i help you',
      'hold on please',
      'put you on hold',
      'thank you for holding',
      'name of this business',
      'what transcripts',
      'authorization',
      'i\'ll be back',
      'give me',
      'minutes',
      'on the way',
      'sending',
      'can i have',
      'do we have',
      'do you have the',
    ];

    // Practitioner indicators
    const practitionerIndicators = [
      'my name is',
      'my ptin',
      'my caf',
      'ein number',
      'corporation',
      'llc',
      '1120',
      '1065',
      'tax return transcript',
      'account transcript',
      '8821',
      'faxing',
      'sending that document',
    ];

    for (const indicator of irsIndicators) {
      if (lowerText.includes(indicator)) return 'irs_agent';
    }
    for (const indicator of practitionerIndicators) {
      if (lowerText.includes(indicator)) return 'practitioner';
    }

    // Fall back to speaker ID mapping
    // This gets more accurate as the call progresses
    if (speakerId === 0) return 'practitioner';
    if (speakerId === 1) return 'irs_agent';
    return 'unknown';
  }

  /**
   * Flush the segment buffer — called on utterance end.
   */
  _flushBuffer() {
    if (this.segmentBuffer.length > 0) {
      this.emit('utterance_complete', [...this.segmentBuffer]);
      this.segmentBuffer = [];
    }
  }

  /**
   * Persist a transcript segment to the database.
   */
  async _persistSegment(segment) {
    if (!this.supabase) return;

    try {
      await this.supabase.from('pps_transcript_segments').insert({
        call_id: this.callId,
        speaker: segment.speaker,
        text: segment.text,
        confidence: segment.confidence,
        timestamp_ms: segment.timestampMs,
      });
    } catch (err) {
      console.error('[Transcription] Failed to persist segment:', err.message);
    }
  }

  /**
   * Get full transcript assembled from all segments so far.
   */
  async getFullTranscript() {
    if (!this.supabase) return '';

    const { data: segments } = await this.supabase
      .from('pps_transcript_segments')
      .select('speaker, text, timestamp_ms')
      .eq('call_id', this.callId)
      .order('timestamp_ms', { ascending: true });

    if (!segments?.length) return '';

    return segments
      .map(s => `[${s.speaker}] ${s.text}`)
      .join('\n');
  }

  /**
   * Close the Deepgram connection.
   */
  close() {
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
    }
  }
}
