import {blankProfile, defaults, validateBackup, validJob, type Job, type Tracked} from './jobs';

export type JobImport = {revision:string; sourceName:string; importedAt:string; jobs:Job[]; tracked:Record<string,Tracked>};
export type ImportState = {importRevision?:string; importedJobs?:Job[]|null; importSource?:string; tracked:Record<string,Tracked>};

export function validateJobImport(raw:unknown):JobImport {
  if (!raw || typeof raw !== 'object') throw Error('Invalid job import.');
  const data=raw as JobImport;
  if (!data.revision || typeof data.revision!=='string' || typeof data.sourceName!=='string' || typeof data.importedAt!=='string' || !Array.isArray(data.jobs) || !data.jobs.every(validJob)) throw Error('Invalid job import.');
  validateBackup({version:1,tracked:data.tracked,preferences:defaults,profile:blankProfile});
  if (new Set(data.jobs.map(j=>j.id)).size!==data.jobs.length || data.jobs.some(j=>!data.tracked[j.id])) throw Error('Imported jobs must have unique tracking records.');
  return data;
}

/** Replace only jobs, once per import. Preferences, profile and unrelated fields survive. */
export function applyJobImport<T extends ImportState>(workspace:T, data:JobImport, force=false):T {
  if (!force && workspace.importRevision===data.revision) return workspace;
  return {...workspace,tracked:data.tracked,importedJobs:data.jobs,importRevision:data.revision,importSource:data.sourceName};
}
