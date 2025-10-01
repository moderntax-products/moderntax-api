export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { company, email, use_case, environment } = req.body;

  if (!company || !email || !use_case) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['company', 'email', 'use_case'] 
    });
  }

  // Generate API key based on use case and environment
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  const env = environment === 'production' ? 'prod' : 'sandbox';
  const useCase = use_case === 'employment' ? 'emp' : 'tax';
  
  const apiKey = `mt_${env}_${useCase}_${company.toLowerCase().replace(/\s+/g, '')}_${timestamp}${random}`;
  const webhookSecret = `whsec_${timestamp}${random}_${company.toLowerCase().replace(/\s+/g, '')}`;

  const response = {
    api_key: apiKey,
    webhook_secret: webhookSecret,
    environment: env,
    use_case: use_case,
    company: company,
    endpoints: {
      employment_verification: `https://api.moderntax.io/v1/employment/verify`,
      tax_verification: `https://api.moderntax.io/v1/tax/verify`,
      documentation: `https://api.moderntax.io/docs/${use_case}`
    },
    headers: {
      'X-API-Key': apiKey,
      'X-Webhook-Secret': webhookSecret
    },
    created_at: new Date().toISOString()
  };

  // Log the new API key creation
  console.log('New API Key Created:', {
    company,
    email,
    use_case,
    environment: env,
    api_key: apiKey
  });

  res.status(200).json(response);
}
