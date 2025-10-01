export default function handler(req, res) {
  const docs = {
    service: 'ModernTax Employment Verification API',
    version: '1.0.0',
    base_url: 'https://api.moderntax.io',
    authentication: {
      type: 'API Key',
      header: 'X-API-Key',
      description: 'Include your API key in the X-API-Key header'
    },
    endpoints: [
      {
        method: 'POST',
        path: '/v1/employment/verify',
        description: 'Verify employment status and income',
        headers: {
          'X-API-Key': 'Your API key (required)',
          'X-Webhook-Secret': 'Your webhook secret (optional)',
          'Content-Type': 'application/json'
        },
        request_body: {
          employee: {
            ssn: 'Social Security Number (XXX-XX-XXXX)',
            name: 'Employee full name',
            dob: 'Date of birth (YYYY-MM-DD)',
            email: 'Employee email'
          },
          request_type: 'employment_verification',
          include_salary: true,
          include_history: false
        },
        response: {
          request_id: 'Unique request identifier',
          status: 'verified | processing | no_records',
          employment_verification: {
            employment_status: 'active | terminated | on_leave',
            employer: 'Company name',
            job_title: 'Current position',
            hire_date: 'YYYY-MM-DD',
            current_salary: 'Annual salary in USD',
            ytd_earnings: 'Year-to-date earnings'
          }
        }
      }
    ],
    test_ssns: {
      '000-00-0001': 'Currently employed, $75k salary',
      '000-00-0002': 'Terminated employee',
      '000-00-0003': 'No employment records'
    },
    postman_collection: 'https://api.moderntax.io/postman/employment-verification.json',
    support: {
      email: 'support@moderntax.io',
      phone: '650-741-1085'
    }
  };

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(docs);
}
