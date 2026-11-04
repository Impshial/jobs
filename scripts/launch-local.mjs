import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,openSync,closeSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const runtime=path.join(root,'.local-runtime');
const record=path.join(runtime,'server.json');
const url='http://127.0.0.1:5187';
mkdirSync(runtime,{recursive:true});
async function status(){try{const r=await fetch(url+'/api/local-health',{signal:AbortSignal.timeout(1500)});if(!r.ok)return null;const data=await r.json();return data.app==='nextmove-local'?data:null;}catch{return null;}}
function openBrowser(){if(process.argv.includes('--open')){const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];const p=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true});p.on('error',()=>console.log('Open '+url+' in your browser.'));p.unref();}}
const current=await status();
if(process.argv.includes('--stop')){
 if(!current){console.log('Nextmove is not running at '+url);process.exit(0);}
 let saved;try{saved=JSON.parse(readFileSync(record,'utf8'));}catch{console.error('No launcher record. Stop the terminal that started this server.');process.exit(1);}
 if(saved.pid!==current.ownerPid||saved.root!==root){console.error('This server was not started by this launcher. No process was stopped.');process.exit(1);}
 if(process.platform==='win32'){const r=spawnSync('taskkill.exe',['/PID',String(saved.pid),'/T','/F'],{stdio:'pipe',windowsHide:true});if(r.status!==0){console.error('Could not stop the server.');process.exit(1);}}
 else process.kill(saved.pid,'SIGTERM');
 unlinkSync(record);console.log('Nextmove stopped.');process.exit(0);
}
if(current){console.log('Nextmove is already running: '+url);openBrowser();process.exit(0);}
const out=openSync(path.join(runtime,'server.log'),'a');
const child=spawn(process.execPath,[path.join(root,'scripts/local-app.mjs'),'start'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,out]});
closeSync(out);
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
if(child.pid)writeFileSync(record,JSON.stringify({pid:child.pid,root,url},null,2));
child.unref();
console.log('Starting Nextmove. Logs: '+path.join(runtime,'server.log'));
for(let i=0;i<180;i++){
 const ready=await status();
 if(ready){console.log('Nextmove is running: '+url);openBrowser();process.exit(0);}
 try{process.kill(child.pid,0);}catch{console.error('The server did not start. Check .local-runtime/server.log.');process.exit(1);}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
console.error('Startup is taking longer than expected. Check .local-runtime/server.log.');process.exitCode=1;
