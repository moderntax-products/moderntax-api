import { supabaseAdmin } from '../../../../../lib/supabase-admin.js';
import { screenTranscript, parseTranscriptMetadata } from '../../../../../lib/pps/compliance-screener.js';

/**
 * POST /api/v1/pps/transcripts/upload
 *
 * Accepts transcript HTML from the SOR batch download script.
 * Runs compliance screening and stores results.
 *
 * Body:
 * {
 *   "transcripts": [
 *     {
 *       "html": "<html>...</html>",
 *       "filename": "ABC_Corp_1120S_2023_RecordOfAccount.pdf",
 *       "requestId": "uuid"   // Optional — links to a pps_transcript_request
 *     }
 *   ],
 *   "callId": "uuid",         // Optional — the call these were requested on
 *   "batchId": "string"       // Optional — batch identifier
 * }
 */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Transcripts can be large
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.PPS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { transcripts, callId, batchId } = req.body || {};

    if (!transcripts?.length) {
      return res.status(400).json({ error: 'No transcripts provided' });
    }

    const results = [];
    const errors = [];

    for (const item of transcripts) {
      try {
        const { html, filename, requestId } = item;

        if (!html) {
          errors.push({ filename, error: 'Missing HTML content' });
          continue;
        }

        // Parse metadata from the HTML
        const metadata = parseTranscriptMetadata(html);

        // Run compliance screening
        const screening = screenTranscript(html, metadata);

        // Store transcript
        const { data: transcript, error: dbErr } = await supabaseAdmin
          .from('pps_transcripts')
          .insert({
            request_id: requestId || null,
            filename: filename || `${metadata.name}_${metadata.formType}_${metadata.taxYear}.html`,
            file_type: 'html',
            file_size_bytes: Buffer.byteLength(html, 'utf8'),

            // Parsed metadata
            business_name: metadata.name,
            tin: metadata.tin,
            form_type: metadata.formType,
            transcript_type: metadata.shortType,
            tax_year: metadata.taxYear,
            tax_period: metadata.taxYear,

            // Compliance
            severity: screening.severity,
            compliance_flags: screening.flags,

            // Financial data
            gross_receipts: screening.grossReceipts,
            total_income: screening.totalIncome,
            total_deductions: screening.totalDeductions,
            ordinary_income: screening.ordinaryIncome,
            total_assets: screening.totalAssets,
            total_tax: screening.totalTax,
            balance_due: screening.balanceDue,
            account_balance: screening.accountBalance,
            accrued_interest: screening.accruedInterest,
            accrued_penalty: screening.accruedPenalty,
            account_balance_plus_accruals: screening.accountBalancePlusAccruals,

            // Transaction codes
            transaction_codes: screening.transactionCodes,

            // Raw content
            raw_html: html,
            parsed_data: screening,

            is_no_record: metadata.isNoRecord,
          })
          .select('id, severity, compliance_flags, business_name, form_type, tax_year, transcript_type')
          .single();

        if (dbErr) {
          errors.push({ filename, error: dbErr.message });
          continue;
        }

        // Update the linked request status
        if (requestId) {
          await supabaseAdmin
            .from('pps_transcript_requests')
            .update({
              status: 'screened',
            })
            .eq('id', requestId);
        }

        results.push({
          id: transcript.id,
          filename: filename || transcript.business_name,
          businessName: transcript.business_name,
          formType: transcript.form_type,
          taxYear: transcript.tax_year,
          transcriptType: transcript.transcript_type,
          severity: transcript.severity,
          flagCount: transcript.compliance_flags?.length || 0,
          flags: transcript.compliance_flags,
        });
      } catch (err) {
        errors.push({ filename: item.filename, error: err.message });
      }
    }

    // If a batchId was provided, check if all requests in the batch are now screened
    if (batchId) {
      await checkBatchCompletion(batchId);
    }

    // If a callId was provided, update call record
    if (callId) {
      await supabaseAdmin
        .from('pps_calls')
        .update({
          transcripts_uploaded: results.length,
          transcripts_uploaded_at: new Date().toISOString(),
        })
        .eq('id', callId);
    }

    // Generate compliance summary
    const summary = {
      total: results.length,
      clean: results.filter(r => r.severity === 'CLEAN').length,
      info: results.filter(r => r.severity === 'INFO').length,
      warning: results.filter(r => r.severity === 'WARNING').length,
      critical: results.filter(r => r.severity === 'CRITICAL').length,
    };

    return res.status(200).json({
      success: true,
      summary,
      transcripts: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Transcript upload failed:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Check if all requests in a batch have been screened.
 * If so, trigger client notification.
 */
async function checkBatchCompletion(batchId) {
  const { data: requests } = await supabaseAdmin
    .from('pps_transcript_requests')
    .select('id, status, lender_client_id')
    .eq('batch_id', batchId);

  if (!requests?.length) return;

  const allScreened = requests.every(r => r.status === 'screened' || r.status === 'delivered');
  if (!allScreened) return;

  // Get the lender client for notification
  const lenderClientId = requests[0].lender_client_id;
  if (!lenderClientId) return;

  const { data: client } = await supabaseAdmin
    .from('pps_lender_clients')
    .select('*')
    .eq('id', lenderClientId)
    .single();

  if (!client) return;

  // Queue notification
  await supabaseAdmin.from('pps_notifications').insert({
    lender_client_id: lenderClientId,
    type: 'batch_complete',
    channel: client.notification_method || 'email',
    recipient: client.notification_email || client.contact_email,
    subject: `Transcripts Ready - Batch ${batchId}`,
    body: `All ${requests.length} transcript requests in batch ${batchId} have been processed and screened.`,
    payload: {
      batchId,
      requestCount: requests.length,
      requestIds: requests.map(r => r.id),
    },
    status: 'pending',
  });

  // Mark requests as delivered
  await supabaseAdmin
    .from('pps_transcript_requests')
    .update({ status: 'delivered' })
    .eq('batch_id', batchId)
    .eq('status', 'screened');
}
