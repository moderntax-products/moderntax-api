import { supabase } from '../../lib/supabase';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type, x-api-key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'];
  const validKeys = ['mt_prod_conductiv_2025_3c651d11d29e', 'mt_sandbox_conductiv_2025_test'];
  
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  const { borrower, form_8821_data, platform_metadata } = req.body;
  const ssn = borrower?.ssn || form_8821_data?.taxpayer_ssn;
  const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  try {
    // Log API usage
    await supabase.from('api_usage').insert({
      api_key: apiKey,
      endpoint: '/api/verify',
      request_id: requestId,
      ip_address: req.headers['x-forwarded-for']?.split(',')[0] || 'unknown',
      request_data: req.body,
      response_status: 200
    });
  } catch (error) {
    console.error('Failed to log API usage:', error);
  }
  
  // Handle test SSNs (sandbox mode)
  if (ssn?.startsWith('000-00')) {
    return res.json(getTestResponse(requestId, ssn, form_8821_data, platform_metadata));
  }
  
  // For real SSNs, create pending request in database
  const ssnHash = crypto.createHash('sha256').update(ssn).digest('hex');
  const taxpayerName = form_8821_data?.taxpayer_name || 
                       `${borrower?.first_name || ''} ${borrower?.last_name || ''}`.trim();
  
  try {
    const { data, error } = await supabase.from('verification_requests').insert({
      request_id: requestId,
      ssn_hash: ssnHash,
      taxpayer_name: taxpayerName,
      taxpayer_email: form_8821_data?.taxpayer_email || borrower?.email,
      tax_years: form_8821_data?.tax_years || ['2023'],
      tax_forms: form_8821_data?.tax_forms || ['W-2', '1040'],
      status: 'pending',
      webhook_url: platform_metadata?.webhook_url,
      metadata: {
        borrower,
        platform_metadata,
        source: 'conductiv',
        ip_address: req.headers['x-forwarded-for']?.split(',')[0] || 'unknown'
      }
    });
    
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to create request' });
    }
  } catch (error) {
    console.error('Supabase error:', error);
  }
  
  // Response for production requests
  return res.json({
    request_id: requestId,
    status: 'pending',
    message: 'Request submitted. IRS documents will be retrieved within 30-60 seconds.',
    webhook_url: platform_metadata?.webhook_url,
    check_status_url: `https://moderntax-api-live.vercel.app/api/status/${requestId}`
  });
}

function getTestResponse(requestId, ssn, formData, metadata) {
  const agi = ssn?.endsWith('0001') ? 148506 : ssn?.endsWith('0002') ? 25000 : 50000;
  const requestedYears = formData?.tax_years || ['2023'];
  const requestedForms = formData?.tax_forms || ['W-2', '1040'];
  
  const incomeVerification = {};
  const formDocuments = [];
  
  requestedYears.forEach(year => {
    incomeVerification[`tax_year_${year}`] = {
      adjusted_gross_income: agi,
      wages_salaries: 105248,
      filing_status: 'Married Filing Joint',
      tax_forms_available: requestedForms
    };
    
    if (requestedForms.includes('1040')) {
      formDocuments.push({
        form_type: '1040',
        tax_year: year,
        pdf_url: `https://moderntax-api-live.vercel.app/api/forms/1040/${year}/${requestId}.pdf`
      });
    }
    
    if (requestedForms.includes('W-2')) {
      formDocuments.push({
        form_type: 'W-2',
        tax_year: year,
        employer: 'DILL CORPORATION',
        pdf_url: `https://moderntax-api-live.vercel.app/api/forms/W2/${year}/${requestId}_1.pdf`
      });
    }
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
    webhook_sent: !!metadata?.webhook_url
  };
}
