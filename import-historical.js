const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

const supabase = createClient(
  'https://nixzwnfjglojemozlvmf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peHp3bmZqZ2xvamVtb3psdm1mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Nzk2MzMzMywiZXhwIjoyMDczNTM5MzMzfQ.qe36GBNEHc1scnOTo5UY1b_V5CdW0sPcLjwx9aqIDGo'
);

async function importHistorical() {
  console.log('Importing historical Centerstone rows...\n');
  
  const csvDir = path.join(process.env.HOME, 'Downloads/drive-download-20251130T222754Z-1-001');
  
  console.log(`Reading from: ${csvDir}\n`);
  
  if (!fs.existsSync(csvDir)) {
    console.log(`✗ Folder not found: ${csvDir}`);
    return;
  }
  
  const csvFiles = fs.readdirSync(csvDir)
    .filter(f => f.endsWith('.csv'));
  
  console.log(`Found ${csvFiles.length} CSV files\n`);
  
  let totalInserted = 0;
  
  for (const file of csvFiles) {
    const filepath = path.join(csvDir, file);
    const content = fs.readFileSync(filepath, 'utf8');
    
    try {
      const records = csv.parse(content, {
        columns: true,
        skip_empty_lines: true
      });
      
      // Map to database schema
      const mapped = records.map(row => ({
        legal_name: row.legal_name || null,
        tid: row.tid || null,
        tid_kind: row.tid_kind || null,
        address: row.address || null,
        city: row.city || null,
        state: row.state || null,
        zip_code: row.zip_code || null,
        signer_first_name: row['first name'] || null,
        signer_last_name: row['last name'] || null,
        signer_email: null,
        tax_years: row.years || null,
        tax_forms: row.form || null,
        credit_application_id: row.credit_application_id || null,
        status: 'historical_import',
        source: 'centerstone_drive_folder',
        created_at: row.signature_created_at || new Date().toISOString()
      }));
      
      // Insert in batches of 50
      for (let i = 0; i < mapped.length; i += 50) {
        const batch = mapped.slice(i, i + 50);
        const { error } = await supabase
          .from('verification_requests')
          .insert(batch);
        
        if (error) throw error;
        totalInserted += batch.length;
      }
      
      console.log(`✓ ${file}: ${mapped.length} rows`);
    } catch (e) {
      console.log(`✗ ${file}: ${e.message}`);
    }
  }
  
  console.log(`\n✓ Total inserted: ${totalInserted} rows`);
}

importHistorical();
