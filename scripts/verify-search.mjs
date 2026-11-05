import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

await mkdir('.local-runtime/checks',{recursive:true});
await build({stdin:{contents:"export * from './lib/job-search'; export * from './lib/workspace'; export * from './lib/workspace-import'; export * from './lib/jobs';",resolveDir:process.cwd(),loader:'ts'},outfile:'.local-runtime/checks/search.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {searchJobFeed,saveSearch,emptyWorkspace,parseWorkspace,applyJobImport,defaults}=await import('../.local-runtime/checks/search.mjs');
const resume={name:'',email:'',website:'',summary:'',skills:['C#','SQL Server administration (2000-2025)','HTML/CSS/JavaScript/jQuery','ASP.NET','OutSystems full-stack development'],roles:['Engineering'],searchTerms:['Full-Stack Developer','SQL Server DBA'],experienceLevel:'Senior',notes:''};
const job=(id,title,description,extra={})=>({id,title,company:'Example '+id,location:'United States',category:'Engineering',type:'Full-time',salary:'',description,url:`https://example.com/${id}`,source:'Test board',posted:'2026-11-05T00:00:00.000Z',remote:true,tags:[],...extra});
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}

check('Compound résumé skills find .NET, SQL Server and full-stack listings',()=>{
  const jobs=[job('dotnet','C# / ASP.NET developer','Build APIs'),job('sql','Database administrator','Administer SQL Server'),job('fullstack','Full-stack engineer','JavaScript and CSS'),job('none','Accountant','Payroll and invoices')];
  const result=searchJobFeed(jobs,resume,'',defaults);
  assert.deepEqual(new Set(result.results.map(row=>row.job.id)),new Set(['dotnet','sql','fullstack']));
  assert.ok(result.results.find(row=>row.job.id==='dotnet').matchedTerms.includes('C#'));
  assert.ok(result.results.find(row=>row.job.id==='dotnet').matchedTerms.includes('.NET'));
  assert.ok(result.results.find(row=>row.job.id==='sql').matchedTerms.includes('SQL Server'));
});
check('Short technology names do not match substrings in unrelated words',()=>{
  const profile={...resume,skills:['Go','C#'],searchTerms:[],roles:[]};
  const results=searchJobFeed([job('bad','Good communicator','A cargo company'),job('good','Go engineer','Build systems')],profile,'',defaults).results;
  assert.deepEqual(results.map(row=>row.job.id),['good']);
});
check('Explicit search alternatives narrow results and respect location/work filters',()=>{
  const jobs=[job('us','C# developer','Use .NET'),job('de','C# developer','Use .NET',{location:'Germany',remote:false}),job('sql','SQL Server DBA','Maintain databases')];
  const result=searchJobFeed(jobs,resume,'C#, SQL Server',{...defaults,styles:['Remote'],locations:['United States'],keywords:'old unrelated keyword'});
  assert.deepEqual(new Set(result.results.map(row=>row.job.id)),new Set(['us','sql']));
  assert.equal(searchJobFeed(jobs,resume,'C# nonexistent',defaults).total,0);
});
check('Results deduplicate boards, rank title matches first, and cap stored payloads',()=>{
  const jobs=Array.from({length:45},(_,i)=>job(String(i),'Engineer','C# '+'.'.repeat(10000)));
  const title=job('title','C# developer','APIs');
  const result=searchJobFeed([...jobs,title,{...title,id:'other-board',source:'Other'}],resume,'',defaults);
  assert.equal(result.total,46);assert.equal(result.results.length,40);assert.equal(result.results[0].job.id,'title');
  assert.ok(result.results.every(row=>row.job.description.length<=6000));
});
const fixture=job('tracked','C# developer','Build ASP.NET applications');
const search={id:'search-1',query:'C#',createdAt:'2026-11-05T12:00:00.000Z',fetchedAt:'2026-11-05T11:00:00.000Z',sources:['Test board'],warnings:[],preferences:defaults,...searchJobFeed([fixture],resume,'C#',defaults)};
check('Searches survive backup roundtrips without changing Applied statuses',()=>{
  const base={...emptyWorkspace(),tracked:{[fixture.id]:{job:fixture,stage:'Applied',savedAt:'2026-11-01',appliedAt:'2026-11-02',notes:'Already submitted',followUp:'2026-11-10'}}};
  const next=parseWorkspace({...base,searches:saveSearch(base.searches,search)});
  const restored=parseWorkspace(JSON.parse(JSON.stringify(next)));
  assert.deepEqual(restored.searches,[search]);assert.deepEqual(restored.tracked,base.tracked);
  const {searches,...legacy}=base;assert.deepEqual(parseWorkspace(legacy).searches,[]);
  assert.deepEqual(applyJobImport(next,{revision:'new',sourceName:'catalogue',importedAt:'2026-11-05',jobs:[fixture],tracked:base.tracked},true).searches,[search]);
});
check('Each search adds a new record without overwriting history or silently discarding entries',()=>{
  const history=Array.from({length:20},(_,i)=>({...search,id:String(i)}));
  assert.throws(()=>saveSearch(history,search),/20 saved searches/);
  assert.throws(()=>saveSearch(history,{...search,id:'10',query:'SQL Server'}),/already recorded/);
  const next=saveSearch(history.slice(0,19),search);
  assert.equal(next.length,20);assert.deepEqual(next[0],search);assert.deepEqual(next.slice(1),history.slice(0,19));
});
check('Malformed saved-search backups are rejected',()=>{
  assert.throws(()=>parseWorkspace({...emptyWorkspace(),searches:[{...search,results:[{...search.results[0],job:{...fixture,url:'javascript:alert(1)'}}]}]}));
  assert.throws(()=>parseWorkspace({...emptyWorkspace(),searches:[search,search]}));
});

check('Legacy résumé migrates once, preserving every profile field and job status',()=>{
 const legacy={...emptyWorkspace(),resume};delete legacy.resumes;delete legacy.selectedResumeId;
 const migrated=parseWorkspace(legacy);assert.equal(migrated.resumes.length,1);assert.equal(migrated.selectedResumeId,'legacy-resume');assert.deepEqual(migrated.resumes[0].profile,resume);
 assert.deepEqual(parseWorkspace(migrated),migrated);
 assert.deepEqual(parseWorkspace({...migrated,resumes:[]}).resumes,[]);
});
check('Multiple résumé selections survive backups and do not change stored-job settings',()=>{
 const base=emptyWorkspace();const make=(id,profile)=>({id,label:id,profile,createdAt:'2026-11-05T12:00:00.000Z',updatedAt:'2026-11-05T12:00:00.000Z'});
 const other={...resume,skills:['Accounting'],searchTerms:['Accountant']};
 const library=parseWorkspace({...base,resumes:[make('Engineering',resume),make('Finance',other)],selectedResumeId:'Finance'});
 const restored=parseWorkspace(JSON.parse(JSON.stringify(library)));assert.deepEqual(restored,library);assert.deepEqual(library.preferences,base.preferences);assert.deepEqual(library.profile,base.profile);
 const choices=[job('csharp','C# developer','Build APIs'),job('finance','Accountant','Accounting')];
 assert.deepEqual(searchJobFeed(choices,restored.resumes.find(row=>row.id===restored.selectedResumeId).profile,'',defaults).results.map(row=>row.job.id),['finance']);
 const removed=parseWorkspace({...library,resumes:library.resumes.filter(row=>row.id!=='Finance')});assert.equal(removed.selectedResumeId,'Engineering');
 assert.throws(()=>parseWorkspace({...library,resumes:[library.resumes[0],library.resumes[0]]}));
});
console.log(`\n${passed} search checks passed.`);
