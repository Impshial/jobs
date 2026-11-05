'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {FileText,LoaderCircle,Sparkles,Upload} from 'lucide-react';
import {API_KEY,ResumeSchema,type Resume} from '../lib/resume';
import type {SavedResume} from '../lib/workspace';

const resumeLimitMB=process.env.NEXT_PUBLIC_LOCAL_APP==='1'?5:3;
const blank:Resume={name:'',email:'',website:'',summary:'',skills:[],roles:[],searchTerms:[],experienceLevel:'',notes:''};
const lines=(value:string)=>value.split(/[\n,]/).map(item=>item.trim()).filter(Boolean);

export default function ResumeEditor({initial,onSave,onCancel,onKey,sessionKey}:{initial:SavedResume|null;sessionKey:string;onSave:(label:string,profile:Resume,sourceName:string)=>void;onCancel:()=>void;onKey:(key:string)=>void}){
 const [label,setLabel]=useState(initial?.label??'');
 const [profile,setProfile]=useState<Resume>(initial?.profile??blank);
 const [skills,setSkills]=useState(initial?.profile.skills.join('\n')??'');
 const [terms,setTerms]=useState(initial?.profile.searchTerms.join('\n')??'');
 const [sourceName,setSourceName]=useState(initial?.sourceName??'');
 const [key,setKey]=useState(sessionKey);
 const [remember,setRemember]=useState(()=>{try{return Boolean(localStorage.getItem(API_KEY));}catch{return false;}});
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 function changeKey(value:string){setKey(value);onKey(value);try{if(remember&&value.trim())localStorage.setItem(API_KEY,value.trim());else localStorage.removeItem(API_KEY);}catch{setError('The key is available for this session, but browser storage could not be updated.');}}
 function toggleRemember(value:boolean){setRemember(value);try{if(value&&key.trim())localStorage.setItem(API_KEY,key.trim());else localStorage.removeItem(API_KEY);}catch{setError('The browser could not update saved key storage.');}}
 async function analyze(){
  if(!file||!key.trim()||request.current)return;
  const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  try{
   if(file.size>resumeLimitMB*1024*1024)throw Error(`Choose a résumé smaller than ${resumeLimitMB} MB.`);
   const fileData=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not read that file.'));reader.readAsDataURL(file);});
   if(controller.signal.aborted)return;
   const response=await fetch('/api/ai',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'resume',apiKey:key.trim(),filename:file.name,fileData})});
   if(response.status===413)throw Error(`Choose a résumé smaller than ${resumeLimitMB} MB.`);
   const data=await response.json();if(!response.ok)throw Error(data.error||'Analysis failed.');
   const extracted=ResumeSchema.parse(data.resume);setProfile(extracted);setSkills(extracted.skills.join('\n'));setTerms(extracted.searchTerms.join('\n'));setSourceName(file.name);if(!label)setLabel(file.name.replace(/\.[^.]+$/,''));
  }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Could not analyze your résumé.');}
  finally{request.current=null;setBusy(false);}
 }
 function submit(event:FormEvent){event.preventDefault();setError('');try{const reviewed=ResumeSchema.parse({...profile,skills:lines(skills),searchTerms:lines(terms)});if(!reviewed.skills.length&&!reviewed.searchTerms.length)throw Error('Add at least one skill or target job title.');onSave(label.trim(),reviewed,sourceName);}catch(reason){setError(reason instanceof Error&&reason.name!=='ZodError'?reason.message:'Keep skills to 30 entries and target titles to 15, each under 100 characters.');}}
 return <section className="panel resume-panel">
  <h2><FileText size={21}/>{initial?'Edit résumé':'Add résumé'}</h2>
  <p>Save a named profile for job-board searches. Enter your experience below, or upload a résumé to fill it in.</p>
  <details className="resume-upload"><summary><Upload size={16}/>Fill from a résumé file</summary>
   <div className="resume-grid"><div><label className="field">OpenAI API key<input type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={key} onChange={e=>changeKey(e.target.value)}/></label><label className="checkbox-row"><input type="checkbox" checked={remember} onChange={e=>toggleRemember(e.target.checked)}/>Remember this key on this device</label></div><label className="resume-drop"><Upload size={22}/><strong>{file?.name||'Choose a résumé'}</strong><span>PDF, DOCX, TXT, or Markdown · up to {resumeLimitMB} MB</span><input type="file" accept=".pdf,.docx,.txt,.md" onChange={e=>{setFile(e.target.files?.[0]??null);setError('');}} aria-label="Upload résumé" disabled={busy}/></label></div>
   <button className="button secondary" disabled={busy||!file||!key.trim()} onClick={()=>void analyze()}>{busy?<LoaderCircle size={16} className="spin"/>:<Sparkles size={16}/>} {busy?'Reading résumé…':'Analyze file'}</button>
   <p className="resume-note">Analysis sends the file to OpenAI using your API key; charges apply. Review and edit the extracted details before saving. The original file is not retained. Manual entry and job searches do not need an API key.</p>
  </details>
  <form onSubmit={submit}><fieldset disabled={busy} className="resume-editor-fields">
   <label className="field">Résumé name<input required maxLength={100} placeholder="e.g. Software engineering résumé" value={label} onChange={e=>setLabel(e.target.value)}/></label>
   <label className="field">Experience summary<textarea rows={4} maxLength={4000} value={profile.summary} onChange={e=>setProfile(p=>({...p,summary:e.target.value}))}/></label>
   <div className="resume-grid"><label className="field">Skills<textarea rows={8} value={skills} onChange={e=>setSkills(e.target.value)} placeholder={'C#\nSQL Server\n.NET'}/><small>One per line or separated by commas · up to 30</small></label><div><label className="field">Target job titles<textarea rows={5} value={terms} onChange={e=>setTerms(e.target.value)} placeholder={'Full-Stack Developer\nDatabase Administrator'}/><small>One per line or separated by commas · up to 15</small></label><label className="field">Experience level<input maxLength={100} value={profile.experienceLevel} onChange={e=>setProfile(p=>({...p,experienceLevel:e.target.value}))} placeholder="e.g. Senior"/></label></div></div>
   {error&&<p className="ai-error" role="alert">{error}</p>}
   <div className="resume-actions"><button type="submit" className="button primary" disabled={!label.trim()}>Save résumé</button><button type="button" className="button secondary" onClick={onCancel}>Cancel</button></div>
  </fieldset></form>
 </section>;
}
