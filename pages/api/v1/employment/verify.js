import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nixzwnfjglojemozlvmf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peHp3bmZqZ2xvamVtb3psdm1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NjMzMzMsImV4cCI6MjA3MzUzOTMzM30.qx8VUmL9EDlxtCNj4CF04Ld9xCFWDugNHhAmV0ixfuQ';
const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestId = `req_${Date.now()}`;

  try {
    const { employee } = req.body;

    if (!employee) {
      return res.status(400).json({
        request_id: requestId,
        error: 'Missing "employee" field',
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
    return res.status(500).json({
      request_id: requestId,
      error: 'Internal server error',
      message: error.message,
    });
  }
}
