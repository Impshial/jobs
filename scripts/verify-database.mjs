import {build} from 'esbuild';
import {readFile,mkdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';

await mkdir('.local-runtime/checks',{recursive:true});
await build({stdin:{contents:"export * from './lib/workspace'; export * from './lib/workspace-sync'; export * from './lib/workspace-local'; export * from './app/api/workspace/route'; export * from './lib/workspace-import';",resolveDir:process.cwd(),loader:'ts'},outfile:'.local-runtime/checks/database.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {emptyWorkspace,parseWorkspace,WorkspaceConflict,WorkspaceSync,LocalWorkspaceDatabase,GET,PUT,applyJobImport}=await import('../.local-runtime/checks/database.mjs');
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
const base=emptyWorkspace();
const edited=name=>({...emptyWorkspace(),profile:{...base.profile,name}});
const fixtureJob={id:'import-1',title:'Data Entry',company:'Example',location:'US',category:'Operations',type:'Contract',salary:'',description:'Example description',url:'https://example.com/job',source:'Worksheet',posted:'2026-11-04',remote:true,tags:[],importedFrom:{sheet:'Data entry',row:6,checkedAt:'2026-11-04',priority:'Check location'}};
const seed={revision:'abc',sourceName:'private.xlsx',importedAt:'2026-11-04',jobs:[fixtureJob],tracked:{[fixtureJob.id]:{job:fixtureJob,stage:'Applied',notes:'Keep my note',followUp:'2026-11-10',savedAt:'2026-11-04'}}};

await check('Database payload drops API keys and unknown backup fields',()=>{
  const parsed=parseWorkspace({...base,apiKey:'do-not-sync',profile:{...base.profile,apiKey:'do-not-sync'},tracked:{}});
  assert.equal(JSON.stringify(parsed).includes('do-not-sync'),false);
  assert.throws(()=>parseWorkspace({...base,tracked:{wrong:{...seed.tracked[fixtureJob.id]}}}));
});
await check('SQLite survives reopening and preserves imported stages, notes and dates',async()=>{
  const filename=`.local-runtime/checks/${randomUUID()}.sqlite`;
  let db=new LocalWorkspaceDatabase(filename);
  try{
    assert.equal(db.read(),null);
    const document=parseWorkspace(applyJobImport(edited('Local profile'),seed));
    db.write(document,0);db.close();db=new LocalWorkspaceDatabase(filename);
    assert.deepEqual(db.read().document,document);
    assert.throws(()=>db.write(base,0),WorkspaceConflict);
    db.write({...document,tracked:{...document.tracked,[fixtureJob.id]:{...document.tracked[fixtureJob.id],stage:'Interviewed'}}},1);
    assert.throws(()=>db.write(base,1),WorkspaceConflict);
    assert.equal(db.read().document.tracked[fixtureJob.id].stage,'Interviewed');
  }finally{db.close();for(const suffix of ['', '-wal','-shm'])await unlink(filename+suffix).catch(()=>{});}
});
await check('Local API is unavailable on hosting and rejects foreign origins / hostnames',async()=>{
  const prior=process.env.NEXTMOVE_LOCAL;
  try{
    delete process.env.NEXTMOVE_LOCAL;
    assert.equal((await GET(new Request('http://127.0.0.1:5187/api/workspace'))).status,403);
    process.env.NEXTMOVE_LOCAL='1';
    assert.equal((await GET(new Request('http://attacker.test/api/workspace'))).status,403);
    assert.equal((await PUT(new Request('http://127.0.0.1:5187/api/workspace',{method:'PUT',headers:{Origin:'https://attacker.test'},body:'{}'}))).status,403);
    assert.equal((await PUT(new Request('http://127.0.0.1:5187/api/workspace',{method:'PUT',headers:{Origin:'http://127.0.0.1:5187'},body:'{}'}))).status,400);
  }finally{if(prior===undefined)delete process.env.NEXTMOVE_LOCAL;else process.env.NEXTMOVE_LOCAL=prior;}
});
function makeSync(store,initial={document:base,revision:1,updatedAt:''}){
  let draft=null;
  const sync=new WorkspaceSync({store,initial,changed:()=>{},persistDraft:(document,baseRevision)=>{draft={document,baseRevision};},clearDraft:()=>{draft=null;}});
  return {sync,draft:()=>draft};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
await check('Slow saves are serialized and keep edits made while a request is in flight',async()=>{
  const gate=deferred();let calls=0;const writes=[];
  const {sync,draft}=makeSync({read:async()=>null,write:async(document,rev)=>{calls++;writes.push({document,rev});if(calls===1)await gate.promise;return {document,revision:rev+1,updatedAt:''};}});
  sync.edit(edited('First'));const saving=sync.flush();sync.edit(edited('Second'));gate.resolve();await saving;
  assert.deepEqual(writes.map(x=>[x.document.profile.name,x.rev]),[['First',1],['Second',2]]);
  assert.equal(sync.snapshot().document.profile.name,'Second');assert.equal(sync.snapshot().status,'saved');assert.equal(draft(),null);
});
await check('Failed save keeps a recovery draft and retries against the same revision',async()=>{
  let fails=true;
  const {sync,draft}=makeSync({read:async()=>null,write:async(document,rev)=>{assert.equal(rev,1);if(fails)throw Error('Offline');return {document,revision:2,updatedAt:''};}});
  sync.edit(edited('Offline edit'));await sync.flush();assert.equal(sync.snapshot().status,'error');assert.equal(draft().document.profile.name,'Offline edit');
  fails=false;await sync.flush();assert.equal(sync.snapshot().status,'saved');assert.equal(draft(),null);
});
await check('Conflicts never overwrite the database or discard local changes',async()=>{
  let calls=0;
  const {sync,draft}=makeSync({read:async()=>null,write:async()=>{calls++;throw new WorkspaceConflict();}});
  sync.edit(edited('My edit'));await sync.flush();assert.equal(sync.snapshot().status,'conflict');await sync.flush();assert.equal(calls,1);assert.equal(draft().document.profile.name,'My edit');
});
await check('A background read cannot replace an edit made during the request',async()=>{
  const gate=deferred();const {sync}=makeSync({read:async()=>{await gate.promise;return {document:edited('Remote'),revision:2,updatedAt:''};},write:async()=>{throw Error();}});
  const reading=sync.refresh();sync.edit(edited('Local'));gate.resolve();await reading;assert.equal(sync.snapshot().document.profile.name,'Local');assert.equal(sync.snapshot().revision,1);
});
await check('Idle clients receive newer database versions',async()=>{
  const {sync}=makeSync({read:async()=>({document:edited('Other device'),revision:2,updatedAt:''}),write:async()=>{throw Error();}});
  await sync.refresh();assert.equal(sync.snapshot().document.profile.name,'Other device');assert.equal(sync.snapshot().revision,2);
});
await check('Out-of-order background responses never roll back a newer version',async()=>{
  const gate=deferred();let calls=0;
  const {sync}=makeSync({read:async()=>{const revision=++calls+1;if(revision===2)await gate.promise;return {document:edited(`Version ${revision}`),revision,updatedAt:''};},write:async()=>{throw Error();}});
  const older=sync.refresh();await sync.refresh();gate.resolve();await older;assert.equal(sync.snapshot().revision,3);
});
await check('Undoing an unsaved edit clears the obsolete recovery draft',async()=>{
  const {sync,draft}=makeSync({read:async()=>null,write:async()=>{throw Error('No write needed');}});
  sync.edit(edited('Temporary'));sync.edit(base);await sync.flush();assert.equal(sync.snapshot().status,'saved');assert.equal(draft(),null);
});
await check('Signing out stops a pending save from issuing later queued edits',async()=>{
  const gate=deferred();let calls=0;const {sync}=makeSync({read:async()=>null,write:async(document,revision)=>{calls++;await gate.promise;return {document,revision:revision+1,updatedAt:''};}});
  sync.edit(edited('First'));const saving=sync.flush();sync.edit(edited('Second'));sync.dispose();gate.resolve();await saving;assert.equal(calls,1);
});

const pg=new PGlite();
const alice='11111111-1111-4111-8111-111111111111';
const bob='22222222-2222-4222-8222-222222222222';
try{
  await pg.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${alice}'),('${bob}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  await pg.exec(await readFile('supabase/migrations/202611040001_workspaces.sql','utf8'));
  const asUser=async(role,id)=>{await pg.exec(`reset role; set role ${role};`);await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
  const save=async(document,revision)=>(await pg.query('select * from public.save_workspace($1::jsonb,$2::bigint)',[JSON.stringify(document),revision])).rows[0];
  await check('Postgres denies anonymous reads and writes',async()=>{
    await asUser('anon','');await assert.rejects(()=>pg.query('select * from public.workspaces'),e=>e.code==='42501');await assert.rejects(()=>save(base,0),e=>e.code==='42501');
  });
  await check('Authenticated calls without a verified user are rejected',async()=>{
    await asUser('authenticated','');await assert.rejects(()=>save(base,0),e=>e.code==='42501');
  });
  await check('Postgres stores the import atomically and rejects stale revisions',async()=>{
    await asUser('authenticated',alice);const imported=parseWorkspace(applyJobImport(edited('Alice'),seed));
    const saved=await save(imported,0);assert.equal(Number(saved.revision),1);assert.deepEqual(saved.document,imported);
    await assert.rejects(()=>save(base,0),e=>e.code==='40001');
    const updated=await save({...imported,profile:{...imported.profile,name:'Updated Alice'}},1);assert.equal(Number(updated.revision),2);
    await assert.rejects(()=>save(base,1),e=>e.code==='40001');
  });
  await check('RLS isolates accounts and direct writes cannot bypass revision checks',async()=>{
    await asUser('authenticated',bob);assert.equal((await pg.query('select * from public.workspaces')).rows.length,0);
    await save(edited('Bob'),0);const rows=(await pg.query('select * from public.workspaces')).rows;assert.equal(rows.length,1);assert.equal(rows[0].user_id,bob);
    await assert.rejects(()=>pg.query('update public.workspaces set revision=99'),e=>e.code==='42501');
    await assert.rejects(()=>pg.query('delete from public.workspaces'),e=>e.code==='42501');
    await asUser('authenticated',alice);const own=(await pg.query('select * from public.workspaces')).rows;assert.equal(own.length,1);assert.equal(own[0].document.profile.name,'Updated Alice');
  });
  await check('Postgres rejects malformed documents and credential fields',async()=>{
    await assert.rejects(()=>save({...base,apiKey:'not-allowed'},2),e=>e.code==='22023');
    await assert.rejects(()=>save({version:1},2),e=>e.code==='22023');
    await assert.rejects(()=>save(base,-1),e=>e.code==='22023');
  });
}finally{await pg.close();}
console.log(`\n${passed} database checks passed with SQLite and local PostgreSQL. No cloud credentials or paid requests used.`);
