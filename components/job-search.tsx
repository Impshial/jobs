'use client';

import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {ArrowLeft,ArrowUpRight,RefreshCw,Search,Sparkles,Trash2} from 'lucide-react';
import {validJob,type Job} from '../lib/jobs';
import {MAX_SEARCHES,saveSearch,searchJobFeed,type SavedSearch} from '../lib/job-search';
import {parseWorkspace,type SavedResume} from '../lib/workspace';
import {useWorkspace} from './workspace-provider';

export function useJobSearch(onResults:(id:string)=>void,onResume:()=>void) {
  const workspace=useWorkspace();
  const [query,setQuery]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);

  async function run() {
    if(request.current)return;
    const {resumes,selectedResumeId,preferences,searches}=workspace.document;
    const selected=resumes.find(row=>row.id===selectedResumeId);
    const resume=selected?.profile;
    if(!resume){setError('Add a résumé in My Resumes, then select it to search.');onResume();return;}
    if(searches.length>=MAX_SEARCHES){setError(`You have ${MAX_SEARCHES} saved searches. Remove one from My Searches first.`);return;}
    const controller=new AbortController();request.current=controller;
    const timer=setTimeout(()=>controller.abort(new Error('Job boards took too long to respond. Please try again.')),30000);
    const startedAt=new Date().toISOString();
    setBusy(true);setError('');
    try {
      // Search live board listings even when Discover is showing an imported catalogue.
      // Résumé information stays in this browser; the boards receive no résumé or contact data.
      const response=await fetch('/api/jobs',{signal:controller.signal,cache:'no-store'});
      const feed=await response.json();
      if(!response.ok)throw Error(feed.error||'Could not search the job boards.');
      if(!Array.isArray(feed.jobs)||!feed.jobs.every(validJob)||!Number.isFinite(Date.parse(feed.fetchedAt)))throw Error('The job boards returned an invalid response. Please try again.');
      if(controller.signal.aborted)return;
      const matched=searchJobFeed(feed.jobs,resume,query.trim(),preferences);
      if(!matched.terms.length)throw Error('Add skills or target roles to your reviewed résumé before searching.');
      const search:SavedSearch={id:crypto.randomUUID(),query:query.trim(),createdAt:startedAt,fetchedAt:feed.fetchedAt,resumeId:selected!.id,resumeName:selected!.label,preferences:{...preferences,keywords:''},sources:[...new Set<string>(feed.jobs.map((job:Job)=>job.source))],warnings:Array.isArray(feed.warnings)?feed.warnings.filter((warning:unknown)=>typeof warning==='string'):[],...matched};
      workspace.edit(previous=>parseWorkspace({...previous,searches:saveSearch(previous.searches,search)}));
      onResults(search.id);
    } catch(reason) {
      // Unmount/account changes cancel requests without writing results into another account.
      if(!controller.signal.aborted||controller.signal.reason instanceof Error&&controller.signal.reason.name!=='AbortError')setError(reason instanceof Error?reason.message:'Could not search the job boards.');
    } finally {clearTimeout(timer);if(request.current===controller){request.current=null;setBusy(false);}}
  }
  return {query,setQuery,busy,error,run};
}

export function JobSearchBar({query,onQuery,onSearch,busy,resumes,selectedResumeId,onResumeSelect}:{query:string;onQuery:(value:string)=>void;onSearch:()=>void;busy:boolean;resumes:SavedResume[];selectedResumeId:string;onResumeSelect:(id:string)=>void}) {
  function submit(event:FormEvent){event.preventDefault();onSearch();}
  return <form className="board-search" role="search" aria-label="Search job boards with your résumé" onSubmit={submit}>
    <Search size={18} aria-hidden="true"/>
    <select className="search-resume-select" aria-label="Résumé for job search" value={selectedResumeId} onChange={event=>onResumeSelect(event.target.value)} disabled={busy||!resumes.length}>{!resumes.length&&<option value="">Add a résumé</option>}{resumes.map(resume=><option key={resume.id} value={resume.id}>{resume.label}</option>)}</select>
    <input aria-label="Search job boards" placeholder="Search jobs for your résumé…" value={query} maxLength={200} onChange={event=>onQuery(event.target.value)} disabled={busy}/>
    <button className="button primary small" type="submit" disabled={busy}>{busy?<RefreshCw size={15} className="spin"/>:<Sparkles size={15}/>}<span>{busy?'Searching…':'Job Search'}</span></button>
  </form>;
}

