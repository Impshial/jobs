'use client';

import {createContext,useContext,useEffect,useMemo,useState,type Dispatch,type ReactNode,type SetStateAction} from 'react';
import type {User} from '@supabase/supabase-js';
import {cloudConfigured,cloudPartlyConfigured,cloudStore,getSupabase} from '../lib/supabase';
import {emptyWorkspace,hasWorkspaceData,LEGACY_WORKSPACE_KEY,parseDraft,parseWorkspace,WorkspaceConflict,type Draft,type Snapshot,type Workspace,type WorkspaceStore} from '../lib/workspace';
import {WorkspaceSync,type SyncState} from '../lib/workspace-sync';
import {RESUME_KEY} from '../lib/resume';
import {applyJobImport,validateJobImport} from '../lib/workspace-import';

const isLocal=process.env.NEXT_PUBLIC_LOCAL_APP==='1';
type Context={document:Workspace;edit:(update:(previous:Workspace)=>Workspace)=>void;status:string;storageLabel:string;cloud:boolean};
const WorkspaceContext=createContext<Context|null>(null);
export function useWorkspace(){const value=useContext(WorkspaceContext);if(!value)throw Error('Workspace is not loaded.');return value;}
export function useWorkspaceField<K extends keyof Workspace>(field:K):[Workspace[K],Dispatch<SetStateAction<Workspace[K]>>]{
  const context=useWorkspace();
  return [context.document[field],value=>context.edit(previous=>({...previous,[field]:typeof value==='function'?(value as (previous:Workspace[K])=>Workspace[K])(previous[field]):value}))];
}
function download(workspace:Workspace,name='nextmove-backup.json'){
  const url=URL.createObjectURL(new Blob([JSON.stringify(workspace,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function legacyWorkspace(){
  const raw=localStorage.getItem(LEGACY_WORKSPACE_KEY);
  const resume=localStorage.getItem(RESUME_KEY);
  if(!raw&&!resume)return null;
  const document=parseWorkspace({...(raw?JSON.parse(raw):emptyWorkspace()),resume:resume?JSON.parse(resume):null});
  return hasWorkspaceData(document)?document:null;
}
const localStore:WorkspaceStore={
  async read(){
    const response=await fetch('/api/workspace',{cache:'no-store'});
    if(!response.ok)throw Error('Could not open the local database.');
    const {snapshot}=await response.json();
    return snapshot?{...snapshot,document:parseWorkspace(snapshot.document)}:null;
  },
  async write(document,expectedRevision){
    const response=await fetch('/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({document:parseWorkspace(document),expectedRevision})});
    if(response.status===409)throw new WorkspaceConflict();
    if(!response.ok)throw Error('Could not save the local database.');
    return (await response.json()).snapshot;
  },
};
function Gate({children}:{children:ReactNode}){return <main className="workspace-gate"><section className="panel">{children}</section></main>;}

export default function WorkspaceProvider({children}:{children:ReactNode}){
  if(cloudConfigured)return <CloudAccount>{children}</CloudAccount>;
  if(isLocal&&!cloudPartlyConfigured)return <DatabaseSession store={localStore} scope="local" cloud={false}>{children}</DatabaseSession>;
  return <Setup/>;
}
function Setup(){
  const [message,setMessage]=useState('');
  return <Gate><h1>Connect the database</h1><p>Supabase has not been configured for this deployment. Existing browser data is still on this device.</p><p>Add the project URL and publishable key in Vercel, run the database migration, then redeploy. Setup instructions are in the repository README.</p><button className="button secondary" onClick={()=>{try{const existing=legacyWorkspace();if(existing)download(existing);else setMessage('No browser data was found.');}catch{setMessage('Browser data could not be read. Do not clear this browser’s storage.');}}}>Export existing browser data</button>{message&&<p role="status">{message}</p>}</Gate>;
}
function CloudAccount({children}:{children:ReactNode}){
  const supabase=useMemo(()=>getSupabase(),[]);
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);
  const [recovery,setRecovery]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      setUser(session?.user??null);setLoading(false);
      if(event==='PASSWORD_RECOVERY')setRecovery(true);
      if(event==='SIGNED_OUT'){setRecovery(false);setPassword('');}
    });
    return()=>subscription.unsubscribe();
  },[supabase]);
  const userId=user?.id;
  const store=useMemo(()=>userId?cloudStore(supabase,userId):null,[supabase,userId]);
  if(loading)return <Gate><h1>Nextmove</h1><p>Checking sign-in…</p></Gate>;
  if(user&&store&&!recovery)return <DatabaseSession key={user.id} store={store} scope={user.id} cloud email={user.email} signOut={async()=>{const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;}}>{children}</DatabaseSession>;
  return <Gate><h1>{recovery?'Set a new password':'Sign in'}</h1><form onSubmit={async event=>{
    event.preventDefault();setBusy(true);setMessage('');
    try{
      if(recovery){const {error}=await supabase.auth.updateUser({password});if(error)throw error;setRecovery(false);setPassword('');}
      else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;setPassword('');}
    }catch{setMessage(recovery?'Could not change the password. Use at least 12 characters.':'Could not sign in. Check your email and password.');}finally{setBusy(false);}
  }}>{!recovery&&<label className="field">Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label>}<label className="field">Password<input type="password" autoComplete={recovery?'new-password':'current-password'} minLength={recovery?12:undefined} value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="button primary" disabled={busy}>{busy?'Please wait…':recovery?'Save password':'Sign in'}</button></form>{!recovery&&<button className="text-button" disabled={busy||!email} onClick={async()=>{setBusy(true);try{const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});if(error)throw error;setMessage('If this account exists, a password reset link has been sent.');}catch{setMessage('Could not request a reset. Try again later.');}finally{setBusy(false);}}}>Reset password</button>}{message&&<p role="status">{message}</p>}</Gate>;
}

