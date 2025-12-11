// generate-key.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function generateAPIKey() {
  try {
    const customerId = 'employer_com';
    const productName = 'employercom';
    
    const keyId = `sk_${productName}_${Date.now()}`;
    const secretKey = crypto.randomBytes(32).toString('hex');
    const hashedKey = crypto.createHash('sha256').update(secretKey).digest('hex');

    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .insert({
        customer_id: customerId,
        product: productName,
        key_id: keyId,
        key_hash: hashedKey,
        secret_preview: secretKey.slice(-4),
        status: 'active',
        created_at: new Date().toISOString(),
        rate_limit: 1000,
        requests_today: 0,
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      process.exit(1);
    }

    const fullKey = `${keyId}_${secretKey}`;
    console.log('\n✅ API Key generated successfully!\n');
    console.log('API Key:', fullKey);
    console.log('\n⚠️ SAVE THIS - It will only be shown once!');
    console.log('\nShare with customer:', fullKey);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

generateAPIKey();