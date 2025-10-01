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
  
  const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'] || req.headers['X-API-KEY'];
  const validKeys = ['mt_prod_conductiv_2025_3c651d11d29e', 'mt_sandbox_conductiv_2025_test'];
  
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  const { borrower, form_8821_data, platform_metadata } = req.body;
  const ssn = borrower?.ssn || form_8821_data?.taxpayer_ssn;
  const baseRequestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  const requestedYears = form_8821_data?.tax_years || ['2023'];
  const requestedForms = form_8821_data?.tax_forms || ['W-2', '1040'];
  
  let agi = 148506;
  let status = 'completed';
  
  if (ssn?.endsWith('0002')) {
    agi = 25000;
  } else if (ssn?.endsWith('0003')) {
    status = 'no_records';
    agi = 0;
  }
  
  const incomeVerification = {};
  const documentsByYear = {};
  const formDocuments = [];
  
  if (status !== 'no_records') {
    requestedYears.forEach(year => {
      const yearRequestId = `${baseRequestId}_${year}`;
      
      incomeVerification[`tax_year_${year}`] = {
        adjusted_gross_income: agi,
        wages_salaries: 105248,
        filing_status: 'Married Filing Joint',
        tax_forms_available: requestedForms
      };
      
      documentsByYear[`tax_year_${year}`] = {
        transcript_pdf: `https://moderntax-api-live.vercel.app/api/transcripts/${yearRequestId}/pdf`,
        transcript_json: `https://moderntax-api-live.vercel.app/api/transcripts/${yearRequestId}/json`
      };
      
      // Add individual form PDFs for each year
      if (requestedForms.includes('1040')) {
        formDocuments.push({
          form_type: '1040',
          tax_year: year,
          pdf_url: `https://moderntax-api-live.vercel.app/api/forms/1040/${year}/${baseRequestId}.pdf`,
          pages: 2
        });
      }
      
      if (requestedForms.includes('W-2')) {
        // Multiple W-2s from different employers
        formDocuments.push({
          form_type: 'W-2',
          tax_year: year,
          employer: 'DILL CORPORATION',
          pdf_url: `https://moderntax-api-live.vercel.app/api/forms/W2/${year}/${baseRequestId}_1.pdf`,
          pages: 1
        });
        formDocuments.push({
          form_type: 'W-2',
          tax_year: year,
          employer: 'SHAN ENTERPRISES',
          pdf_url: `https://moderntax-api-live.vercel.app/api/forms/W2/${year}/${baseRequestId}_2.pdf`,
          pages: 1
        });
      }
      
      if (requestedForms.includes('1098')) {
        formDocuments.push({
          form_type: '1098',
          tax_year: year,
          lender: 'DOVE MORTGAGE',
          pdf_url: `https://moderntax-api-live.vercel.app/api/forms/1098/${year}/${baseRequestId}.pdf`,
          pages: 1
        });
      }
      
      if (requestedForms.includes('1099')) {
        formDocuments.push({
          form_type: '1099-DIV',
          tax_year: year,
          payer: 'ROBI INVESTMENTS',
          pdf_url: `https://moderntax-api-live.vercel.app/api/forms/1099DIV/${year}/${baseRequestId}.pdf`,
          pages: 1
        });
      }
    });
  }
  
  const response = {
    request_id: baseRequestId,
    status: status,
    test_mode: ssn?.startsWith('000-00'),
    webhook_url: platform_metadata?.webhook_url || null,
    taxpayer_info: {
      name: form_8821_data?.taxpayer_name || 'Test User',
      ssn_last_four: ssn?.slice(-4),
      tax_years_requested: requestedYears,
      tax_forms_requested: requestedForms
    },
    income_verification: incomeVerification,
    
    // IRS Transcripts (summary documents)
    transcripts: {
      wage_income_transcript: `https://moderntax-api-live.vercel.app/api/transcripts/${baseRequestId}/pdf`,
      record_of_account: `https://moderntax-api-live.vercel.app/api/transcripts/${baseRequestId}_roa/pdf`,
      json_format: `https://moderntax-api-live.vercel.app/api/transcripts/${baseRequestId}/json`
    },
    
    // Individual IRS Form PDFs
    form_documents: formDocuments,
    
    // Legacy structure for backward compatibility
    documents: {
      transcript_pdf: `https://moderntax-api-live.vercel.app/api/transcripts/${baseRequestId}/pdf`,
      transcript_json: `https://moderntax-api-live.vercel.app/api/transcripts/${baseRequestId}/json`,
      transcript_txt: `https://moderntax-api-live.vercel.app/api/transcripts/${baseRequestId}/txt`,
      transcript_xml: `https://moderntax-api-live.vercel.app/api/transcripts/${baseRequestId}/xml`
    },
    
    documents_by_year: documentsByYear
  };
  
  // Send webhook for test SSNs
  if (platform_metadata?.webhook_url && ssn?.startsWith('000-00')) {
    try {
      const webhookPayload = {
        ...response,
        webhook_timestamp: new Date().toISOString(),
        webhook_event: 'verification.completed'
      };
      
      const webhookResponse = await fetch(platform_metadata.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ModernTax/1.0',
          'X-ModernTax-Signature': 'sig_' + baseRequestId
        },
        body: JSON.stringify(webhookPayload)
      });
      
      response.webhook_sent = true;
      response.webhook_status = webhookResponse.status;
      
    } catch (error) {
      response.webhook_sent = false;
      response.webhook_error = error.message;
    }
  }
  
  return res.status(200).json(response);
}
