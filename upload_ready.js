#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const SUPABASE_URL = 'https://nixzwnfjglojemozlvmf.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peHp3bmZqZ2xvamVtb3psdm1mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Nzk2MzMzMywiZXhwIjoyMDczNTM5MzMzfQ.qe36GBNEHc1scnOTo5UY1b_V5CdW0sPcLjwx9aqIDGo';
const BUCKET_NAME = 'irs-transcripts';
const REQUEST_ID = 'req_1759763036842_xx5b2ck9m';
const HTML_FILES = ['108934923338-1.html', '108934923338-2.html', '108934923338-3.html'];
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
async function main() {
    console.log('\n📦 Setting up Supabase...\n');
    await supabase.storage.createBucket(BUCKET_NAME, {public:true}).catch(()=>{});
    const downloadsPath = path.join(process.env.HOME, 'Downloads');
    const urls = [];
    for (const file of HTML_FILES) {
        const filePath = path.join(downloadsPath, file);
        if (!fs.existsSync(filePath)) { console.log(`⏭️  ${file} not found`); continue; }
        console.log(`📤 ${file}`);
        const fileBuffer = fs.readFileSync(filePath);
        const {error} = await supabase.storage.from(BUCKET_NAME).upload(`${REQUEST_ID}/${file}`, fileBuffer, {contentType:'text/html',upsert:true});
        if (error) { console.log(`   ❌ ${error.message}\n`); } else {
            const {data} = supabase.storage.from(BUCKET_NAME).getPublicUrl(`${REQUEST_ID}/${file}`);
            console.log(`   ✅ ${data.publicUrl}\n`);
            urls.push(data.publicUrl);
        }
    }
    console.log(`\n✅ Uploaded ${urls.length} files!\n`);
    urls.forEach(u => console.log(u));
    console.log('');
}
main().catch(console.error);
