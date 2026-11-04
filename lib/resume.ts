import {z} from 'zod';
import {roleOptions} from './jobs';
export const ResumeSchema=z.object({name:z.string().max(200),email:z.string().max(250),website:z.string().max(500),summary:z.string().max(4000),skills:z.array(z.string().max(100)).max(30),roles:z.array(z.string().refine(r=>roleOptions.includes(r))).max(12),searchTerms:z.array(z.string().max(100)).max(15),experienceLevel:z.string().max(100),notes:z.string().max(1500)});
export type Resume= z.infer<typeof ResumeSchema>;
export type Match={id:string;score:number;reason:string;gap:string};
export const RESUME_KEY='nextmove.resume.v1';
export const API_KEY='nextmove.openai-key';
export function localRelevance(job:{title:string;description:string},resume:Resume){const title=job.title.toLowerCase();const text=job.description.toLowerCase();return [...resume.skills,...resume.searchTerms].reduce((n,w)=>n+(title.includes(w.toLowerCase())?4:0)+(text.includes(w.toLowerCase())?1:0),0);}
