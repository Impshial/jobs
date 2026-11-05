import {matches, type Job, type Preferences} from './jobs';
import type {Resume} from './resume';

export const MAX_SEARCHES = 20;
export const MAX_SEARCH_RESULTS = 40;
export type SearchResult = {job:Job; score:number; matchedTerms:string[]};
export type SavedSearch = {
  id:string; query:string; createdAt:string; fetchedAt:string;
  resumeId?:string; resumeName?:string;
  terms:string[]; sources:string[]; warnings:string[]; total:number;
  preferences:Preferences; results:SearchResult[];
};

function normalize(value:string) {
  return value.normalize('NFKC').toLowerCase().replace(/[‐‑–—-]/g,' ').replace(/\s+/g,' ').trim();
}
function phrasePattern(value:string) {
  if(normalize(value)==='.net')return /(^|[^a-z0-9+#])(?:asp|vb)?\.net($|[^a-z0-9+#])/i;
  const escaped=normalize(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${escaped}($|[^a-z0-9+#])`,'i');
}

/** Expand compound résumé skills while retaining meaningful phrases and technology names. */
export function resumeSearchTerms(resume:Resume) {
  const terms=new Map<string,string>();
  const add=(value:string)=>{const clean=value.trim();if(clean.length>1&&!terms.has(normalize(clean)))terms.set(normalize(clean),clean);};
  const aliases: Array<[RegExp,string[]]> = [
    [/\bc#/i,['C#']], [/\bc\+\+/i,['C++']], [/\b(?:asp\.?net|vb\.?net|\.net)\b/i,['.NET']],
    [/\bsql server\b/i,['SQL Server']], [/\bt[- ]sql\b/i,['T-SQL']], [/\bssis\b/i,['SSIS']],
    [/\boutsystems\b/i,['OutSystems']], [/\bfull[- ]stack\b/i,['Full stack']],
    [/\brest(?:ful)? api\b/i,['REST API','RESTful']],
    [/\bhtml\b/i,['HTML']], [/\bcss\b/i,['CSS']], [/\bjavascript\b/i,['JavaScript']],
    [/\btypescript\b/i,['TypeScript']], [/\bjquery\b/i,['jQuery']], [/\bvba\b/i,['VBA']],
  ];
  for(const value of [...resume.searchTerms,...resume.skills]) {
    for(const [pattern,expanded] of aliases)if(pattern.test(value))expanded.forEach(add);
    add(value.replace(/\([^)]*\)/g,'').trim());
  }
  return [...terms.values()].slice(0,60);
}

export function searchJobFeed(jobs:Job[],resume:Resume,query:string,preferences:Preferences) {
  const terms=resumeSearchTerms(resume);
  const patterns=terms.map(term=>({term,pattern:phrasePattern(term)}));
  const alternatives=query.split(',').map(part=>normalize(part).split(' ').filter(Boolean).map(phrasePattern)).filter(part=>part.length);
  const seen=new Set<string>();
  const results:SearchResult[]=[];
  for(const job of jobs) {
    // The explicit search replaces the checklist's keyword field; other filters still apply.
    if(!matches(job,{...preferences,keywords:''}))continue;
    const title=normalize(job.title),tags=normalize(job.tags.join(' ')),description=normalize(job.description);
    const hay=normalize(`${job.title} ${job.company} ${job.location} ${job.tags.join(' ')} ${job.description} ${job.remote?'remote':''}`);
    if(alternatives.length&&!alternatives.some(words=>words.every(pattern=>pattern.test(hay))))continue;
    const hits=patterns.map(({term,pattern})=>({term,score:pattern.test(title)?6:pattern.test(tags)?4:pattern.test(description)?1:0})).filter(hit=>hit.score>0);
    if(!hits.length)continue;
    const identity=normalize(`${job.company}|${job.title}|${job.location}`);
    if(seen.has(identity))continue;
    seen.add(identity);
    hits.sort((a,b)=>b.score-a.score);
    results.push({job,score:hits.reduce((sum,hit)=>sum+hit.score,0)+(resume.roles.includes(job.category)?2:0),matchedTerms:hits.slice(0,8).map(hit=>hit.term)});
  }
  results.sort((a,b)=>b.score-a.score||(Date.parse(b.job.posted)||0)-(Date.parse(a.job.posted)||0));
  return {terms,total:results.length,results:results.slice(0,MAX_SEARCH_RESULTS).map(result=>({...result,job:{...result.job,description:result.job.description.slice(0,6000)}}))};
}

export function saveSearch(searches:SavedSearch[],search:SavedSearch) {
  if(searches.some(previous=>previous.id===search.id))throw Error('This search is already recorded.');
  if(searches.length>=MAX_SEARCHES)throw Error(`You have ${MAX_SEARCHES} saved searches. Remove one before starting another.`);
  return [search,...searches];
}
