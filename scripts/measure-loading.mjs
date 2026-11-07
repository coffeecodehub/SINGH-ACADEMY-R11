/** Read-only, loopback-only loading measurements. No .env, cookies, passwords,
 * provider APIs or payment writes. Does NOT measure authenticated sessions or
 * separate compilation internally: compare the Next terminal's compile log. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function localOrigin(value){
 const u=new URL(value);
 if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Use only a loopback origin, without credentials, path or query.');
 return u.origin;
}
export function parseArguments(args){
 const options={mode:'development',front:'http://localhost:3000',api:'http://127.0.0.1:5000',samples:3,timeout:30000};
 for(let i=0;i<args.length;i++){
  const key=args[i];if(key==='--help')return {...options,help:true};
  if(!['--mode','--front','--api','--samples','--timeout'].includes(key)||args[i+1]===undefined)throw Error('Unknown or incomplete option. Use --help.');
  options[key.slice(2)]=args[++i];
 }
 if(!['development','production'].includes(options.mode))throw Error('--mode must be development or production.');
 options.front=localOrigin(options.front);options.api=localOrigin(options.api);
 options.samples=Number(options.samples);options.timeout=Number(options.timeout);
 if(!Number.isInteger(options.samples)||options.samples<1||options.samples>10)throw Error('--samples must be 1 through 10.');
 if(!Number.isInteger(options.timeout)||options.timeout<100||options.timeout>60000)throw Error('--timeout must be 100 through 60000 milliseconds.');
 return options;
}
export function measurementPlan(options){
 const pages=['/login','/register','/admin/login','/super-admin/login','/forgot-password','/reset-password'];
 const endpoints=['/api/health','/api/health/ready','/api/auth/session?compact=1','/api/content/site'];
 return [...pages.map(route=>({group:'frontend-document',origin:options.front,route})),
  ...endpoints.map(route=>({group:'direct-backend',origin:options.api,route})),
  ...endpoints.map(route=>({group:'same-origin-proxy',origin:options.front,route}))];
}
const round=n=>Math.round(n*100)/100;
export async function measureEndpoint(probe,{timeout=30000,fetcher=fetch}={}){
 const origin=localOrigin(probe.origin),start=performance.now(),controller=new AbortController();let stage='headers',ttfbMs=null,status=null,bytes=0;
 const timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetcher(origin+probe.route,{method:'GET',credentials:'omit',redirect:'manual',cache:'no-store',headers:{Accept:probe.group==='frontend-document'?'text/html':'application/json','X-SA-Portal':'student'},signal:controller.signal});
  ttfbMs=round(performance.now()-start);status=response.status;stage='body';
  if(response.body){const reader=response.body.getReader();try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>10*1024*1024){controller.abort();throw Error('MEASUREMENT_BODY_LIMIT');}}}finally{reader.releaseLock();}}
  const totalMs=round(performance.now()-start);
  return {...probe,status,ttfbMs,bodyMs:round(totalMs-ttfbMs),totalMs,bytes,ok:response.ok,error:null};
 }catch(error){return {...probe,status,ttfbMs,bodyMs:ttfbMs===null?null:round(performance.now()-start-ttfbMs),totalMs:round(performance.now()-start),bytes,ok:false,error:controller.signal.aborted?'TIMEOUT_OR_BODY_LIMIT':error?.name==='TypeError'?'CONNECTION_FAILED':'MEASUREMENT_FAILED',failedStage:stage};}
 finally{clearTimeout(timer);}
}
export async function runMeasurements(options,{measure=measureEndpoint}={}){
 const results=[];
 for(const probe of measurementPlan(options))for(let sample=1;sample<=options.samples;sample++)results.push({...await measure(probe,{timeout:options.timeout}),sample,sampleKind:sample===1?'first-observed-not-guaranteed-cold':'repeat'});
 return {patch:'PAYMENTS-P1-EYE-LOADING-REVIEW-1',capturedAt:new Date().toISOString(),modeLabel:options.mode,node:process.version,
  scope:'Loopback anonymous GET requests only; no provider, database mutation, authenticated cookie or credential collection.',
  authenticatedSessionLatencyMeasured:false,compilationTimeMeasured:false,loadingFixed:false,
  notes:['The mode label is supplied by the operator, not detected.','TTFB includes server/network scheduling, middleware and any development compilation; it is not pure compile time.','Compare Next terminal compilation output separately. A fast guest session does not prove signed-in MongoDB/session latency.','No response bodies or headers, cookies, query tokens, passwords or .env values are stored.','An HTTP success is not a performance target, payment acceptance or deployment approval.'],
  status:results.every(x=>x.ok)?'responses_received':'incomplete_or_http_failure',results};
}
async function main(){
 const options=parseArguments(process.argv.slice(2));
 if(options.help){console.log('node scripts/measure-loading.mjs --mode development|production [--front http://localhost:3000] [--api http://127.0.0.1:5000] [--samples 3] [--timeout 30000]\nStart the real local frontend/backend first. Output: qa/loading-<mode>.json. Anonymous GET requests only.');return;}
 const report=await runMeasurements(options),out=path.join(root,'qa','loading-'+options.mode+'.json');
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.table(report.results.map(({group,route,sample,status,ttfbMs,totalMs,error})=>({group,route,sample,status,ttfbMs,totalMs,error})));
 console.log('Saved '+path.relative(root,out)+'. This is not proof that loading is fixed.');
 if(report.status!=='responses_received')process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
