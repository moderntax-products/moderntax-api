import { supabaseAdmin } from '../../../../lib/supabase-admin.js';

/**
 * GET /api/v1/pps/experts — List all experts
 * POST /api/v1/pps/experts — Create a new expert
 * PUT /api/v1/pps/experts — Update an expert
 */
export default async function handler(req, res) {
  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.PPS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('pps_experts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ experts: data });
  }

  if (req.method === 'POST') {
    const { name, email, phone, ptin, cafNumber, timezone, availableStart, availableEnd, availableDays, maxCallsPerDay, maxRequestsPerCall, hourlyRate } = req.body || {};

    if (!name || !phone) {
      return res.status(400).json({ error: 'name and phone are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('pps_experts')
      .insert({
        name,
        email,
        phone,
        ptin,
        caf_number: cafNumber,
        timezone: timezone || 'America/Los_Angeles',
        available_start: availableStart || '09:00',
        available_end: availableEnd || '14:00',
        available_days: availableDays || [1, 2, 3, 4, 5],
        max_calls_per_day: maxCallsPerDay || 3,
        max_requests_per_call: maxRequestsPerCall || 5,
        hourly_rate: hourlyRate,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ expert: data });
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });

    // Convert camelCase to snake_case for DB columns
    const dbUpdates = {};
    const fieldMap = {
      name: 'name', email: 'email', phone: 'phone', ptin: 'ptin',
      cafNumber: 'caf_number', timezone: 'timezone',
      availableStart: 'available_start', availableEnd: 'available_end',
      availableDays: 'available_days', maxCallsPerDay: 'max_calls_per_day',
      maxRequestsPerCall: 'max_requests_per_call', hourlyRate: 'hourly_rate',
      isActive: 'is_active', callsToday: 'calls_today',
    };

    for (const [key, value] of Object.entries(updates)) {
      if (fieldMap[key]) dbUpdates[fieldMap[key]] = value;
    }

    const { data, error } = await supabaseAdmin
      .from('pps_experts')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ expert: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
