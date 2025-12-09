#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// UPDATE THESE
const SUPABASE_URL = 'https://nixzwnfjglojemozlvmf.supabase.co';
   const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peHp3bmZqZ2xvamVtb3psdm1mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNzI4NzYxOCwiZXhwIjoyMDQyODYzNjE4fQ.YaFWrjPz0RfNJjpCCMT6CWTl5KX$OTo5UY1b_V5CdW0sPcLjwx9aqIDGo';

const BUCKET_NAME = 'irs-transcripts';
const REQUEST_ID = 'req_1759763036842_xx5b2ck9m';
const HTML_FILES = ['108934923338-1.html', '108934923338-2.html', '108934923338-3.html'];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    console.log('\n📦 Setting up Supabase...');
    await supabase.storage.createBucket(BUCKET_NAME, {public: true}).catch(() => {});
    
    const downloadsPath = path.join(process.env.HOME, 'Downloads');
    console.log('\n✅ Checking files...\n');
    
    const urls = [];
    for (const file of HTML_FILES) {
        const filePath = path.join(downloadsPath, file);
        if (!fs.existsSync(filePath)) {
            console.log(`❌ Missing: ${file}`);
            continue;
        }
        console.log(`📤 Uploading: ${file}`);
        const fileBuffer = fs.readFileSync(filePath);
        const storagePath = `${REQUEST_ID}/${file}`;
        const {error} = await supabase.storage.from(BUCKET_NAME).upload(storagePath, fileBuffer, {contentType: 'text/html', upsert: true});
        if (!error) {
            const {data} = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
            console.log(`✅ ${data.publicUrl}\n`);
            urls.push(data.publicUrl);
        }
    }
    console.log(`\n🎉 Uploaded ${urls.length} files!\n`);
    urls.forEach(u => console.log(u));
    console.log('');
}

main().catch(console.error);
