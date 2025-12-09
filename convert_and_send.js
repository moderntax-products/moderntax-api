#!/usr/bin/env node
const https=require('https');
const U='https://nixzwnfjglojemozlvmf.supabase.co/storage/v1/object/public/irs-transcripts';
const R='req_1759763036842_xx5b2ck9m';
const E='https://moderntax-api-live.vercel.app/api/status/req_1759763036842_xx5b2ck9m';
const F=['108934923338-1.html','108934923338-2.html','108934923338-3.html'];

function get(f){
  return new Promise((ok,no)=>{
    https.get(`${U}/${R}/${f}`,(r)=>{
      let d='';
      r.on('data',c=>d+=c);
      r.on('end',()=>r.statusCode===200?ok(d):no(Error(`HTTP ${r.statusCode}`)))
    }).on('error',no)
  })
}

function parse(h,f){
  const j={source_file:f,forms:[],metadata:{},raw_data:{}};
  const t=h.match(/Tracking Number[:\s]+(\d+)/i);
  if(t)j.metadata.tracking_number=t[1];
  const s=h.match(/(?:SSN|Social Security)[:\s]+([\dX\-]+)/i);
  if(s)j.metadata.ssn=s[1];
  const p=h.match(/Tax Period[:\s]+(\w+,?\s*\d{4})/i);
  if(p)j.metadata.tax_period=p[1];
  if(h.includes('W-2'))j.forms.push({type:'W-2',description:'Wage and Tax Statement'});
  if(h.includes('1099'))j.forms.push({type:'1099',description:'Miscellaneous Income'});
  if(h.includes('1098'))j.forms.push({type:'1098',description:'Mortgage Interest'});
  if(h.includes('5498'))j.forms.push({type:'5498',description:'IRA Contribution'});
  return j;
}

async function send(d){
  const u=new URL(E);
  const p=JSON.stringify({
    request_id:R,
    status:'completed',
    transcripts:d,
    transcript_urls:{
      file_1:`${U}/${R}/${F[0]}`,
      file_2:`${U}/${R}/${F[1]}`,
      file_3:`${U}/${R}/${F[2]}`
    },
    processed_at:new Date().toISOString()
  });
  
  return new Promise((ok,no)=>{
    const q=https.request({
      hostname:u.hostname,
      path:u.pathname,
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-API-Key':'mt_prod_conductiv_2025_3c651d11d29e',
        'Content-Length':Buffer.byteLength(p)
      }
    },(r)=>{
      let d='';
      r.on('data',c=>d+=c);
      r.on('end',()=>ok({statusCode:r.statusCode,body:d}))
    });
    q.on('error',no);
    q.write(p);
    q.end()
  })
}

(async()=>{
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   Convert HTML Transcripts to JSON & Send to Conductiv          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📥 Fetching HTML files from Supabase...\n');
  const t=[];
  
  for(const f of F){
    try{
      console.log(`   Downloading: ${f}`);
      const h=await get(f);
      const j=parse(h,f);
      console.log(`   ✅ Parsed - Forms: ${j.forms.map(x=>x.type).join(', ')}`);
      console.log(`      Tracking: ${j.metadata.tracking_number || 'N/A'}\n`);
      t.push(j)
    }catch(e){
      console.log(`   ❌ Failed: ${e.message}\n`)
    }
  }
  
  if(t.length===0){
    console.log('❌ No transcripts processed. Exiting.\n');
    return;
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📤 Sending ${t.length} transcript(s) to Conductiv API...\n`);
  console.log(`   Endpoint: ${E}\n`);
  
  try{
    const r=await send(t);
    console.log(`   Status: ${r.statusCode}`);
    
    if(r.statusCode>=200&&r.statusCode<300){
      console.log('   ✅ Success!\n');
    }else{
      console.log('   ⚠️  Unexpected status\n');
    }
    
    console.log('Response:');
    console.log(r.body);
    
  }catch(e){
    console.log(`   ❌ Failed: ${e.message}\n`);
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Processed JSON Data:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(JSON.stringify(t,null,2));
  console.log('\n✅ Done!\n');
  
})().catch(console.error);
