import { supabaseAdmin } from '../../../../../lib/supabase-admin.js';

/**
 * GET /api/v1/pps/call-script/:callId
 *
 * Returns the formatted call script for an expert.
 * Shows all assigned requests for this call in order, with:
 * - Business name and EIN
 * - Form types to request
 * - Transcript types needed
 * - Tax years/quarters
 * - Whether entity transcript is needed
 * - Column A info for 8821
 * - Any special notes
 *
 * This is what the expert sees on screen during the IRS call.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.PPS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { callId } = req.query;

    // Get call details
    const { data: call, error: callErr } = await supabaseAdmin
      .from('pps_calls')
      .select('id, status, practitioner_name, from_number, created_at, expert_id, batch_id')
      .eq('id', callId)
      .single();

    if (callErr || !call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Get assigned requests
    const { data: requests } = await supabaseAdmin
      .from('pps_transcript_requests')
      .select('id, business_name, ein, entity_type, form_types, transcript_types, tax_years, quarters, form_column_a, include_entity_transcript, notes, lender_notes, priority, status, request_order, auth_form_url')
      .eq('assigned_call_id', callId)
      .order('request_order', { ascending: true });

    // Get expert info
    let expert = null;
    if (call.expert_id) {
      const { data: expertData } = await supabaseAdmin
        .from('pps_experts')
        .select('id, name, ptin, caf_number')
        .eq('id', call.expert_id)
        .single();
      expert = expertData;
    }

    // Format the script
    const script = (requests || []).map((req, index) => {
      const formTypeDisplay = {
        '1120': 'C-Corporation (1120)',
        '1120S': 'S-Corporation (1120S)',
        '1065': 'Partnership (1065)',
        '1040': 'Individual (1040)',
        '941': 'Quarterly Payroll (941)',
        '940': 'Annual Payroll (940)',
        'Schedule C': 'Sole Proprietor (Schedule C)',
      };

      const transcriptTypeDisplay = {
        'record_of_account': 'Record of Account',
        'tax_return': 'Tax Return Transcript',
        'account': 'Account Transcript',
        'entity': 'Entity Transcript',
        'wage_income': 'Wage & Income',
      };

      return {
        order: index + 1,
        requestId: req.id,
        status: req.status,
        priority: req.priority,

        // What to tell the IRS agent
        businessName: req.business_name,
        ein: req.ein,
        entityType: req.entity_type,
        entityTypeDisplay: formTypeDisplay[req.form_types?.[0]] || req.entity_type,

        formTypes: req.form_types,
        formTypesDisplay: (req.form_types || []).map(f => formTypeDisplay[f] || f),

        transcriptTypes: req.transcript_types,
        transcriptTypesDisplay: (req.transcript_types || []).map(t => transcriptTypeDisplay[t] || t),

        taxYears: req.tax_years,
        quarters: req.quarters,
        includeEntityTranscript: req.include_entity_transcript,

        // 8821 info
        formColumnA: req.form_column_a || 'Income',
        authFormUrl: req.auth_form_url,

        // Notes
        notes: req.notes,
        lenderNotes: req.lender_notes,

        // Formatted prompt for the expert
        prompt: formatPrompt(req, index + 1),
      };
    });

    return res.status(200).json({
      callId: call.id,
      callStatus: call.status,
      fromNumber: call.from_number,
      expert: expert ? {
        name: expert.name,
        ptin: expert.ptin,
        caf: expert.caf_number,
      } : null,
      totalRequests: script.length,
      script,
    });
  } catch (err) {
    console.error('Call script fetch failed:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Format a human-readable prompt for the expert.
 */
function formatPrompt(req, order) {
  const lines = [];
  lines.push(`--- REQUEST #${order} ---`);
  lines.push(`Business: ${req.business_name}`);
  lines.push(`EIN: ${req.ein}`);

  if (req.entity_type) {
    lines.push(`Entity Type: ${req.entity_type}`);
  }

  lines.push(`Forms: ${(req.form_types || []).join(', ')}`);
  lines.push(`Transcripts: ${(req.transcript_types || []).join(', ')}`);
  lines.push(`Years: ${(req.tax_years || []).join(', ')}`);

  if (req.quarters?.length) {
    lines.push(`Quarters: ${req.quarters.join(', ')}`);
  }

  if (req.include_entity_transcript) {
    lines.push(`** Include Entity Transcript **`);
  }

  lines.push(`8821 Column A: ${req.form_column_a || 'Income'}`);

  if (req.notes) {
    lines.push(`Notes: ${req.notes}`);
  }

  if (req.priority === 'urgent') {
    lines.push(`!! URGENT REQUEST !!`);
  }

  return lines.join('\n');
}
