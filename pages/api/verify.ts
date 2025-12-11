import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const headerKey = req.headers['x-api-key'] || req.headers['X-API-Key'];
  const apiKey = Array.isArray(headerKey) ? headerKey[0] : headerKey;
  const validKeys = ['mt_prod_conductiv_2025_3c651d11d29e', 'mt_sandbox_conductiv_2025_test'];

  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const body = req.body as any;
  const { form_8821_data, platform_metadata, borrower } = body || {};
  const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  const addressParts = parseAddress(form_8821_data?.taxpayer_address || borrower?.address || '');
  const normalizedPhone = normalizePhone(form_8821_data?.taxpayer_phone || borrower?.phone || '');
  const ssn = form_8821_data?.taxpayer_ssn || borrower?.ssn || '';

  try {
    await supabase.from('api_usage').insert({
      api_key: apiKey,
      endpoint: '/api/verify',
      request_id: requestId,
      ip_address: form_8821_data?.ip_address || (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown',
      request_data: req.body,
      response_status: 200
    });
  } catch (error: any) {
    console.error('Failed to log API usage:', error);
  }

  // Sandbox/test SSNs - immediate response
  if (ssn?.startsWith('000-00')) {
    const testResponse = getTestResponse(requestId, ssn, form_8821_data, platform_metadata);

    if (platform_metadata?.webhook_url) {
      const sendWithRetry = async (attempt = 1) => {
        try {
          await sendWebhook(platform_metadata.webhook_url, testResponse);
          console.log(`Webhook sent successfully on attempt ${attempt}`);
        } catch (error) {
          console.error(`Webhook attempt ${attempt} failed:`, error);
          if (attempt < 3) {
            setTimeout(() => sendWithRetry(attempt + 1), 1000 * attempt);
          }
        }
      };
      setTimeout(() => sendWithRetry(), 1000);
    }

    return res.json(testResponse);
  }

  // Production flow - enqueue for 24 hour processing
  const ssnHash = crypto.createHash('sha256').update(ssn).digest('hex');

  try {
    const { data, error } = await supabase.from('verification_requests').insert({
      request_id: requestId,
      ssn_hash: ssnHash,
      taxpayer_name: form_8821_data?.taxpayer_name || `${borrower?.first_name || ''} ${borrower?.last_name || ''}`.trim(),
      taxpayer_ssn_last4: (ssn || '').slice(-4),
      taxpayer_email: form_8821_data?.taxpayer_email || borrower?.email,
      current_address: addressParts.street || form_8821_data?.current_address || 'Address required',
      apt_suite: addressParts.apt_suite || form_8821_data?.apt_suite,
      city: addressParts.city || form_8821_data?.city || 'City required',
      state: addressParts.state || form_8821_data?.state || 'XX',
      zip_code: addressParts.zip_code || form_8821_data?.zip_code || '00000',
      telephone: normalizedPhone,
      tax_years: form_8821_data?.tax_years || ['2023'],
      tax_forms: form_8821_data?.tax_forms || ['W-2', '1040'],
      specific_use: form_8821_data?.specific_use || 'Income Verification',
      status: 'pending',
      webhook_url: platform_metadata?.webhook_url,
      metadata: {
        form_8821_data: {
          ...form_8821_data,
          taxpayer_ssn: ssn,
          taxpayer_ssn_masked: '***-**-' + (ssn || '').slice(-4),
          taxpayer_signature: form_8821_data?.taxpayer_signature || 'Electronic Consent',
          consent_timestamp: form_8821_data?.consent_timestamp || new Date().toISOString(),
          ip_address: form_8821_data?.ip_address || (req.headers['x-forwarded-for'] as string)?.split(',')[0]
        },
        platform_metadata,
        source: platform_metadata?.source || 'conductiv',
        created_at: new Date().toISOString(),
        expected_completion: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
    });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to create request', details: (error as any).message });
    }
  } catch (error) {
    console.error('Supabase error:', error);
    return res.status(500).json({ error: 'Database operation failed' });
  }

  return res.json({
    request_id: requestId,
    status: 'pending',
    message: 'Request submitted. IRS documents will be retrieved and processed within 24 hours.',
    webhook_url: platform_metadata?.webhook_url,
    check_status_url: `https://moderntax-api-live.vercel.app/api/status/${requestId}`,
    processing_time: {
      estimated_hours: 24,
      expected_completion: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      business_hours_only: true,
      note: 'Processing requires manual IRS verification through PPS hotline'
    }
  });
}

