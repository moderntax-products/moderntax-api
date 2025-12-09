import { createClient } from '@supabase/supabase-js';
import { encryptSSN, encryptAddress } from '../../../../lib/encryption';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isValidSSN(ssn) {
  const ssnRegex = /^\d{3}-\d{2}-\d{4}$/;
  return ssnRegex.test(ssn);
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function generateRequestId() {
  return `emp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.EMPLOYER_COM_API_KEY) {
    return res.status(401).json({
      error: 'Invalid API key',
      timestamp: new Date().toISOString()
    });
  }

  const { employee, years, callback_url } = req.body;

  if (!employee) {
    return res.status(400).json({
      error: 'Missing required field: employee',
      timestamp: new Date().toISOString()
    });
  }

  const { first_name, last_name, ssn, email, home_address } = employee;

  if (!first_name || typeof first_name !== 'string' || first_name.trim().length === 0) {
    return res.status(400).json({
      error: 'Missing or invalid field: employee.first_name',
      timestamp: new Date().toISOString()
    });
  }

  if (!last_name || typeof last_name !== 'string' || last_name.trim().length === 0) {
    return res.status(400).json({
      error: 'Missing or invalid field: employee.last_name',
      timestamp: new Date().toISOString()
    });
  }

  if (!ssn || !isValidSSN(ssn)) {
    return res.status(400).json({
      error: 'Missing or invalid field: employee.ssn (format: XXX-XX-XXXX)',
      timestamp: new Date().toISOString()
    });
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({
      error: 'Missing or invalid field: employee.email',
      timestamp: new Date().toISOString()
    });
  }

  if (!home_address || typeof home_address !== 'string' || home_address.trim().length === 0) {
    return res.status(400).json({
      error: 'Missing or invalid field: employee.home_address',
      timestamp: new Date().toISOString()
    });
  }

  if (!years || !Array.isArray(years) || years.length === 0) {
    return res.status(400).json({
      error: 'Missing or invalid field: years (must be array of integers)',
      timestamp: new Date().toISOString()
    });
  }

  if (!years.every(y => Number.isInteger(y) && y >= 2000 && y <= new Date().getFullYear())) {
    return res.status(400).json({
      error: 'Invalid years: must be integers between 2000 and current year',
      timestamp: new Date().toISOString()
    });
  }

  if (callback_url && typeof callback_url === 'string') {
    try {
      const url = new URL(callback_url);
      if (url.protocol !== 'https:') {
        return res.status(400).json({
          error: 'callback_url must use HTTPS',
          timestamp: new Date().toISOString()
        });
      }
    } catch {
      return res.status(400).json({
        error: 'Invalid callback_url format',
        timestamp: new Date().toISOString()
      });
    }
  }

  const request_id = generateRequestId();
  const ssn_last_four = ssn.slice(-4);

  try {
    const ssn_encrypted = encryptSSN(ssn);
    const home_address_encrypted = encryptAddress(home_address);

    const { data, error } = await supabase
      .from('employment_requests')
      .insert({
        request_id,
        employee_first_name: first_name.trim(),
        employee_last_name: last_name.trim(),
        ssn_last_four,
        ssn_encrypted,
        email: email.toLowerCase().trim(),
        home_address_encrypted,
        years,
        status: 'pending_signature',
        callback_url: callback_url || null,
        api_key_used: apiKey,
        created_at: new Date(),
        updated_at: new Date()
      })
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({
        error: 'Failed to create verification request',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', 'https://employer.com');
    res.setHeader('X-Request-ID', request_id);
    res.setHeader('X-API-Version', '1.0');

    return res.status(200).json({
      request_id,
      status: 'pending_signature',
      employee_info: {
        name: `${first_name} ${last_name}`,
        ssn_last_four,
        email
      },
      message: `Verification request created. Signature request will be sent to ${email}`,
      next_steps: [
        `Employee will receive HelloSign signature request at ${email}`,
        'Employee signs Form 8821',
        'ModernTax submits to IRS',
        `Check status at: GET /api/v1/employment/status/${request_id}`
      ],
      poll_url: `/api/v1/employment/status/${request_id}`,
      expires_in_days: 30,
      timestamps: {
        created_at: new Date().toISOString(),
        requested_by_key: apiKey.substring(0, 8) + '****'
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}
