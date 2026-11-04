import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {validateJobImport} from '../../../lib/workspace-import';

export const dynamic='force-dynamic';
export async function GET() {
  // Private local data is excluded from git and never served by a hosted deployment.
  if (process.env.NEXTMOVE_LOCAL!=='1') return new Response(null,{status:204});
  try {
    const raw=await readFile(path.join(process.cwd(),'.local-runtime/imported-jobs.json'),'utf8');
    return Response.json(validateJobImport(JSON.parse(raw)),{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    if ((error as NodeJS.ErrnoException).code==='ENOENT') return new Response(null,{status:204});
    return Response.json({error:'The local job import could not be read. Check .local-runtime/imported-jobs.json.'},{status:500});
  }
}
