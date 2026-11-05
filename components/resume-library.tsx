'use client';
import {useState} from 'react';
import {Check,FileText,Plus,Trash2} from 'lucide-react';
import ResumeEditor from './resume-editor';
import {useWorkspace} from './workspace-provider';
import {parseWorkspace} from '../lib/workspace';
import type {Resume} from '../lib/resume';

export default function ResumeLibrary({apiKey,onKey}:{apiKey:string;onKey:(key:string)=>void}){
 const workspace=useWorkspace();
 const {resumes,selectedResumeId}=workspace.document;
 const [editing,setEditing]=useState<string|null>(null);
 const [removing,setRemoving]=useState('');
 const [error,setError]=useState('');
 const initial=resumes.find(row=>row.id===editing)??null;
 function save(label:string,profile:Resume,sourceName:string){
  const now=new Date().toISOString();const id=initial?.id??crypto.randomUUID();
  workspace.edit(previous=>parseWorkspace({...previous,resume:null,resumes:[{id,label,profile,sourceName,createdAt:initial?.createdAt??now,updatedAt:now},...previous.resumes.filter(row=>row.id!==id)],selectedResumeId:id}));setEditing(null);
 }
 function remove(id:string){workspace.edit(previous=>parseWorkspace({...previous,resume:null,resumes:previous.resumes.filter(row=>row.id!==id)}));setRemoving('');}
 return <section className="resume-library">
  <div className="page-heading split"><div><div className="eyebrow">YOUR EXPERIENCE</div><h1>My Resumes</h1><p>Keep a résumé for each kind of role. Choose one beside Search to find new opportunities.</p></div>{editing===null&&<button className="button primary" onClick={()=>{if(resumes.length>=20){setError('You can save up to 20 résumés. Remove one before adding another.');return;}setError('');setEditing('new');}}><Plus size={16}/>Add résumé</button>}</div>
  {error&&<div className="ai-error" role="alert">{error}</div>}
  {editing!==null?<ResumeEditor key={editing} initial={initial} sessionKey={apiKey} onKey={onKey} onSave={save} onCancel={()=>setEditing(null)}/>:<>
   {resumes.length?<div className="resume-library-grid">{resumes.map(row=><article key={row.id} className={`panel resume-library-card ${row.id===selectedResumeId?'selected':''}`}>
    <div className="resume-card-title"><FileText size={23}/><h2>{row.label}</h2>{row.id===selectedResumeId&&<span className="selected-resume"><Check size={12}/>Selected</span>}</div>
    <p>{row.profile.summary||'Ready to use for job searches.'}</p><div className="tags">{row.profile.skills.slice(0,8).map(skill=><span key={skill}>{skill}</span>)}</div>
    <small>{row.profile.searchTerms.join(' · ')}</small>
    <div className="resume-actions"><button className="button secondary small" onClick={()=>workspace.edit(previous=>({...previous,selectedResumeId:row.id}))} disabled={row.id===selectedResumeId}>{row.id===selectedResumeId?'Selected for search':'Use for search'}</button><button className="text-button" onClick={()=>setEditing(row.id)}>Edit</button><button className="icon-button" aria-label={`Remove résumé: ${row.label}`} onClick={()=>setRemoving(row.id)}><Trash2 size={16}/></button></div>
    {removing===row.id&&<div className="search-remove" role="alert"><p>Remove “{row.label}”? Saved searches and jobs will stay.</p><button className="button secondary small" onClick={()=>setRemoving('')}>Keep résumé</button><button className="button primary small" onClick={()=>remove(row.id)}>Remove résumé</button></div>}
   </article>)}</div>:<div className="empty-state"><FileText size={35}/><h3>Your résumé library starts here</h3><p>Add your experience and skills, or upload a résumé to create your first profile.</p><button className="button primary" onClick={()=>setEditing('new')}>Add résumé</button></div>}
   <p className="source-note">Résumés are used only for job-board searches. Your saved jobs, statuses, and application profile stay independent. Saved profiles sync to your account; original files are not retained.</p>
  </>}
 </section>;
}
