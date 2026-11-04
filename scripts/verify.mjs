import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('.sites-runtime/checks',{recursive:true});
await build({entryPoints:['lib/jobs.ts','app/api/ai/route.ts'],outdir:'.sites-runtime/checks',outbase:'.',bundle:true,platform:'node',format:'esm',logLevel:'silent',outExtension:{'.js':'.mjs'}});
const {defaults,matches,safeUrl,salaryAnnualUSD,validateBackup,blankProfile}=await import('../.sites-runtime/checks/lib/jobs.mjs');
const {POST}=await import('../.sites-runtime/checks/app/api/ai/route.mjs');
const job={id:'job-1',title:'Software Engineer',company:'Example',location:'Worldwide',category:'Engineering',type:'Full-time',salary:'$80k - $100k',description:'Build React applications.',url:'https://example.com/careers',source:'Test',posted:'2026-11-01',remote:true,tags:['React']};
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name);}
check('Filters include worldwide roles for US preferences',()=>assert.equal(matches(job,{...defaults,roles:['Engineering'],styles:['Remote'],locations:['United States']}),true));
check('Different role and employment preferences exclude jobs',()=>{assert.equal(matches(job,{...defaults,roles:['Design']}),false);assert.equal(matches(job,{...defaults,types:['Part-time']}),false);});
check('Search terms match alternatives and locations',()=>{assert.equal(matches(job,{...defaults,keywords:'Figma, React'}),true);assert.equal(matches({...job,location:'Berlin'},{...defaults,keywords:'Berlin'}),true);assert.equal(matches(job,defaults,'engineer Example'),true);});
check('Salary filtering avoids incomparable rates',()=>{assert.equal(salaryAnnualUSD('$3.5k–$5k/month'),60000);assert.equal(salaryAnnualUSD('€80,000'),null);assert.equal(salaryAnnualUSD('$1000 per task'),null);assert.equal(matches({...job,salary:''},{...defaults,minimum:'90000',includeUnknown:false}),false);});
check('Links reject executable URLs',()=>{assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(safeUrl('data:text/html,test'),'');assert.equal(safeUrl(job.url),job.url);});
check('Backup validation rejects malformed jobs',()=>{assert.throws(()=>validateBackup({version:1,tracked:{bad:{job:{}}},preferences:defaults,profile:blankProfile}));const data={version:1,tracked:{[job.id]:{job,stage:'Saved',notes:'hello',followUp:'',savedAt:'2026-11-01'}},preferences:defaults,profile:blankProfile};assert.equal(validateBackup(data).tracked[job.id].notes,'hello');});
const key='sk-test-not-a-real-key';const resume={name:'Test Person',email:'',website:'',summary:'I build React applications.',skills:['React'],roles:['Engineering'],searchTerms:['React'],experienceLevel:'Mid-level',notes:''};
const request=(body,origin='https://nextmove.test')=>new Request('https://nextmove.test/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
const realFetch=globalThis.fetch;let calls=0;let sent;
globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.headers.Authorization,`Bearer ${key}`);sent=JSON.parse(init.body);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(resume)}]}]});};
try{
 let r=await POST(request({action:'resume',apiKey:key,filename:'resume.txt',fileData:'data:text/plain;base64,VGVzdCByZXN1bWUgdGV4dA=='}));assert.equal(r.status,200);assert.equal((await r.json()).resume.name,'Test Person');assert.equal(sent.store,false);assert.equal(sent.model,'gpt-5-mini');assert.equal(sent.text.format.strict,true);passed++;console.log('PASS Resume upload uses structured output and disables API response storage');
 r=await POST(request({action:'resume',apiKey:key,filename:'resume.exe',fileData:'data:text/plain;base64,VGVzdCByZXN1bWUgdGV4dA=='}));assert.equal(r.status,400);assert.equal(calls,1);passed++;console.log('PASS Unsupported files rejected before sending');
 r=await POST(request({action:'resume',apiKey:''}));assert.equal(r.status,400);assert.equal(calls,1);passed++;console.log('PASS Missing credentials rejected');
 r=await POST(request({action:'match',apiKey:key,resume,jobs:[job]},'https://other.test'));assert.equal(r.status,403);assert.equal(calls,1);passed++;console.log('PASS Cross-origin requests rejected');
 globalThis.fetch=async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({matches:[{id:job.id,score:85,reason:'React experience',gap:'Confirm seniority'},{id:'unknown',score:100,reason:'fake',gap:''},{id:job.id,score:80,reason:'duplicate',gap:''}]})}]}]});
 r=await POST(request({action:'match',apiKey:key,resume,jobs:[job]}));const ranked=await r.json();assert.equal(r.status,200);assert.equal(ranked.matches.length,1);assert.equal(ranked.matches[0].id,job.id);passed++;console.log('PASS AI matches limited to known unique job IDs');
 globalThis.fetch=async()=>Response.json({error:{message:`upstream must not echo ${key}`}},{status:401});r=await POST(request({action:'match',apiKey:key,resume,jobs:[job]}));assert.equal(r.status,401);assert.equal((await r.text()).includes(key),false);passed++;console.log('PASS Invalid-key errors never echo credentials');
 globalThis.fetch=async()=>Response.json({status:'incomplete',output:[]});r=await POST(request({action:'match',apiKey:key,resume,jobs:[job]}));assert.equal(r.status,502);passed++;console.log('PASS Incomplete AI responses return a failure');
}finally{globalThis.fetch=realFetch;}
console.log(`\n${passed} checks passed. Provider responses mocked; live paid requests require the user key.`);
