import type {Preferences} from './jobs';
import type {Resume} from './resume';

export const externalBoards=['Monster','LinkedIn','Indeed'] as const;
export type ExternalBoard=typeof externalBoards[number];
export type SearchBoard='feeds'|ExternalBoard;
export type ExternalSearch={board:ExternalBoard;query:string;location:string};

/** Only the displayed keyword and location go to the board, never the résumé itself. */
export function prepareBoardSearch(board:ExternalBoard,resume:Resume,query:string,preferences:Preferences):ExternalSearch {
  const keyword=query.trim()||resume.searchTerms.find(term=>term.trim())?.trim()||resume.skills.find(term=>term.trim())?.trim()||'';
  if(!keyword)throw Error('Enter a search or add a target role or skill to this résumé.');
  const remoteOnly=preferences.styles.length===1&&preferences.styles[0]==='Remote';
  return {board,query:keyword.slice(0,200),location:remoteOnly?'Remote':preferences.locations[0]||''};
}

/** Build from fixed destinations rather than accepting URLs from saved workspaces. */
export function boardSearchUrl(search:ExternalSearch) {
  const url=new URL(search.board==='Monster'?'https://www.monster.com/jobs/search':search.board==='LinkedIn'?'https://www.linkedin.com/jobs/search/':'https://www.indeed.com/jobs');
  url.searchParams.set(search.board==='LinkedIn'?'keywords':'q',search.query);
  if(search.location){
    if(search.board==='LinkedIn'&&search.location==='Remote')url.searchParams.set('f_WT','2');
    else url.searchParams.set(search.board==='Monster'?'where':search.board==='LinkedIn'?'location':'l',search.location);
  }
  return url.toString();
}
