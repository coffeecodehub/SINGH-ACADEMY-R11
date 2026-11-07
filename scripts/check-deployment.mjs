/** Read-only deployment smoke. Never logs in, writes data, sends mail or creates a payment. */
import fs from 'node:fs';
import {validateDeploymentOrigins} from './deployment-origins.mjs';
const version=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const arg=name=>{const i=process.argv.indexOf(name);return i<0?'':process.argv[i+1];};
const front=arg('--front')||process.env.FRONTEND_URL,api=arg('--api')||process.env.PAYMENT_WEBHOOK_BASE_URL;
if(!front||!api)throw new Error('Use: npm run deploy:check -- --front https://FRONTEND --api https://BACKEND (add --local for two loopback origins).');
validateDeploymentOrigins(front,api,process.argv.includes('--local'));
let failures=0;
for(const [server,origin] of [['backend',api],['frontend proxy',front]]){
 for(const route of ['/api/health','/api/health/ready','/api/auth/session','/api/content/landing','/api/content/site','/api/content/team','/api/courses']){
  const at=performance.now(),protectedRoute=['/api/content/team','/api/courses'].includes(route);
  try{
   const res=await fetch(origin+route,{headers:{'Cache-Control':'no-cache','X-SA-Portal':'student'},redirect:'manual',signal:AbortSignal.timeout(15000)});
   const body=(res.headers.get('content-type')||'').includes('json')?await res.json():null;
   const valid=protectedRoute?res.status===401&&body?.code==='SESSION_REQUIRED':res.ok&&body?.success===true&&(route!=='/api/auth/session'||body.user===null)&&(route!=='/api/health/ready'||body.ready===true)&&(route!=='/api/health'||body.version===version)&&(route!=='/api/content/landing'||['courses','team','reviews'].every(k=>Array.isArray(body[k])))&&(route!=='/api/content/site'||body.content&&typeof body.content==='object'&&!Array.isArray(body.content));
   const row={server,route,status:res.status,expected:protectedRoute?'401 login required':'200',ok:valid,ms:Math.round(performance.now()-at),cache:res.headers.get('cache-control'),age:res.headers.get('age'),edgeCache:res.headers.get('x-cache')||res.headers.get('x-litespeed-cache'),requestId:res.headers.get('x-request-id'),...(body?.version?{version:body.version}:{}),...(route==='/api/content/landing'?{courses:body?.courses?.length,team:body?.team?.length,reviews:body?.reviews?.length}:{})};
   if(!/no-store/i.test(row.cache||''))row.ok=false;
   if(!row.ok)failures++;console.log(JSON.stringify(row));
  }catch{failures++;console.error(JSON.stringify({server,route,ok:false,error:'Unavailable or invalid response. Check Runtime logs, API_PROXY_TARGET and DNS.'}));}
 }
}
for(const [route,kind] of [['/api/app-build','frontend build'],['/','public landing'],['/about','guest page protection']]){
 try{
  const res=await fetch(front+route,{redirect:'manual',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
  let ok=false,reported;
  if(kind==='frontend build'){const data=await res.json();reported=data.frontendVersion;ok=res.ok&&data.success===true&&reported===version&&data.pageAccess==='public-landing-protected-pages-v6010';}
  else if(kind==='public landing'){const html=await res.text();ok=res.ok&&html.includes('SINGH ACADEMY');}
  else{const location=res.headers.get('location');const u=location?new URL(location,front):null;ok=[302,303,307,308].includes(res.status)&&u?.origin===front&&u?.pathname==='/login'&&u?.searchParams.get('next')==='/about';}
  if(!ok)failures++;console.log(JSON.stringify({server:'frontend',route,check:kind,status:res.status,ok,...(reported?{version:reported}:{})}));
 }catch{failures++;console.error(JSON.stringify({server:'frontend',route,ok:false,error:'Check that the NEW frontend, not only the backend, was redeployed.'}));}
}
console.log(`Deployment smoke: ${failures} failed checks. Catalog 401 is EXPECTED for anonymous requests. Signed-in page/content loading, logout, Stripe/PayPal webhooks and inbox delivery still require acceptance tests.`);
process.exitCode=failures?1:0;
