export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, X-Webhook-Secret, Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      service: 'Employment Verification',
      company: 'Employer.com',
      documentation: 'https://api.moderntax.io/docs/employment',
      test_ssns: {
        '000-00-0001': 'Currently employed, $75k salary',
        '000-00-0002': 'Terminated, last salary $50k',
        '000-00-0003': 'No employment records'
      }
    });
  }

  if (req.method === 'POST') {
    const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'];
    const webhookSecret = req.headers['x-webhook-secret'] || req.headers['X-Webhook-Secret'];
    
    // Accept multiple API keys for different clients
    const validKeys = [
      'mt_sandbox_emp_employercom_test123',
      'mt_sandbox_emp_greg_test456',
      'mt_prod_emp_employercom_2025'
    ];
    
    if (!apiKey || !validKeys.some(key => apiKey.startsWith('mt_'))) {
      return res.status(401).json({ 
        error: 'Invalid API key',
        message: 'Include X-API-Key header with your API key',
        documentation: 'https://api.moderntax.io/docs/employment'
      });
    }

    const { employee, request_type } = req.body;
    const ssn = employee?.ssn || '000-00-0001';
    const requestId = 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Different responses based on SSN
    let employmentData = {};
    let status = 'verified';

    if (ssn === '000-00-0001' || ssn.endsWith('0001')) {
      // Currently employed
      employmentData = {
        employment_status: 'active',
        employer: 'Tech Corp Inc.',
        job_title: 'Software Engineer',
        hire_date: '2021-03-15',
        current_salary: 75000,
        pay_frequency: 'bi-weekly',
        last_pay_date: '2024-09-13',
        ytd_earnings: 56250
      };
    } else if (ssn === '000-00-0002' || ssn.endsWith('0002')) {
      // Terminated
      employmentData = {
        employment_status: 'terminated',
        employer: 'Tech Corp Inc.',
        job_title: 'Junior Developer',
        hire_date: '2020-06-01',
        termination_date: '2024-01-15',
        last_salary: 50000,
        termination_reason: 'voluntary',
        eligible_for_rehire: true
      };
    } else if (ssn === '000-00-0003' || ssn.endsWith('0003')) {
      // No records
      status = 'no_records';
      employmentData = null;
    } else {
      // Production SSN - async processing
      status = 'processing';
      employmentData = {
        message: 'Employment verification in progress. Results will be sent via webhook.'
      };
    }

    const response = {
      request_id: requestId,
      status: status,
      test_mode: ssn.startsWith('000-00'),
      employee_info: {
        name: employee?.name || 'Test Employee',
        ssn_last_four: ssn.slice(-4)
      },
      employment_verification: employmentData,
      verification_details: {
        verification_date: new Date().toISOString(),
        data_source: 'employer_direct',
        expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
      }
    };

    return res.status(200).json(response);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