type SessionProps={store:WorkspaceStore;scope:string;cloud:boolean;email?:string;signOut?:()=>Promise<void>;children:ReactNode};
type Loaded={snapshot:Snapshot;migration:Workspace|null;draft:Draft|null;warning:string};
function DatabaseSession(props:SessionProps){
  const {store,scope,cloud}=props;
  const [loaded,setLoaded]=useState<Loaded|null>(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const draftKey=`nextmove.draft.v1.${scope}`;
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      try{
        let snapshot=await store.read();
        let migration:Workspace|null=null,draft:Draft|null=null,warning='';
        try{
          const raw=localStorage.getItem(draftKey);
          if(raw)draft=parseDraft(JSON.parse(raw));
          if(!localStorage.getItem(`nextmove.migrated.v1.${scope}`))migration=legacyWorkspace();
        }catch{warning='Browser recovery data could not be read. It has been retained; do not clear browser storage.';}
        // The disk import is a first-run seed only. It can never reset later database edits.
        if(!cloud&&!snapshot&&!migration){
          const response=await fetch('/api/imported-jobs',{cache:'no-store'});
          if(response.status!==204){
            if(!response.ok)throw Error('Could not read the existing local import.');
            migration=parseWorkspace(applyJobImport(emptyWorkspace(),validateJobImport(await response.json())));
          }
        }
        if(!snapshot){snapshot=await store.write(emptyWorkspace(),0);}
        if(!cancelled){setError('');setLoaded({snapshot,migration,draft,warning});}
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Could not load the workspace.');}
    }
    void load();return()=>{cancelled=true;};
  },[store,scope,cloud,draftKey,attempt]);
  if(!loaded)return <Gate><h1>Nextmove</h1>{error?<><p role="alert">{error}</p><button className="button secondary" onClick={()=>setAttempt(n=>n+1)}>Retry connection</button></>:<p>Loading database…</p>}{props.signOut&&<button className="text-button" onClick={()=>void props.signOut?.().catch(()=>setError('Could not sign out. Try again.'))}>Sign out</button>}</Gate>;
  return <LoadedWorkspace {...props} initial={loaded} draftKey={draftKey}/>;
}

