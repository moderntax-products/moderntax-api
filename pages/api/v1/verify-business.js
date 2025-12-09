export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-api-key'];
  const validKeys = ['mt_prod_conductiv_2025_3c651d11d29e', 'mt_sandbox_conductiv_test', 'mt_sandbox_conductiv_2025_test'];
  
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key', timestamp: new Date().toISOString() });
  }

  const body = req.body;
  const data = body.form_8821_data || body;
  
  const ein = data.ein || data.taxpayer_ein;
  const businessName = data.business_name || data.taxpayer_name;
  const businessAddress = data.business_address || data.taxpayer_address;
  const entityType = data.entity_type || data.business_type || data.business_structure;
  
  const authRep = data.authorized_representative || data.business_officer || {};
  const officerName = authRep.name || `${authRep.first_name || ''} ${authRep.last_name || ''}`.trim();
  const officerTitle = authRep.title;
  
  const taxYears = data.tax_years || data.years || ['2024', '2023', '2022'];
  const taxForms = data.tax_forms || ['1120S', '941'];
  
  const errors = [];
  if (!ein) errors.push('ein (or taxpayer_ein) is required');
  if (!businessName) errors.push('business_name (or taxpayer_name) is required');
  if (!businessAddress) errors.push('business_address (or taxpayer_address) is required');
  if (!entityType) errors.push('entity_type is required (S-Corp, C-Corp, or Partnership)');
  if (!officerName) errors.push('authorized_representative.name is required');
  if (!officerTitle) errors.push('authorized_representative.title is required');
  
  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Missing required fields for Form 8821',
      validation_errors: errors,
      required_fields: {
        ein: 'XX-XXXXXXX',
        business_name: 'Company Name',
        business_address: '123 Main St, City, State ZIP',
        entity_type: 'S-Corp | C-Corp | Partnership',
        authorized_representative: {
          name: 'Full Name',
          title: 'CEO | President | Manager | Partner'
        },
        tax_years: ['2024', '2023'],
        tax_forms: ['1120S', '941', '1120', '1065']
      }
    });
  }
  
  if (!/^\d{2}-\d{7}$/.test(ein)) {
    return res.status(400).json({ error: 'Invalid EIN format. Must be XX-XXXXXXX' });
  }
  
  const validEntityTypes = ['S-Corp', 'C-Corp', 'Partnership'];
  if (!validEntityTypes.some(type => entityType.toLowerCase().includes(type.toLowerCase()))) {
    return res.status(400).json({ error: 'entity_type must be S-Corp, C-Corp, or Partnership' });
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const isTest = ein.startsWith('00-');
  
  let normalizedEntityType = entityType.toLowerCase().includes('s-corp') ? 'S-Corp' : 
                              entityType.toLowerCase().includes('c-corp') ? 'C-Corp' : 'Partnership';

  if (isTest) {
    const formType = normalizedEntityType === 'C-Corp' ? '1120' : normalizedEntityType === 'Partnership' ? '1065' : '1120S';
    return res.status(200).json({
      request_id: requestId,
      status: 'completed',
      test_mode: true,
      business_entity: {
        name: businessName,
        ein: ein,
        ein_last_four: ein.slice(-4),
        entity_type: normalizedEntityType,
        address: businessAddress,
        authorized_representative: { name: officerName, title: officerTitle }
      },
      tax_verification: {
        tax_year_2023: { gross_receipts: 1250000, ordinary_business_income: 285000, form_type: formType },
        tax_year_2022: { gross_receipts: 1100000, ordinary_business_income: 245000, form_type: formType }
      },
      form_documents: taxYears.map(year => ({
        form_type: formType,
        tax_year: year,
        pdf_url: `https://moderntax-api-live.vercel.app/api/forms/${formType}/${year}/${requestId}.pdf`,
        html_url: `https://moderntax-api-live.vercel.app/api/forms/${formType}/${year}/${requestId}`,
        line_data: {
          line_1a: { label: 'Gross receipts or sales', value: 1250000, line_number: '1a' },
          line_21: { label: 'Ordinary business income', value: 285000, line_number: '21' }
        }
      })),
      timestamp: new Date().toISOString()
    });
  } else {
    console.log('🚨 PRODUCTION:', { request_id: requestId, ein_last_four: ein.slice(-4), business: businessName });
    return res.status(200).json({
      request_id: requestId,
      status: 'processing',
      test_mode: false,
      business_entity: {
        name: businessName,
        ein_last_four: ein.slice(-4),
        entity_type: normalizedEntityType,
        authorized_representative: { name: officerName, title: officerTitle }
      },
      message: 'Processing takes 24-48 hours',
      check_status_url: `https://moderntax-api-live.vercel.app/api/status/${requestId}`,
      timestamp: new Date().toISOString()
    });
  }
}
