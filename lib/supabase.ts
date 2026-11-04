import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {parseWorkspace, WorkspaceConflict, type Snapshot, type WorkspaceStore} from './workspace';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured=Boolean(url&&key);
export const cloudPartlyConfigured=Boolean(url||key)&&!cloudConfigured;
let client:SupabaseClient|undefined;
export function getSupabase(){
  if(!url||!key)throw Error('Supabase is not configured.');
  // Only a publishable key belongs here. Never use a service_role/secret key.
  return client??=createClient(url,key);
}
function snapshot(row:{document:unknown;revision:number;updated_at:string}):Snapshot{
  return {document:parseWorkspace(row.document),revision:Number(row.revision),updatedAt:row.updated_at};
}
export function cloudStore(supabase:SupabaseClient,userId:string):WorkspaceStore {
  async function authorization(){
    const {data:{session},error}=await supabase.auth.getSession();
    if(error||session?.user.id!==userId)throw Error('Sign in to this account again.');
    return `Bearer ${session.access_token}`;
  }
  return {
    async read(){
      const token=await authorization();
      const {data,error}=await supabase.from('workspaces').select('document,revision,updated_at').eq('user_id',userId).maybeSingle().setHeader('Authorization',token);
      if(error)throw Error('Could not read the database. Check the connection and database setup.');
      return data?snapshot(data):null;
    },
    async write(document,expectedRevision){
      const token=await authorization();
      const {data,error}=await supabase.rpc('save_workspace',{workspace:parseWorkspace(document),expected_revision:expectedRevision}).setHeader('Authorization',token);
      if(error?.code==='40001')throw new WorkspaceConflict();
      if(error)throw Error('Could not save to the database.');
      if(!Array.isArray(data)||!data[0])throw Error('Database did not confirm the save.');
      return snapshot(data[0]);
    },
  };
}
