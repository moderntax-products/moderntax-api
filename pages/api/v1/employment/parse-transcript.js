import { createClient } from '@supabase/supabase-js';
import IRSEmploymentParser from '../../../../lib/irs_employment_parser';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  const { request_id, html_transcript, caf_number } = req.body;

  if (!request_id) {
    return res.status(400).json({
      error: 'Missing required field: request_id',
      timestamp: new Date().toISOString()
    });
  }

  if (!html_transcript) {
    return res.status(400).json({
      error: 'Missing required field: html_transcript',
      timestamp: new Date().toISOString()
    });
  }

  try {
    // Fetch the request from database
    const { data: request, error: fetchError } = await supabase
      .from('employment_requests')
      .select('*')
      .eq('request_id', request_id)
      .single();

    if (fetchError || !request) {
      return res.status(404).json({
        error: 'Request not found',
        request_id,
        timestamp: new Date().toISOString()
      });
    }

    // Parse the HTML transcript
    const parser = new IRSEmploymentParser(html_transcript);
    const parsedData = parser.parse();

    // Prepare employment data for storage
    const employmentData = {
      employment_status: parsedData.employment_status,
      employment_history: parsedData.summary.employment_history,
      summary: {
        total_employers: parsedData.summary.total_employers,
        total_w2_income: parsedData.summary.total_w2_income,
        multi_employer_detected: parsedData.summary.multi_employer_detected
      }
    };

    // Update the request with parsed data
    const { data: updated, error: updateError } = await supabase
      .from('employment_requests')
      .update({
        status: 'completed',
        employment_data: employmentData,
        raw_transcript_html: html_transcript,
        caf_number: caf_number || null,
        irs_retrieved_at: new Date(),
        multi_employer_detected: parsedData.summary.multi_employer_detected,
        total_employers: parsedData.summary.total_employers,
        total_w2_income: parsedData.summary.total_w2_income,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        updated_at: new Date()
      })
      .eq('request_id', request_id)
      .select();

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return res.status(500).json({
        error: 'Failed to parse and store transcript',
        details: updateError.message,
        timestamp: new Date().toISOString()
      });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', 'https://employer.com');
    res.setHeader('X-Request-ID', request_id);

    return res.status(200).json({
      request_id,
      status: 'completed',
      message: 'Transcript parsed and employment data extracted',
      employment_summary: {
        total_employers: parsedData.summary.total_employers,
        total_w2_income: parsedData.summary.total_w2_income,
        multi_employer_detected: parsedData.summary.multi_employer_detected,
        employers: parsedData.summary.employment_history.map(e => ({
          employer: e.employer,
          wages: e.wages,
          year: e.year
        }))
      },
      poll_url: `/api/v1/employment/status/${request_id}`,
      timestamps: {
        parsed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('Parsing error:', error);
    return res.status(500).json({
      error: 'Failed to parse transcript',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