function LoadedWorkspace({initial,draftKey,store,scope,cloud,email,signOut,children}:SessionProps&{initial:Loaded;draftKey:string}){
  const [migration,setMigration]=useState(initial.migration);
  const [draft,setDraft]=useState(initial.draft);
  const [warning,setWarning]=useState(initial.warning);
  const [busy,setBusy]=useState(false);
  const [state,setState]=useState<SyncState>({document:initial.snapshot.document,revision:initial.snapshot.revision,status:'saved',message:''});
  const [engine]=useState(()=>new WorkspaceSync({store,initial:initial.snapshot,changed:setState,persistDraft:(document,baseRevision)=>localStorage.setItem(draftKey,JSON.stringify({document,baseRevision})),clearDraft:()=>localStorage.removeItem(draftKey)}));
  useEffect(()=>{
    engine.activate();
    const refresh=()=>void engine.refresh();
    const retry=()=>{if(engine.snapshot().status==='error'||engine.snapshot().status==='pending')void engine.flush();else refresh();};
    const unload=(event:BeforeUnloadEvent)=>{if(engine.snapshot().status!=='saved'){event.preventDefault();event.returnValue='';}};
    const interval=setInterval(refresh,15000);
    window.addEventListener('focus',refresh);window.addEventListener('online',retry);window.addEventListener('beforeunload',unload);
    return()=>{engine.dispose();clearInterval(interval);window.removeEventListener('focus',refresh);window.removeEventListener('online',retry);window.removeEventListener('beforeunload',unload);};
  },[engine]);
  useEffect(()=>{if(state.status!=='pending'||draft)return;const timer=setTimeout(()=>void engine.flush(),400);return()=>clearTimeout(timer);},[state,engine,draft]);
  const saved=state.status==='saved';
  const status=saved?(cloud?'Saved to cloud database':'Saved to local database'):state.status==='saving'?'Saving…':state.status==='conflict'?'Changes need review':state.status==='error'?'Not saved — retry':'Unsaved changes';
  const dismissMigration=()=>{try{localStorage.setItem(`nextmove.migrated.v1.${scope}`,'1');}catch{}setMigration(null);};
  async function reloadDatabase(){
    setBusy(true);try{
      const latest=await store.read();if(!latest)throw Error();
      // Re-enter via a full load only after explicit resolution. No pending edits are overwritten silently.
      localStorage.setItem(`${draftKey}.before-reload`,JSON.stringify({document:state.document,baseRevision:state.revision}));
      localStorage.removeItem(draftKey);window.location.reload();
    }catch{setWarning('Could not reload the database. Your current changes are still here.');setBusy(false);}
  }
  return <WorkspaceContext.Provider value={{document:state.document,edit:update=>engine.edit(update(engine.snapshot().document)),status,storageLabel:cloud?'your cloud database':'the local database',cloud}}>
    <div className="database-bar" aria-label="Database status"><span role="status">{status}</span>{email&&<small>{email}</small>}<button onClick={()=>download(state.document)}>Export backup</button>{signOut&&<button disabled={!saved||busy||Boolean(draft)} onClick={async()=>{setBusy(true);try{await signOut();}catch{setWarning('Could not sign out. Try again.');setBusy(false);}}}>Sign out</button>}</div>
    {(warning||state.message)&&<div className="database-notice" role="alert">{warning||state.message}</div>}
    {state.status==='error'&&<div className="database-notice"><button className="button secondary small" onClick={()=>void engine.flush()}>Retry save</button></div>}
    {state.status==='conflict'&&<div className="database-notice" role="alert"><p>Another device saved changes first. Export your unsaved edits before loading the database copy.</p><button className="button secondary small" onClick={()=>download(state.document,'nextmove-unsaved-changes.json')}>Export unsaved changes</button><button className="button secondary small" disabled={busy} onClick={()=>void reloadDatabase()}>Load database copy</button></div>}
    {draft?<div className="database-notice recovery-notice"><h2>Unsaved changes on this device</h2><p>{draft.baseRevision===state.revision?'Restore these changes and save them to the database.':'The database has changed since this draft. Export the draft before choosing which copy to use.'}</p><button className="button secondary small" onClick={()=>download(draft.document,'nextmove-recovered-draft.json')}>Export draft</button>{draft.baseRevision===state.revision&&<button className="button primary small" onClick={()=>{engine.edit(draft.document);setDraft(null);}}>Restore draft</button>}<button className="button secondary small" onClick={()=>{try{localStorage.setItem(`${draftKey}.before-reload`,JSON.stringify(draft));localStorage.removeItem(draftKey);setDraft(null);}catch{setWarning('Could not retain the draft. Export it first.');}}}>Use database copy</button></div>:<>
    {migration&&<div className="database-notice migration-notice"><h2>Move existing data to the database</h2><p>This device has {Object.keys(migration.tracked).length} tracked jobs. {hasWorkspaceData(state.document)?'Importing replaces the current database workspace, including profile and filters.':'Your jobs, statuses, notes, filters, and résumé profile will be saved to the database.'}</p><button className="button primary small" disabled={!saved} onClick={async()=>{engine.edit(migration);await engine.flush();if(engine.snapshot().status==='saved')dismissMigration();}}>Import existing data</button><button className="button secondary small" onClick={()=>download(migration,'nextmove-before-database.json')}>Export existing data</button><button className="text-button" onClick={dismissMigration}>Keep database data</button></div>}
    {!migration&&children}</>}
  </WorkspaceContext.Provider>;
}