function parseAddress(addressString: string) {
  if (!addressString) return {} as any;

  const parts = addressString.split(',').map((s) => s.trim());

  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);

    if (stateZipMatch) {
      return {
        street: parts[0],
        city: parts[parts.length - 2],
        state: stateZipMatch[1],
        zip_code: stateZipMatch[2]
      } as any;
    }
  }

  return {
    street: addressString,
    city: parts[1] || '',
    state: parts[2]?.substring(0, 2) || '',
    zip_code: parts[3] || parts[2]?.substring(3) || ''
  } as any;
}

function normalizePhone(phone?: string) {
  if (!phone) return '';

  const digitsOnly = phone.replace(/\D/g, '');

  if (digitsOnly.length === 10) {
    return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
  }

  return digitsOnly;
}

async function sendWebhook(webhookUrl: string, data: any) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ModernTax-Event': 'verification.completed',
        'X-ModernTax-Request-ID': data.request_id
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      console.error(`Webhook failed: ${response.status} to ${webhookUrl}`);
    } else {
      console.log(`Webhook sent successfully to ${webhookUrl}`);
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }
}

function getTestResponse(requestId: string, ssn: string, formData: any, metadata: any) {
  if (ssn?.endsWith('0003')) {
    return {
      request_id: requestId,
      status: 'completed',
      test_mode: true,
      no_records: true,
      message: 'No tax records found for the specified years',
      income_verification: {},
      form_documents: [],
      verification_complete: true,
      webhook_sent: !!metadata?.webhook_url,
      timestamp: new Date().toISOString()
    };
  }

  const agi = ssn?.endsWith('0001') ? 148506 : ssn?.endsWith('0002') ? 25000 : 50000;
  const requestedYears = formData?.tax_years || ['2023'];
  const requestedForms = formData?.tax_forms || ['W-2', '1040'];

  const incomeVerification: any = {};
  const formDocuments: any[] = [];

  requestedYears.forEach((year: string) => {
    incomeVerification[`tax_year_${year}`] = {
      adjusted_gross_income: agi,
      wages_salaries: 105248,
      filing_status: 'Married Filing Joint',
      tax_forms_available: requestedForms
    };

    requestedForms.forEach((formType: string) => {
      if (formType === '1040') {
        formDocuments.push({
          form_type: '1040',
          tax_year: year,
          pdf_url: `https://moderntax-api-live.vercel.app/api/forms/1040/${year}/${requestId}.pdf`,
          html_url: `https://moderntax-api-live.vercel.app/api/forms/1040/${year}/${requestId}`
        });
      } else if (formType === 'W-2' || formType === 'W2') {
        formDocuments.push({
          form_type: 'W-2',
          tax_year: year,
          employer: 'DILL CORPORATION',
          ein: '12-3456789',
          pdf_url: `https://moderntax-api-live.vercel.app/api/forms/W2/${year}/${requestId}_1.pdf`,
          html_url: `https://moderntax-api-live.vercel.app/api/forms/W2/${year}/${requestId}_1`
        });
      } else if (formType === '1099') {
        formDocuments.push({
          form_type: '1099',
          tax_year: year,
          payer: 'INVESTMENT COMPANY LLC',
          pdf_url: `https://moderntax-api-live.vercel.app/api/forms/1099/${year}/${requestId}_1.pdf`,
          html_url: `https://moderntax-api-live.vercel.app/api/forms/1099/${year}/${requestId}_1`
        });
      } else if (formType === '1098') {
        formDocuments.push({
          form_type: '1098',
          tax_year: year,
          lender: 'FIRST NATIONAL BANK',
          pdf_url: `https://moderntax-api-live.vercel.app/api/forms/1098/${year}/${requestId}_1.pdf`,
          html_url: `https://moderntax-api-live.vercel.app/api/forms/1098/${year}/${requestId}_1`
        });
      }
    });
  });

  return {
    request_id: requestId,
    status: 'completed',
    test_mode: true,
    income_verification: incomeVerification,
    form_documents: formDocuments,
    transcripts: {
      wage_income_transcript: `https://moderntax-api-live.vercel.app/api/transcripts/${requestId}/pdf`
    },
    verification_complete: true,
    webhook_sent: !!metadata?.webhook_url,
    timestamp: new Date().toISOString(),
    processing_time: {
      actual_seconds: 1,
      note: 'Sandbox mode - immediate response'
    }
  };
}
