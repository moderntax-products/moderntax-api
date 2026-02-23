import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * The PPS Call AI Agent.
 *
 * Monitors the live transcript of an IRS PPS call and:
 * 1. Extracts structured data (EINs, business names, transcript types, etc.)
 * 2. Detects call phases (identity verification, hold, request, confirmation)
 * 3. Provides real-time suggestions to the human practitioner
 * 4. Generates post-call summaries
 */

const SYSTEM_PROMPT = `You are an AI assistant monitoring a live IRS Practitioner Priority Service (PPS) phone call. Your role is to help the tax practitioner by:

1. **Extracting structured data** from the conversation in real-time
2. **Detecting the current call phase** and tracking progress
3. **Providing helpful suggestions** to the practitioner
4. **Flagging potential issues** (wrong form types, missing info, etc.)

## IRS PPS Call Flow
A typical PPS call follows this pattern:
1. IRS agent answers and asks for practitioner identity
2. Practitioner provides name, PTIN, and optionally CAF number
3. Practitioner provides the client's EIN and business name
4. Practitioner states what transcripts are needed (form type + transcript type + years)
5. IRS agent asks for authorization (Form 8821 or 2848)
6. Practitioner faxes the authorization form
7. IRS agent puts call on hold to verify authorization and process request
8. IRS agent confirms transcripts are being sent (via SOR inbox or fax)
9. Repeat steps 3-8 for additional clients on the same call

## Key Entity Types
- **EIN**: 9-digit Employer Identification Number (XX-XXXXXXX format)
- **PTIN**: Preparer Tax ID (P followed by 8 digits)
- **CAF**: Centralized Authorization File number
- **Form Types**: 1120 (C-Corp), 1120S (S-Corp), 1065 (Partnership), 941 (Quarterly Employment), 940 (Annual Employment), W-2, 1099
- **Transcript Types**: Tax Return Transcript, Account Transcript, Record of Account, Wage & Income
- **Entity Types**: C-Corp, S-Corp, LLC, Partnership, Sole Proprietor

## Call Phases
- greeting: Initial greeting and identity verification
- identity_verification: Practitioner providing PTIN/CAF/identity
- client_info: Providing EIN and business name for a client
- transcript_request: Specifying which transcripts are needed
- authorization: Discussing/faxing 8821 or 2848
- on_hold: Waiting for IRS agent to process
- confirmation: IRS agent confirming transcripts sent
- next_client: Transitioning to next client on the call
- closing: Wrapping up the call

When you respond, output valid JSON with this structure:
{
  "phase": "current_call_phase",
  "extracted_data": {
    "current_ein": "if mentioned",
    "current_business_name": "if mentioned",
    "current_form_types": ["if mentioned"],
    "current_transcript_types": ["if mentioned"],
    "current_tax_years": ["if mentioned"],
    "current_entity_type": "if mentioned",
    "irs_agent_name": "if mentioned",
    "fax_confirmed": true/false,
    "transcripts_confirmed_sent": true/false
  },
  "suggestions": ["array of suggestions for the practitioner"],
  "issues": ["array of potential problems detected"],
  "summary": "brief summary of what just happened"
}`;

/**
 * Analyze a batch of transcript segments and extract structured data.
 *
 * @param {Array} segments - Recent transcript segments
 * @param {Object} callContext - Current call context (previous extractions, client list, etc.)
 * @returns {Object} AI analysis result
 */
export async function analyzeTranscript(segments, callContext = {}) {
  const segmentText = segments
    .map(s => `[${s.speaker}] ${s.text}`)
    .join('\n');

  const contextStr = callContext.previousRequests?.length
    ? `\n\nPrevious requests on this call:\n${JSON.stringify(callContext.previousRequests, null, 2)}`
    : '';

  const phaseStr = callContext.currentPhase
    ? `\nCurrent phase: ${callContext.currentPhase}`
    : '';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analyze these latest transcript segments from the IRS PPS call:

${segmentText}
${phaseStr}${contextStr}

Extract any structured data and provide your analysis as JSON.`,
      }],
    });

    const text = response.content[0]?.text || '{}';

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { phase: 'unknown', extracted_data: {}, suggestions: [], issues: [], summary: text };
  } catch (err) {
    console.error('[AI Agent] Analysis failed:', err.message);
    return { phase: 'unknown', extracted_data: {}, suggestions: [], issues: ['AI analysis temporarily unavailable'], summary: '' };
  }
}

/**
 * Generate a complete post-call summary.
 */
export async function generateCallSummary(fullTranscript, requests) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `You are summarizing an IRS PPS call. Provide a structured summary including:
1. Call overview (duration, IRS agent info)
2. Each transcript request made (business name, EIN, form types, years, outcome)
3. Any issues or follow-ups needed
4. Key timestamps (when connected, when each request was processed)

Output as JSON with this structure:
{
  "overview": "string",
  "requests": [
    {
      "business_name": "string",
      "ein": "string",
      "form_types": ["string"],
      "transcript_types": ["string"],
      "tax_years": ["string"],
      "outcome": "approved|rejected|pending",
      "notes": "string"
    }
  ],
  "issues": ["string"],
  "follow_ups": ["string"]
}`,
      messages: [{
        role: 'user',
        content: `Full call transcript:\n\n${fullTranscript}\n\nRequests data:\n${JSON.stringify(requests, null, 2)}`,
      }],
    });

    const text = response.content[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { overview: text, requests: [], issues: [], follow_ups: [] };
  } catch (err) {
    console.error('[AI Agent] Summary generation failed:', err.message);
    return { overview: 'Summary generation failed', requests: [], issues: [], follow_ups: [] };
  }
}

/**
 * Extract structured request data from a conversation segment
 * where a new client/EIN is being discussed.
 */
export async function extractRequestData(transcriptSegment) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: `Extract IRS transcript request data from this conversation segment. Return JSON:
{
  "business_name": "string or null",
  "ein": "string or null (format: XXXXXXXXX, digits only)",
  "entity_type": "s_corp|c_corp|llc|partnership|sole_prop or null",
  "form_types": ["1120S", "1065", etc.] or [],
  "transcript_types": ["tax_return", "account", "wage_income", "record_of_account"] or [],
  "tax_years": ["2021", "2022", etc.] or [],
  "quarters": ["Q1", "Q2", etc.] or null,
  "auth_form_type": "8821 or 2848 or null",
  "delivery_method": "sor_inbox|fax|mail or null"
}`,
      messages: [{
        role: 'user',
        content: transcriptSegment,
      }],
    });

    const text = response.content[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {};
  } catch (err) {
    console.error('[AI Agent] Extraction failed:', err.message);
    return {};
  }
}
