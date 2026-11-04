import {isSameOrigin} from '../../../lib/request-origin';
import {LocalWorkspaceDatabase} from '../../../lib/workspace-local';
import {parseWorkspace,WorkspaceConflict} from '../../../lib/workspace';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
function allowed(request:Request){
  if(process.env.NEXTMOVE_LOCAL!=='1'||process.env.VERCEL)return false;
  const host=request.headers.get('host')||new URL(request.url).host;
  try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(`http://${host}`).hostname)&&isSameOrigin(request);}catch{return false;}
}
export async function GET(request:Request){
  if(!allowed(request))return Response.json({error:'Local database is unavailable.'},{status:403,headers});
  let db:LocalWorkspaceDatabase|undefined;
  try{db=new LocalWorkspaceDatabase();return Response.json({snapshot:db.read()},{headers});}
  catch{return Response.json({error:'Could not read the local database.'},{status:500,headers});}
  finally{db?.close();}
}
export async function PUT(request:Request){
  if(!allowed(request))return Response.json({error:'Local database is unavailable.'},{status:403,headers});
  let raw;
  try{
    const text=await request.text();
    if(new TextEncoder().encode(text).byteLength>9*1024*1024)return Response.json({error:'Workspace is too large.'},{status:413,headers});
    raw=JSON.parse(text);
    if(!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0)throw Error();
    raw.document=parseWorkspace(raw.document);
  }catch{return Response.json({error:'Invalid workspace.'},{status:400,headers});}
  let db:LocalWorkspaceDatabase|undefined;
  try{db=new LocalWorkspaceDatabase();return Response.json({snapshot:db.write(raw.document,raw.expectedRevision)},{headers});}
  catch(error){return Response.json({error:error instanceof WorkspaceConflict?error.message:'Could not save the local database.'},{status:error instanceof WorkspaceConflict?409:500,headers});}
  finally{db?.close();}
}
