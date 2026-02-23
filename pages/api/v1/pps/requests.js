import { supabaseAdmin } from '../../../../lib/supabase-admin.js';

/**
 * POST /api/v1/pps/requests
 * Create new transcript request(s) from a lender.
 *
 * Body:
 * {
 *   "lenderClientId": "uuid",
 *   "loanId": "LOAN-12345",
 *   "requests": [
 *     {
 *       "businessName": "ABC Corp",
 *       "ein": "12-3456789",
 *       "entityType": "s_corp",
 *       "formTypes": ["1120S"],
 *       "transcriptTypes": ["record_of_account", "tax_return"],
 *       "taxYears": ["2022", "2023", "2024"],
 *       "includeEntityTranscript": true,
 *       "formColumnA": "Income",
 *       "priority": "normal",
 *       "notes": "Optional notes"
 *     }
 *   ]
 * }
 *
 * GET /api/v1/pps/requests?status=pending&lenderClientId=xxx&ein=xxx
 * Lists transcript requests with filtering.
 */
export default async function handler(req, res) {
  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.PPS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    return handleCreateRequests(req, res);
  } else if (req.method === 'GET') {
    return handleListRequests(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleCreateRequests(req, res) {
  try {
    const { lenderClientId, loanId, requests } = req.body || {};

    if (!requests?.length) {
      return res.status(400).json({ error: 'No requests provided' });
    }

    const inserts = requests.map((r, i) => ({
      lender_client_id: lenderClientId || null,
      loan_id: loanId || null,
      business_name: r.businessName,
      ein: r.ein,
      entity_type: r.entityType,
      individual_name: r.individualName,
      ssn_last4: r.ssnLast4,
      request_type: r.requestType || 'business',
      form_types: r.formTypes,
      transcript_types: r.transcriptTypes,
      tax_years: r.taxYears,
      quarters: r.quarters || null,
      include_entity_transcript: r.includeEntityTranscript !== false,
      form_column_a: r.formColumnA || 'Income',
      auth_form_url: r.authFormUrl,
      priority: r.priority || 'normal',
      due_date: r.dueDate || null,
      notes: r.notes,
      lender_notes: r.lenderNotes,
      status: 'pending',
      request_order: i,
    }));

    const { data: created, error: dbErr } = await supabaseAdmin
      .from('pps_transcript_requests')
      .insert(inserts)
      .select('id, business_name, ein, entity_type, form_types, transcript_types, tax_years, status, priority');

    if (dbErr) {
      return res.status(500).json({ error: dbErr.message });
    }

    // Update lender client request count
    if (lenderClientId) {
      const { data: client } = await supabaseAdmin
        .from('pps_lender_clients')
        .select('total_requests')
        .eq('id', lenderClientId)
        .single();

      if (client) {
        await supabaseAdmin
          .from('pps_lender_clients')
          .update({ total_requests: (client.total_requests || 0) + created.length })
          .eq('id', lenderClientId);
      }
    }

    return res.status(201).json({
      created: created.length,
      requests: created,
    });
  } catch (err) {
    console.error('Create requests failed:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handleListRequests(req, res) {
  try {
    const { status, lenderClientId, ein, batchId, callId, expertId, limit = 50, offset = 0 } = req.query;

    let query = supabaseAdmin
      .from('pps_transcript_requests')
      .select('*, pps_lender_clients(name, contact_email), pps_experts(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (lenderClientId) query = query.eq('lender_client_id', lenderClientId);
    if (ein) query = query.eq('ein', ein);
    if (batchId) query = query.eq('batch_id', batchId);
    if (callId) query = query.eq('assigned_call_id', callId);
    if (expertId) query = query.eq('assigned_expert_id', expertId);

    const { data, count, error: fetchErr } = await query;

    if (fetchErr) {
      return res.status(500).json({ error: fetchErr.message });
    }

    return res.status(200).json({
      total: count,
      offset: Number(offset),
      limit: Number(limit),
      requests: data || [],
    });
  } catch (err) {
    console.error('List requests failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
