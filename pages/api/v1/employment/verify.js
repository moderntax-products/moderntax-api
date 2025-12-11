import crypto from 'crypto';
import { supabaseAdmin } from '../../../lib/supabase-admin';

class APIKeyService {
  static async verifyAPIKey(bearerToken) {
    try {
      const token = bearerToken.replace('Bearer ', '').trim();
      const hashedKey = crypto.createHash('sha256').update(token).digest('hex');

      const { data: apiKey, error } = await supabaseAdmin
        .from('api_keys')
        .select('customer_id, product, status, rate_limit, requests_today')
        .eq('key_hash', hashedKey)
        .eq('status', 'active')
        .single();

      if (error || !apiKey) {
        return { valid: false, error: 'Invalid API key' };
      }

      if (apiKey.requests_today >= apiKey.rate_limit) {
        return { valid: false, error: 'Rate limit exceeded' };
      }

      return {
        valid: true,
        customerId: apiKey.customer_id,
        product: apiKey.product,
      };
    } catch (error) {
      console.error('API key verification error:', error);
      return { valid: false, error: 'Key verification failed' };
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        request_id: requestId,
        error: 'Missing Authorization header',
        help: 'Include: Authorization: Bearer YOUR_API_KEY',
      });
    }

    const verification = await APIKeyService.verifyAPIKey(authHeader);
    
    if (!verification.valid) {
      return res.status(401).json({
        request_id: requestId,
        error: verification.error,
      });
    }

    const { customerId, product } = verification;

    const { employee } = req.body;

    if (!employee) {
      return res.status(400).json({
        request_id: requestId,
        error: 'Missing "employee" field in request body',
      });
    }

    const required = ['ssn', 'first_name', 'last_name', 'employer_name'];
    const missing = required.filter((field) => !employee[field]);

    if (missing.length > 0) {
      return res.status(400).json({
        request_id: requestId,
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    await supabaseAdmin.from('api_requests').insert({
      customer_id: customerId,
      endpoint: '/v1/employment/verify',
      method: 'POST',
      status_code: 200,
      response_time_ms: Date.now() - startTime,
    });

    return res.status(200).json({
      request_id: requestId,
      status: 'success',
      message: 'Request received and processed',
      employee_info: {
        name: `${employee.first_name} ${employee.last_name}`,
        ssn_last_four: employee.ssn.slice(-4),
      },
      employer: employee.employer_name,
    });

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);

    await supabaseAdmin.from('api_requests').insert({
      customer_id: 'unknown',
      endpoint: '/v1/employment/verify',
      method: 'POST',
      status_code: 500,
      response_time_ms: Date.now() - startTime,
      error_message: error.message,
    }).catch(() => {});

    return res.status(500).json({
      request_id: requestId,
      error: 'Internal server error',
      message: error.message,
    });
  }
}
