/** Owns one isolated UI stack: a synthetic loopback API and ACTUAL Next.
 * Default: build once into .next-ui-tests, then next start. This keeps route
 * compilation/HMR and the developer's .next files out of browser assertions. */
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createUiFixtureApi} from './ui-fixture-api.mjs';
import {acquireUiStackLock,stopOwnedUiChild} from './ui-stack-lifecycle.mjs';
const frontend=fileURLToPath(new URL('../frontend/',import.meta.url));
const lock=frontend+'.ui-stack.lock',runtimeErrors=frontend+'qa/ui-runtime-errors.log';
let releaseLock=null,api=null,child=null,stopping=false;
async function stop(code=0){
 if(stopping)return;stopping=true;
 await stopOwnedUiChild(child);
 api?.closeAllConnections();if(api?.listening)await new Promise(resolve=>api.close(resolve));
 releaseLock?.();
 process.exitCode=code;
}
function run(args,env){
 if(stopping)throw Error('UI stack stopped');
 child=spawn(process.execPath,['node_modules/next/dist/bin/next',...args],{cwd:frontend,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32',env});
 for(const [stream,destination] of [[child.stdout,process.stdout],[child.stderr,process.stderr]]){
  let pending='';
  const inspect=line=>{if(/Failed to generate static paths|Unexpected end of JSON input/.test(line))fs.appendFileSync(runtimeErrors,line.slice(0,2000)+'\n');};
  stream.on('data',chunk=>{destination.write(chunk);pending+=chunk.toString();const lines=pending.split('\n');pending=lines.pop()||'';for(const line of lines)inspect(line);});
  stream.on('end',()=>{if(pending)inspect(pending);});
 }
 return child;
}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
try{
 releaseLock=acquireUiStackLock(lock);fs.mkdirSync(frontend+'qa',{recursive:true});fs.writeFileSync(runtimeErrors,'');
 if(!fs.existsSync(frontend+'node_modules/next/dist/bin/next'))throw Error('Next.js is not installed. Run npm run install:all with registry access first.');
 api=createUiFixtureApi();api.listen(5109,'127.0.0.1');await once(api,'listening');
 const dev=process.env.UI_TEST_MODE==='development';
 const env={...process.env,NODE_ENV:dev?'development':'production',SA_UI_FIXTURE_BUILD:'true',NEXT_TELEMETRY_DISABLED:'1',DEPLOYMENT_STAGE:'development',NEXT_PUBLIC_API_URL:'/api',API_PROXY_TARGET:'http://127.0.0.1:5109',API_PROXY_ALLOW_LOCAL_TEST_ONLY:'true'};
 // Only this stack's output is removed; never delete .next, lockfiles, .env or data.
 fs.rmSync(frontend+'.next-ui-tests',{recursive:true,force:true});
 if(!dev){const build=run(['build'],env);const [code]=await once(build,'exit');child=null;if(stopping)throw Error('UI stack stopped');if(code!==0)throw Error('Isolated UI production build failed ('+code+').');}
 const next=run([dev?'dev':'start','--hostname','127.0.0.1','--port','3108'],env);
 next.on('error',error=>{console.error(error.message);void stop(1);});next.on('exit',code=>{if(!stopping)void stop(code||1);});
 console.log('UI fixture stack: loopback API 5109; Next 3108; isolated .next-ui-tests; '+(dev?'development diagnostics':'production build'));
}catch(error){console.error('UI stack startup failed: '+error.message);await stop(1);}
