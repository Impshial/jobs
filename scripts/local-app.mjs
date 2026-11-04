import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const cli=path.join(root,'node_modules/next/dist/bin/next');
if(!existsSync(cli)){console.error('Dependencies are missing. Run npm ci in the nextmove folder.');process.exit(1);}
const action=process.argv[2]||'start';
if(!['build','start','dev'].includes(action)){console.error('Use build, start, or dev.');process.exit(1);}
const env={...process.env,NEXTMOVE_LOCAL:'1',NEXT_PUBLIC_LOCAL_APP:'1',NEXT_TELEMETRY_DISABLED:'1',NEXTMOVE_LOCAL_OWNER_PID:String(process.pid)};
let child;
async function run(args){return new Promise((resolve,reject)=>{child=spawn(process.execPath,[cli,...args],{cwd:root,env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',(code)=>resolve(code??1));});}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{child?.kill(signal);});
try{
 if(action==='build')process.exitCode=await run(['build','--webpack']);
 else{
  if(action==='start'&&!existsSync(path.join(root,'.next-local/BUILD_ID'))){const code=await run(['build','--webpack']);if(code)process.exit(code);}
  process.exitCode=await run([action,'--hostname','127.0.0.1','--port','5187',...(action==='dev'?['--webpack']:[])]);
 }
}catch(e){console.error(e.message);process.exitCode=1;}
