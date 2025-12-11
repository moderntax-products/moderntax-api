import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = 'https://nixzwnfjglojemozlvmf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peHp3bmZqZ2xvamVtb3psdm1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NjMzMzMsImV4cCI6MjA3MzUzOTMzM30.qx8VUmL9EDlxtCNj4CF04Ld9xCFWDugNHhAmV0ixfuQ'

const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey)

async function generateAPIKey() {
  try {
    const customerId = 'employer_com'
    const productName = 'employercom'
    
    // Generate full API key
    const timestamp = Date.now()
    const secretKey = crypto.randomBytes(32).toString('hex')
    const fullApiKey = `sk_${productName}_${timestamp}_${secretKey}`
    
    // Hash the FULL key
    const hashedKey = crypto.createHash('sha256').update(fullApiKey).digest('hex')

    console.log('📝 Generating API key...')

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
      .single()

    if (error) {
      console.error('❌ Database error:', error.message)
      process.exit(1)
    }

    console.log('')
    console.log('✅ API Key generated successfully!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('API Key:', fullApiKey)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

generateAPIKey()
