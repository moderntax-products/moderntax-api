import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL || '';

// Inline CSV parsing
function parseCSVText(csvText: string): any[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const rows: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: any = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

async function notifySlack(message: string, isError: boolean = false) {
  if (!SLACK_WEBHOOK) return;
  try {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        color: isError ? 'danger' : 'good'
      })
    });
  } catch (e) {
    console.error('Slack notification failed:', e);
  }
}

async function logError(error: any, context: any) {
  try {
    await supabase.from('error_log').insert({
      error_type: error.name || 'Unknown',
      message: error.message || String(error),
      context: context,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('Error logging failed:', e);
  }
}

function mapCenterstoneToDatabase(row: any) {
  if (!row.legal_name || !row.tid) {
    return null;
  }

  let years: number[] = [];
  const yearsStr = row.years || '';
  if (yearsStr.startsWith('{')) {
    years = yearsStr.replace(/[{}]/g, '').split(',').map((y: string) => parseInt(y.trim())).filter(y => !isNaN(y));
  } else if (yearsStr) {
    const parsed = parseInt(yearsStr);
    if (!isNaN(parsed)) years = [parsed];
  }

  let forms: string[] = [];
  const formsStr = row.form || '';
  if (formsStr.includes(',')) {
    forms = formsStr.split(',').map((f: string) => f.trim()).filter(f => f);
  } else if (formsStr) {
    forms = [formsStr.trim()];
  }

  const businessAddress = {
    street: row.address || '',
    city: row.city || '',
    state: row.state || '',
    zip: row.zip_code || ''
  };

  const metadata = {
    signer_first_name: row['first name'] || null,
    signer_last_name: row['last name'] || null,
    source: 'centerstone_email',
    credit_application_id: row.credit_application_id || null
  };

  return {
    request_id: `email_${uuidv4()}`,
    business_name: row.legal_name?.trim() || null,
    ein: row.tid?.trim() || null,
    taxpayer_ein: row.tid?.trim() || null,
    city: row.city?.trim() || null,
    state: row.state?.trim() || null,
    zip_code: row.zip_code?.trim() || null,
    business_address: businessAddress,
    tax_years: years.length > 0 ? years : null,
    tax_forms: forms.length > 0 ? forms : null,
    status: 'pending_verification',
    metadata: metadata,
    created_at: new Date().toISOString()
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ 
        message: 'MOD-44 Email Webhook is running',
        endpoint: 'POST /api/centerstone/process-email',
      });
    }
    
    if (req.method === 'POST') {
      const { from, subject, attachment_data, message_id } = req.body;
      
      const trustedSenders = [
        'christopher.ahn@teamcenterstone.com',
        'soobin.song@teamcenterstone.com',
        'justin.kim@teamcenterstone.com',
        'katie.kim@teamcenterstone.com',
        'andrew.yu@teamcenterstone.com',
        'robin.kim@teamcenterstone.com',
      ];
      
      if (!trustedSenders.includes(from)) {
        const error = 'Unauthorized sender: ' + from;
        await logError(new Error(error), { from, message_id });
        await notifySlack(`⚠️ Unauthorized sender attempted email: ${from}`, true);
        return res.status(403).json({ error });
      }

      if (!attachment_data) {
        const error = 'No attachment data provided';
        await logError(new Error(error), { from, message_id });
        await notifySlack(`❌ Email from ${from} had no attachment`, true);
        return res.status(400).json({ error });
      }

      try {
        let csvText = '';

        // Handle if attachment_data is a URL (from Zapier)
        if (attachment_data.startsWith('http')) {
          const response = await fetch(attachment_data);
          csvText = await response.text();
        }
        // Handle if it's base64
        else if (attachment_data.includes(',')) {
          const base64String = attachment_data.split(',')[1];
          csvText = Buffer.from(base64String, 'base64').toString('utf-8');
        }
        // Handle if it's already base64
        else {
          csvText = Buffer.from(attachment_data, 'base64').toString('utf-8');
        }
        
        const rows = parseCSVText(csvText);
        
        if (!rows || rows.length === 0) {
          const error = 'No rows found in CSV';
          await logError(new Error(error), { from, message_id });
          await notifySlack(`❌ CSV parse failed: No rows. From: ${from}`, true);
          return res.status(400).json({ error, upload_id: message_id });
        }

        const dbRecords = rows
          .map(row => mapCenterstoneToDatabase(row))
          .filter(record => record !== null);

        if (dbRecords.length === 0) {
          const error = `No valid records found. ${rows.length} rows total, all incomplete`;
          await logError(new Error(error), { from, message_id, total_rows: rows.length, first_row: rows[0] });
          await notifySlack(`⚠️ CSV from ${from}: ${rows.length} rows but none valid`, true);
          return res.status(400).json({ 
            error,
            upload_id: message_id,
            total_rows: rows.length,
            first_row_keys: rows[0] ? Object.keys(rows[0]) : []
          });
        }

        const { error: insertError } = await supabase
          .from('verification_requests')
          .insert(dbRecords);

        if (insertError) {
          await logError(insertError, { from, message_id, rows_attempted: dbRecords.length });
          await notifySlack(`❌ Database insert failed from ${from}: ${insertError.message}`, true);
          return res.status(400).json({
            error: 'Database insert failed',
            message: insertError.message,
            upload_id: message_id
          });
        }

        const successMessage = `✅ CSV imported from ${from.split('@')[0]}: ${dbRecords.length} records (${rows.length - dbRecords.length} filtered)`;
        await notifySlack(successMessage);
        
        console.log(successMessage);

        return res.status(200).json({ 
          message: 'CSV imported successfully',
          upload_id: message_id,
          rows_parsed: rows.length,
          rows_inserted: dbRecords.length,
          rows_filtered: rows.length - dbRecords.length,
          status: 'pending_verification'
        });

      } catch (parseError: any) {
        await logError(parseError, { from, message_id, phase: 'csv_parsing' });
        await notifySlack(`❌ CSV parsing error from ${from}: ${parseError.message}`, true);
        return res.status(400).json({
          error: 'CSV parsing failed',
          details: parseError.message,
          upload_id: message_id
        });
      }
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    await logError(error, { phase: 'handler' });
    await notifySlack(`❌ Critical error in webhook: ${error.message}`, true);
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal error', details: error.message });
  }
}
