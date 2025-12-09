import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.EMPLOYER_COM_API_KEY) {
    return res.status(401).json({
      error: 'Invalid API key',
      timestamp: new Date().toISOString()
    });
  }

  const { requestId } = req.query;

  if (!requestId) {
    return res.status(400).json({
      error: 'Missing required parameter: requestId',
      timestamp: new Date().toISOString()
    });
  }

  try {
    const { data, error } = await supabase
      .from('employment_requests')
      .select('*')
      .eq('request_id', requestId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Request not found',
          request_id: requestId,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', 'https://employer.com');
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Cache-Control', 'no-cache');

    // Format response based on status
    const response = {
      request_id: data.request_id,
      status: data.status,
      employee_info: {
        name: `${data.employee_first_name} ${data.employee_last_name}`,
        ssn_last_four: data.ssn_last_four,
        email: data.email
      },
      timestamps: {
        requested_at: data.created_at,
        updated_at: data.updated_at
      }
    };

    // Add status-specific information
    if (data.status === 'pending_signature') {
      response.status_details = {
        current_step: 'Awaiting employee signature',
        message: `HelloSign signature request sent to ${data.email}`,
        next_step: 'Employee signs Form 8821'
      };
    } else if (data.status === 'signature_completed') {
      response.status_details = {
        current_step: 'Form signed - Submitting to IRS',
        signed_at: data.hellosign_completed_at,
        caf_number: data.caf_number,
        message: 'Awaiting IRS transcript retrieval'
      };
    } else if (data.status === 'irs_submitted') {
      response.status_details = {
        current_step: 'Submitted to IRS',
        submitted_at: data.irs_submitted_at,
        caf_number: data.caf_number,
        message: 'Waiting for IRS transcript'
      };
    } else if (data.status === 'irs_retrieved') {
      response.status_details = {
        current_step: 'IRS transcript received - Processing',
        retrieved_at: data.irs_retrieved_at,
        message: 'Parsing employment data'
      };
    } else if (data.status === 'parsed') {
      response.status_details = {
        current_step: 'Finalizing results',
        message: 'Processing complete'
      };
    } else if (data.status === 'completed') {
      response.status_details = {
        current_step: 'Complete',
        completed_at: data.updated_at,
        expires_at: data.expires_at
      };
      response.employment_verification = {
        employment_status: data.employment_data?.employment_status || 'unknown',
        employment_history: data.employment_data?.employment_history || [],
        summary: data.employment_data?.summary || {
          total_employers: data.total_employers,
          total_w2_income: data.total_w2_income,
          multi_employer_detected: data.multi_employer_detected
        }
      };
    } else if (data.status === 'failed') {
      response.status_details = {
        current_step: 'Failed',
        error: data.error_message,
        message: 'Please contact support'
      };
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Status endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}