function title(search:SavedSearch){return search.query||'Résumé matches';}
function when(value:string){return new Date(value).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}

export function SearchHistoryNav({searches,activeId,active,onSelect}:{searches:SavedSearch[];activeId:string;active:boolean;onSelect:(id:string)=>void}) {
  return <section className="search-history-nav" aria-label="My Searches">
    <button className={`nav-item ${active?'active':''}`} aria-label="My Searches" onClick={()=>onSelect('')} aria-current={active&&!activeId?'page':undefined}><Search size={19}/><span>My Searches</span><b>{searches.length}</b></button>
    {searches.length?<div className="recent-searches">{searches.slice(0,5).map(search=><button key={search.id} className={active&&activeId===search.id?'selected':''} onClick={()=>onSelect(search.id)} aria-current={active&&activeId===search.id?'page':undefined}><span>{title(search)}</span><small>{search.results.length} matches · {when(search.createdAt)}</small></button>)}</div>:<p>Your completed job searches will appear here.</p>}
  </section>;
}

type ResultsProps={searches:SavedSearch[];activeId:string;onSelect:(id:string)=>void;onRemove:(id:string)=>void;renderJob:(job:Job,index:number,terms:string[])=>ReactNode};
/** History has no search callback: opening a record only reads its stored snapshot. */
export function MySearches({searches,activeId,onSelect,onRemove,renderJob}:ResultsProps) {
  const search=searches.find(item=>item.id===activeId);
  const [confirmRemove,setConfirmRemove]=useState('');
  return <section className="my-searches">
    <div className="page-heading"><div className="eyebrow">SEARCH HISTORY</div><h1>My Searches</h1><p>A record of searches you started in Job Search. Open an entry to view its saved results.</p></div>
    {search?<>
      <div className="saved-search-heading"><div><button className="text-button" onClick={()=>onSelect('')}><ArrowLeft size={14}/>All searches</button><h2>{title(search)}</h2><p>{search.results.length} saved matches{search.total>search.results.length?' of '+search.total+' found':''} · {search.resumeName||'Résumé'} · Searched {when(search.createdAt)}</p></div><button className="icon-button" aria-label={'Remove search: '+title(search)} onClick={()=>setConfirmRemove(search.id)}><Trash2 size={17}/></button></div>
      {confirmRemove===search.id&&<div className="search-remove" role="alert"><p>Remove this search record and its results? Your saved jobs and application statuses will stay.</p><button className="button secondary small" onClick={()=>setConfirmRemove('')}>Keep search</button><button className="button primary small" onClick={()=>{onRemove(search.id);setConfirmRemove('');}}>Remove search</button></div>}
      <div className="search-terms" aria-label="Résumé keywords used">{search.terms.slice(0,12).map(term=><span key={term}>{term}</span>)}</div>
      {search.warnings.map(warning=><p className="feed-warning" key={warning}>{warning}</p>)}
      {search.results.length?<div className="job-grid search-result-grid">{search.results.map((result,index)=>renderJob(result.job,index,result.matchedTerms))}</div>:<div className="empty-state"><Search size={32}/><h3>No matches were found</h3><p>This search completed without matching jobs. Its original results are kept here.</p></div>}
      <p className="source-note">Saved snapshot from {search.sources.join(' and ')} · Feed fetched {when(search.fetchedAt)}. Opening this record does not search again or update its results. Check the original listing for availability and eligibility.</p>
    </>:searches.length?<div className="saved-search-list">{searches.map(item=><button key={item.id} className="panel saved-search-item" onClick={()=>onSelect(item.id)}><span className="search-item-icon"><Search size={20}/></span><span><strong>{title(item)}</strong><small>{when(item.createdAt)} · {item.resumeName||'Résumé'} · {item.results.length} saved matches</small></span><ArrowUpRight size={20}/></button>)}</div>:<div className="empty-state"><Search size={32}/><h3>No searches yet</h3><p>Searches you start using the Job Search button will be recorded here.</p></div>}
  </section>;
}
