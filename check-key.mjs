import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = 'https://nixzwnfjglojemozlvmf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peHp3bmZqZ2xvamVtb3psdm1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NjMzMzMsImV4cCI6MjA3MzUzOTMzM30.qx8VUmL9EDlxtCNj4CF04Ld9xCFWDugNHhAmV0ixfuQ'

const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey)

async function checkKey() {
  try {
    // Check what's in the database
    const { data: keys, error } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .eq('customer_id', 'employer_com')
    
    if (error) {
      console.error('❌ Error:', error)
      return
    }
    
    console.log('Keys in database:')
    console.log(JSON.stringify(keys, null, 2))
    
    if (keys.length === 0) {
      console.log('\n⚠️  NO KEYS FOUND! The key was not saved.')
      return
    }
    
    // Now test the verification
    const testKey = 'sk_employercom_1765491248783_586ad880b0c9e1c3df89ef6c6b6b6b1cf71399db440555a1e844117da34505f8'
    const hashedTest = crypto.createHash('sha256').update(testKey).digest('hex')
    
    console.log('\n\nTest key:', testKey)
    console.log('Test hash:', hashedTest)
    console.log('DB key_hash:', keys[0]?.key_hash)
    console.log('Hashes match?', hashedTest === keys[0]?.key_hash)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

checkKey()
