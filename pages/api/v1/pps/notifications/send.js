import { supabaseAdmin } from '../../../../../lib/supabase-admin.js';

/**
 * POST /api/v1/pps/notifications/send
 *
 * Sends pending notifications or triggers a manual notification.
 *
 * Body (manual):
 * {
 *   "requestId": "uuid",          // Notify lender that this request is ready
 *   "type": "transcript_ready"    // transcript_ready, compliance_alert, batch_complete
 * }
 *
 * Body (process queue):
 * {
 *   "processQueue": true           // Process all pending notifications
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
    const { requestId, type, processQueue } = req.body || {};

    if (processQueue) {
      const results = await processNotificationQueue();
      return res.status(200).json(results);
    }

    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }

    // Get the request and its lender client
    const { data: request } = await supabaseAdmin
      .from('pps_transcript_requests')
      .select('*, pps_lender_clients(*)')
      .eq('id', requestId)
      .single();

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const client = request.pps_lender_clients;
    if (!client) {
      return res.status(400).json({ error: 'No lender client linked to this request' });
    }

    // Get transcripts for this request
    const { data: transcripts } = await supabaseAdmin
      .from('pps_transcripts')
      .select('id, filename, business_name, form_type, tax_year, severity, compliance_flags')
      .eq('request_id', requestId);

    // Build notification content
    const notifType = type || 'transcript_ready';
    const { subject, body, payload } = buildNotificationContent(notifType, request, transcripts || []);

    // Create notification record
    const { data: notification, error: dbErr } = await supabaseAdmin
      .from('pps_notifications')
      .insert({
        request_id: requestId,
        lender_client_id: client.id,
        type: notifType,
        channel: client.notification_method || 'email',
        recipient: client.notification_email || client.contact_email,
        subject,
        body,
        payload,
        status: 'pending',
      })
      .select('id')
      .single();

    if (dbErr) {
      return res.status(500).json({ error: dbErr.message });
    }

    // Send immediately
    const sendResult = await sendNotification(notification.id);

    return res.status(200).json({
      notificationId: notification.id,
      ...sendResult,
    });
  } catch (err) {
    console.error('Notification send failed:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Process all pending notifications in the queue.
 */
async function processNotificationQueue() {
  const { data: pending } = await supabaseAdmin
    .from('pps_notifications')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);

  if (!pending?.length) {
    return { processed: 0, message: 'No pending notifications' };
  }

  const results = [];
  for (const notif of pending) {
    const result = await sendNotification(notif.id);
    results.push({ id: notif.id, ...result });
  }

  return {
    processed: results.length,
    sent: results.filter(r => r.status === 'sent').length,
    failed: results.filter(r => r.status === 'failed').length,
    results,
  };
}

/**
 * Send a single notification by ID.
 */
async function sendNotification(notificationId) {
  const { data: notif } = await supabaseAdmin
    .from('pps_notifications')
    .select('*')
    .eq('id', notificationId)
    .single();

  if (!notif) return { status: 'failed', error: 'Notification not found' };

  try {
    if (notif.channel === 'webhook' && notif.recipient?.startsWith('http')) {
      // Send webhook
      const response = await fetch(notif.recipient, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: notif.type,
          subject: notif.subject,
          payload: notif.payload,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }

      await supabaseAdmin
        .from('pps_notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', notificationId);

      return { status: 'sent', channel: 'webhook' };
    }

    if (notif.channel === 'email' || notif.channel === 'both') {
      // For now, log the email. In production, integrate SendGrid/Resend/etc.
      console.log(`[Notification] EMAIL to ${notif.recipient}:`);
      console.log(`  Subject: ${notif.subject}`);
      console.log(`  Body: ${notif.body?.substring(0, 200)}...`);

      // Mark as sent (replace with actual email API call)
      await supabaseAdmin
        .from('pps_notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', notificationId);

      return { status: 'sent', channel: 'email', note: 'Email logged - integrate email provider for production' };
    }

    return { status: 'failed', error: `Unknown channel: ${notif.channel}` };
  } catch (err) {
    await supabaseAdmin
      .from('pps_notifications')
      .update({ status: 'failed', error: err.message })
      .eq('id', notificationId);

    return { status: 'failed', error: err.message };
  }
}

/**
 * Build notification content based on type.
 */
function buildNotificationContent(type, request, transcripts) {
  const businessName = request.business_name;
  const ein = request.ein;

  switch (type) {
    case 'transcript_ready': {
      const transcriptList = transcripts.map(t =>
        `  - ${t.form_type} ${t.tax_year} (${t.severity})`
      ).join('\n');

      return {
        subject: `Transcripts Ready: ${businessName} (EIN: ${ein})`,
        body: `IRS transcripts are now available for ${businessName} (EIN: ${ein}).\n\n` +
          `Transcripts received:\n${transcriptList}\n\n` +
          `Log in to the ModernTax portal to view the full compliance report.`,
        payload: {
          requestId: request.id,
          businessName,
          ein,
          transcriptCount: transcripts.length,
          transcripts: transcripts.map(t => ({
            id: t.id,
            formType: t.form_type,
            taxYear: t.tax_year,
            severity: t.severity,
            flagCount: t.compliance_flags?.length || 0,
          })),
        },
      };
    }

    case 'compliance_alert': {
      const criticalFlags = transcripts
        .flatMap(t => (t.compliance_flags || []).filter(f => f.severity === 'CRITICAL'))
        .map(f => `  - ${f.message}`)
        .join('\n');

      return {
        subject: `COMPLIANCE ALERT: ${businessName} (EIN: ${ein})`,
        body: `Critical compliance issues found for ${businessName} (EIN: ${ein}):\n\n` +
          `${criticalFlags}\n\n` +
          `Immediate review recommended. Log in to the ModernTax portal for details.`,
        payload: {
          requestId: request.id,
          businessName,
          ein,
          severity: 'CRITICAL',
          criticalCount: transcripts.flatMap(t => (t.compliance_flags || []).filter(f => f.severity === 'CRITICAL')).length,
        },
      };
    }

    case 'batch_complete':
    default: {
      return {
        subject: `Transcript Request Complete: ${businessName}`,
        body: `Your transcript request for ${businessName} (EIN: ${ein}) has been completed.\n\n` +
          `${transcripts.length} transcripts processed.`,
        payload: {
          requestId: request.id,
          businessName,
          ein,
          transcriptCount: transcripts.length,
        },
      };
    }
  }
}
