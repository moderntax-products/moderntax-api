import { supabaseAdmin } from '../../../../lib/supabase-admin.js';
import { encryptSSN } from '../../../../lib/encryption.js';

/**
 * GET /api/v1/pps/clients - List all clients
 * POST /api/v1/pps/clients - Add a new client
 *
 * Manage the client/business master list for PPS calls.
 */
export default async function handler(req, res) {
  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.PPS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    return handleList(req, res);
  }
  if (req.method === 'POST') {
    return handleCreate(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req, res) {
  try {
    const { data: clients, error } = await supabaseAdmin
      .from('pps_clients')
      .select('id, business_name, entity_type, contact_name, contact_email, has_8821, has_2848, auth_expiry, last_request_at, total_requests, created_at')
      .order('business_name', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ clients });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleCreate(req, res) {
  try {
    const {
      business_name,
      ein,
      entity_type,
      contact_name,
      contact_email,
      contact_phone,
      has_8821,
      has_2848,
      auth_expiry,
      notes,
    } = req.body || {};

    if (!business_name || !ein) {
      return res.status(400).json({ error: 'business_name and ein are required' });
    }

    // Encrypt the EIN before storing
    const einEncrypted = encryptSSN(ein.replace(/\D/g, ''));

    const { data: client, error } = await supabaseAdmin
      .from('pps_clients')
      .insert({
        business_name,
        ein_encrypted: einEncrypted,
        entity_type,
        contact_name,
        contact_email,
        contact_phone,
        has_8821: has_8821 || false,
        has_2848: has_2848 || false,
        auth_expiry,
        notes,
      })
      .select('id, business_name, entity_type, contact_name')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ client });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
