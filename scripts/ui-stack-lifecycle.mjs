import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {once} from 'node:events';

/** kill(pid, 0) also succeeds for unreaped Linux zombies, which own no server. */
export function uiProcessAlive(pid,{probe=(value)=>process.kill(value,0),readStat=(value)=>fs.readFileSync(`/proc/${value}/stat`,'utf8'),platform=process.platform}={}){
 if(!Number.isSafeInteger(pid)||pid<=0)return false;
 try{probe(pid);}catch(error){if(error.code==='ESRCH')return false;return true;}
 if(platform==='linux'){
  try{const stat=readStat(pid),state=stat.slice(stat.lastIndexOf(')')+2).split(' ')[0];if(state==='Z'||state==='X')return false;}
  catch(error){if(error.code==='ENOENT'||error.code==='ESRCH')return false;}
 }
 return true;
}

export function acquireUiStackLock(file,{pid=process.pid,isAlive=uiProcessAlive}={}){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const fd=fs.openSync(file,'wx');try{fs.writeFileSync(fd,String(pid));}finally{fs.closeSync(fd);}
   return ()=>{try{if(fs.readFileSync(file,'utf8')===String(pid))fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}};
  }catch(error){
   if(error.code!=='EEXIST')throw error;
   let owner;try{owner=Number(fs.readFileSync(file,'utf8'));}catch(readError){if(readError.code==='ENOENT')continue;throw readError;}
   if(isAlive(owner))throw Error('Another UI test stack owns the build directory. Stop that test normally before starting a second run.');
   try{fs.unlinkSync(file);}catch(unlinkError){if(unlinkError.code!=='ENOENT')throw unlinkError;}
  }
 }
 throw Error('UI stack ownership changed while acquiring the lock. Retry after the other run stops.');
}

/** POSIX children own a dedicated group. Terminate that group only, including
 * grandchildren even if the initial child has already exited. Never kill a port. */
export async function stopOwnedUiChild(child,{timeoutMs=4000}={}){
 if(!child?.pid)return;
 if(process.platform==='win32'){
  spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});return;
 }
 const signal=kind=>{try{process.kill(-child.pid,kind);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
 if(!signal('SIGTERM'))return;
 if(child.exitCode===null&&child.signalCode===null){
  let timer;
  try{await Promise.race([once(child,'exit').catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);timer.unref();})]);}
  finally{clearTimeout(timer);}
 }
 // The group may still contain a grandchild after its CLI parent exits.
 signal('SIGKILL');
}
