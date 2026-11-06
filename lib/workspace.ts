import {z} from 'zod';
import {blankProfile, defaults, safeUrl, stages} from './jobs';
import {ResumeSchema} from './resume';
import {externalBoards} from './job-boards';

export const LEGACY_WORKSPACE_KEY = 'nextmove.workspace.v1';
export const JobSchema = z.object({
  id:z.string().min(1), title:z.string(), company:z.string(), location:z.string(),
  category:z.string(), type:z.string(), salary:z.string(), description:z.string(),
  url:z.string().refine(value=>Boolean(safeUrl(value))), source:z.string(),
  posted:z.string(), remote:z.boolean(), tags:z.array(z.string()),
  importedFrom:z.object({sheet:z.string(),row:z.number().int(),checkedAt:z.string(),priority:z.string()}).optional(),
});
const TrackedSchema = z.object({job:JobSchema,stage:z.enum(stages as [typeof stages[number],...typeof stages[number][]]),notes:z.string(),followUp:z.string(),savedAt:z.string(),appliedAt:z.string().optional()});
const PreferencesSchema=z.object({roles:z.array(z.string()),styles:z.array(z.string()),types:z.array(z.string()),locations:z.array(z.string()),keywords:z.string(),minimum:z.string(),includeUnknown:z.boolean()});
const SavedSearchSchema=z.object({
  id:z.string().min(1),query:z.string().max(200),createdAt:z.string().datetime(),fetchedAt:z.string().datetime(),
  resumeId:z.string().optional(),resumeName:z.string().max(100).optional(),
  externalSearch:z.object({board:z.enum(externalBoards),query:z.string().trim().min(1).max(200),location:z.string().max(200)}).optional(),
  terms:z.array(z.string().max(100)).max(60),sources:z.array(z.string()).max(10),warnings:z.array(z.string()).max(10),
  total:z.number().int().nonnegative(),preferences:PreferencesSchema,
  results:z.array(z.object({job:JobSchema,score:z.number().nonnegative(),matchedTerms:z.array(z.string()).max(8)})).max(40),
});
export const SavedResumeSchema=z.object({id:z.string().min(1),label:z.string().trim().min(1).max(100),profile:ResumeSchema,sourceName:z.string().max(250).default(''),createdAt:z.string().datetime(),updatedAt:z.string().datetime()});
export type SavedResume=z.infer<typeof SavedResumeSchema>;
// Parsing constructs an explicit allowlist: credentials and arbitrary backup fields never sync.
export const WorkspaceSchema = z.object({
  version:z.literal(1),
  tracked:z.record(TrackedSchema).refine(rows=>Object.entries(rows).every(([id,row])=>id===row.job.id)),
  preferences:PreferencesSchema,
  profile:z.object({name:z.string(),email:z.string(),website:z.string(),summary:z.string()}),
  importedJobs:z.array(JobSchema).nullable().default(null),
  importRevision:z.string().default(''), importSource:z.string().default(''),
  resume:ResumeSchema.nullable().default(null),
  resumes:z.array(SavedResumeSchema).max(20).refine(rows=>new Set(rows.map(row=>row.id)).size===rows.length).optional(),
  selectedResumeId:z.string().optional(),
  searches:z.array(SavedSearchSchema).max(20).refine(searches=>new Set(searches.map(search=>search.id)).size===searches.length).default([]),
}).transform(document=>{
  // Deterministic migration also works for backups and browser drafts. An explicit empty
  // library stays empty: removing the last résumé must not resurrect the legacy profile.
  const {resumes:library,selectedResumeId:selection,...fields}=document;
  const resumes=library??(document.resume?[{id:'legacy-resume',label:'My résumé',profile:document.resume,sourceName:'',createdAt:'1970-01-01T00:00:00.000Z',updatedAt:'1970-01-01T00:00:00.000Z'}]:[]);
  const selectedResumeId=resumes.some(row=>row.id===selection)?selection!:resumes[0]?.id??'';
  return {...fields,resumes,selectedResumeId};
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Snapshot = {document:Workspace;revision:number;updatedAt:string};
export function parseWorkspace(raw:unknown):Workspace {
  const document=WorkspaceSchema.parse(raw);
  if(new TextEncoder().encode(JSON.stringify(document)).byteLength>8*1024*1024)throw Error('Workspace exceeds the 8 MB limit. Export a backup and reduce the imported job list.');
  return document;
}
export function emptyWorkspace():Workspace {
  return parseWorkspace({version:1,tracked:{},preferences:defaults,profile:blankProfile});
}
export function hasWorkspaceData(document:Workspace) {
  return Object.keys(document.tracked).length>0 || document.importedJobs!==null || document.resume!==null || document.resumes.length>0 || document.searches.length>0 || JSON.stringify(document.profile)!==JSON.stringify(blankProfile) || JSON.stringify(document.preferences)!==JSON.stringify(defaults);
}
export class WorkspaceConflict extends Error {
  constructor(){super('Newer changes are saved in the database. Your unsaved changes have been kept.');this.name='WorkspaceConflict';}
}
export interface WorkspaceStore {
  read():Promise<Snapshot|null>;
  write(document:Workspace,expectedRevision:number):Promise<Snapshot>;
}
export type Draft={baseRevision:number;document:Workspace};
export function parseDraft(raw:unknown):Draft {
  const value=z.object({baseRevision:z.number().int().nonnegative(),document:WorkspaceSchema}).parse(raw);
  return {...value,document:parseWorkspace(value.document)};
}
