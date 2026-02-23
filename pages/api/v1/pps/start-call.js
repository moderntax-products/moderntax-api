import { supabaseAdmin } from '../../../../lib/supabase-admin.js';
import { startPPSCall } from '../../../../lib/pps/twilio-client.js';

/**
 * POST /api/v1/pps/start-call
 *
 * Initiates an outbound PPS call.
 * - Dials IRS PPS from a rotating number
 * - Simultaneously dials the assigned expert (e.g., Tanya)
 * - Both join a recorded conference
 * - Audio streams to WS server for transcription
 *
 * Body:
 * {
 *   "expertId": "uuid",           // Required — which expert to call
 *   "batchId": "uuid or string",  // Optional — batch of requests to work
 *   "requestIds": ["uuid", ...],  // Optional — specific request IDs to assign
 *   "fromNumber": "+1234567890",  // Optional — will rotate if not specified
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.PPS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { expertId, batchId, requestIds, fromNumber } = req.body || {};

    if (!expertId) {
      return res.status(400).json({ error: 'expertId is required' });
    }

    // Get expert details
    const { data: expert, error: expertErr } = await supabaseAdmin
      .from('pps_experts')
      .select('*')
      .eq('id', expertId)
      .single();

    if (expertErr || !expert) {
      return res.status(404).json({ error: 'Expert not found' });
    }

    if (!expert.is_active) {
      return res.status(400).json({ error: 'Expert is not active' });
    }

    // Create call record
    const { data: callRecord, error: dbError } = await supabaseAdmin
      .from('pps_calls')
      .insert({
        status: 'queued',
        direction: 'outbound',
        from_number: fromNumber || 'pending',
        practitioner_name: expert.name,
        practitioner_ptin: expert.ptin || 'P01809554',
        practitioner_caf: expert.caf_number,
        expert_id: expertId,
        batch_id: batchId || null,
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('Failed to create call record:', dbError);
      return res.status(500).json({ error: 'Failed to create call record' });
    }

    const callId = callRecord.id;

    // Assign requests to this call
    if (requestIds?.length) {
      await supabaseAdmin
        .from('pps_transcript_requests')
        .update({
          assigned_call_id: callId,
          assigned_expert_id: expertId,
          assigned_at: new Date().toISOString(),
          status: 'assigned',
          batch_id: batchId || callId,
        })
        .in('id', requestIds);
    } else if (batchId) {
      // Assign all pending requests in this batch
      await supabaseAdmin
        .from('pps_transcript_requests')
        .update({
          assigned_call_id: callId,
          assigned_expert_id: expertId,
          assigned_at: new Date().toISOString(),
          status: 'assigned',
        })
        .eq('batch_id', batchId)
        .eq('status', 'pending');
    }

    // Start the two-leg Twilio call (IRS + Expert)
    const result = await startPPSCall({
      callId,
      expertPhone: expert.phone,
      fromNumber,
      supabase: supabaseAdmin,
    });

    // Update call record with Twilio SIDs
    await supabaseAdmin
      .from('pps_calls')
      .update({
        call_sid: result.irsCallSid,
        from_number: result.fromNumber,
        status: 'dialing',
      })
      .eq('id', callId);

    // Update expert's current call
    await supabaseAdmin
      .from('pps_experts')
      .update({
        current_call_id: callId,
        calls_today: (expert.calls_today || 0) + 1,
      })
      .eq('id', expertId);

    // Fetch the assigned requests to return as call script
    const { data: assignedRequests } = await supabaseAdmin
      .from('pps_transcript_requests')
      .select('id, business_name, ein, entity_type, form_types, transcript_types, tax_years, quarters, form_column_a, include_entity_transcript, notes')
      .eq('assigned_call_id', callId)
      .order('request_order', { ascending: true });

    return res.status(200).json({
      callId,
      irsCallSid: result.irsCallSid,
      expertCallSid: result.expertCallSid,
      status: 'dialing',
      fromNumber: result.fromNumber,
      expert: { id: expert.id, name: expert.name, phone: expert.phone },
      callScript: assignedRequests || [],
    });
  } catch (err) {
    console.error('Failed to start PPS call:', err);
    return res.status(500).json({ error: err.message });
  }
}
