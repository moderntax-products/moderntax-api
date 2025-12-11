import { supabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';

export class APIKeyService {
  static async generateAPIKey(customerId, productName) {
    const timestamp = Date.now();
    const secretKey = crypto.randomBytes(32).toString('hex');
    const fullApiKey = `sk_${productName}_${timestamp}_${secretKey}`;
    
    const hashedKey = crypto.createHash('sha256').update(fullApiKey).digest('hex');

    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .insert({
        customer_id: customerId,
        product: productName,
        key_id: fullApiKey,
        key_hash: hashedKey,
        secret_preview: secretKey.slice(-4),
        status: 'active',
        created_at: new Date().toISOString(),
        rate_limit: 1000,
        requests_today: 0,
      })
      .select('id')
      .single();

    if (error) throw error;
    return fullApiKey;
  }

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
