import { supabaseAdmin } from '../../../../lib/supabase-admin.js';

/**
 * POST /api/v1/pps/batches
 * Creates a batch of requests and optionally assigns to an expert.
 *
 * Body:
 * {
 *   "requestIds": ["uuid", ...],     // Specific request IDs to batch
 *   "expertId": "uuid",              // Optional — assign batch to this expert
 *   "maxPerBatch": 5,                // Optional — max requests per batch (default 5)
 *   "lenderClientId": "uuid",        // Optional — batch all pending from this lender
 *   "loanId": "string"              // Optional — batch all pending for this loan
 * }
 *
 * GET /api/v1/pps/batches?status=pending&expertId=xxx
 * Lists batches with their requests.
 */
export default async function handler(req, res) {
  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.PPS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    return handleCreateBatch(req, res);
  } else if (req.method === 'GET') {
    return handleListBatches(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleCreateBatch(req, res) {
  try {
    const { requestIds, expertId, maxPerBatch = 5, lenderClientId, loanId } = req.body || {};

    let idsToAssign = [];

    if (requestIds?.length) {
      idsToAssign = requestIds;
    } else {
      // Find pending requests matching filters
      let query = supabaseAdmin
        .from('pps_transcript_requests')
        .select('id')
        .eq('status', 'pending')
        .order('priority', { ascending: true }) // urgent first
        .order('created_at', { ascending: true })
        .limit(maxPerBatch);

      if (lenderClientId) query = query.eq('lender_client_id', lenderClientId);
      if (loanId) query = query.eq('loan_id', loanId);

      const { data: pending, error: fetchErr } = await query;

      if (fetchErr) {
        return res.status(500).json({ error: fetchErr.message });
      }

      if (!pending?.length) {
        return res.status(200).json({ message: 'No pending requests to batch', batchId: null, requests: [] });
      }

      idsToAssign = pending.map(r => r.id);
    }

    // Generate batch ID
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Assign batch ID and order to requests
    for (let i = 0; i < idsToAssign.length; i++) {
      const update = {
        batch_id: batchId,
        request_order: i,
      };

      if (expertId) {
        update.assigned_expert_id = expertId;
        update.status = 'assigned';
        update.assigned_at = new Date().toISOString();
      }

      await supabaseAdmin
        .from('pps_transcript_requests')
        .update(update)
        .eq('id', idsToAssign[i]);
    }

    // Fetch full request details
    const { data: batchRequests } = await supabaseAdmin
      .from('pps_transcript_requests')
      .select('id, business_name, ein, entity_type, form_types, transcript_types, tax_years, quarters, form_column_a, include_entity_transcript, notes, priority, request_order')
      .eq('batch_id', batchId)
      .order('request_order', { ascending: true });

    return res.status(200).json({
      batchId,
      expertId: expertId || null,
      requestCount: batchRequests?.length || 0,
      requests: batchRequests || [],
    });
  } catch (err) {
    console.error('Batch creation failed:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handleListBatches(req, res) {
  try {
    const { status, expertId, limit = 20, offset = 0 } = req.query;

    let query = supabaseAdmin
      .from('pps_transcript_requests')
      .select('batch_id, status, assigned_expert_id, business_name, ein, form_types, transcript_types, tax_years')
      .not('batch_id', 'is', null)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (expertId) query = query.eq('assigned_expert_id', expertId);

    const { data: requests, error: fetchErr } = await query;

    if (fetchErr) {
      return res.status(500).json({ error: fetchErr.message });
    }

    // Group by batch_id
    const batches = {};
    for (const req of (requests || [])) {
      if (!batches[req.batch_id]) {
        batches[req.batch_id] = {
          batchId: req.batch_id,
          expertId: req.assigned_expert_id,
          requests: [],
          statuses: [],
        };
      }
      batches[req.batch_id].requests.push(req);
      batches[req.batch_id].statuses.push(req.status);
    }

    // Compute batch-level status
    const batchList = Object.values(batches).map(b => {
      const statuses = b.statuses;
      let batchStatus = 'pending';
      if (statuses.every(s => s === 'delivered')) batchStatus = 'delivered';
      else if (statuses.every(s => s === 'screened' || s === 'delivered')) batchStatus = 'screened';
      else if (statuses.some(s => s === 'in_progress')) batchStatus = 'in_progress';
      else if (statuses.every(s => s === 'assigned')) batchStatus = 'assigned';

      return {
        batchId: b.batchId,
        expertId: b.expertId,
        status: batchStatus,
        requestCount: b.requests.length,
        requests: b.requests,
      };
    });

    return res.status(200).json({
      total: batchList.length,
      batches: batchList.slice(Number(offset), Number(offset) + Number(limit)),
    });
  } catch (err) {
    console.error('List batches failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
