import {boundaryMarker,explicitlyLoggedOut,markExplicitLogout,markExplicitLogin} from './authBoundary';
/** Same-origin API client. Public content is the only data eligible for in-memory reuse. */
export const API_URL=(process.env.NEXT_PUBLIC_API_URL||'/api').replace(/\/$/,'');
export type Portal='student'|'client_admin'|'super_admin';
export function portalForPath(path:string):Portal {return /^\/super-admin(?:\/|$)/.test(path)?'super_admin':/^\/admin(?:\/|$)/.test(path)?'client_admin':'student';}
export function currentPortal():Portal {return typeof window==='undefined'?'student':portalForPath(window.location.pathname);}
export function requestHeaders(options:RequestInit={},portal:Portal=currentPortal()){
 const headers=new Headers(options.headers||{});if(!headers.has('X-SA-Portal'))headers.set('X-SA-Portal',portal);
 if(!['GET','HEAD','OPTIONS'].includes((options.method||'GET').toUpperCase()))headers.set('X-SA-CSRF','1');
 if(options.body&&!(options.body instanceof FormData)&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');return headers;
}
export class ApiError extends Error {
 status:number;code?:string;requestId?:string;
 constructor(message:string,status:number,code?:string,requestId?:string){super(message);this.name='ApiError';this.status=status;this.code=code;this.requestId=requestId;}
}
const epochs:Record<Portal,number>={student:0,client_admin:0,super_admin:0};
export function accountEpoch(portal:Portal){return epochs[portal];}
export function invalidateAccountRequests(portal:Portal){epochs[portal]++;invalidatePublicApi();}
export {boundaryMarker,explicitlyLoggedOut};
export function beginExplicitLogout(portal:Portal){invalidateAccountRequests(portal);return markExplicitLogout(portal);}
export function isAbortError(error:any){return error?.name==='AbortError';}
const abortError=()=>new DOMException('Request cancelled.','AbortError');
const publicPath=(path:string)=>/^\/content\/(?:site|landing|team|events)(?:\?|$)/.test(path)||/^\/(?:courses|sections|video-reviews)(?:\?[^#]*)?$/.test(path)||/^\/courses\/[^/?]+$/.test(path)||/^\/page-sections\/[a-z][a-z0-9-]{0,99}$/.test(path);
const publicCache=new Map<string,{value:any;until:number}>();
const pendingPublic=new Map<string,Promise<any>>();
let publicGeneration=0;
const publicListeners=new Set<()=>void>();
const invalidationEvents=new WeakSet<Event>();
const notifyPublic=()=>{for(const listener of publicListeners)listener();};
const catalogKey=(path:string,portal:Portal=currentPortal())=>portal+':'+accountEpoch(portal)+':'+boundaryMarker(portal)+':'+API_URL+path;
export function publicApiSnapshot(path:string){return publicCache.get(catalogKey(path))?.value;}
export function publicApiScope(path:string){return catalogKey(path);}
export function subscribePublicApi(listener:()=>void){publicListeners.add(listener);return()=>{publicListeners.delete(listener);};}
export function invalidatePublicApi(event?:Event){if(event){if(invalidationEvents.has(event))return;invalidationEvents.add(event);}publicGeneration++;publicCache.clear();pendingPublic.clear();notifyPublic();}
function waitFor<T>(promise:Promise<T>,signal?:AbortSignal|null):Promise<T>{
 if(!signal)return promise;if(signal.aborted)return Promise.reject(abortError());
 return new Promise((resolve,reject)=>{const cancel=()=>{cleanup();reject(abortError());};const cleanup=()=>signal.removeEventListener('abort',cancel);signal.addEventListener('abort',cancel,{once:true});promise.then(v=>{cleanup();resolve(v);},e=>{cleanup();reject(e);});});
}
async function request(path:string,options:RequestInit={},isPublic=false){
 const method=(options.method||'GET').toUpperCase(),headers=requestHeaders(options),portal=headers.get('X-SA-Portal') as Portal;
 const logoutWrite=method==='POST'&&path==='/auth/logout';
 const loginWrite=method==='POST'&&/^\/auth\/(?:login|admin\/login|super-admin\/login|register)$/.test(path);
 if(logoutWrite&&!explicitlyLoggedOut(portal))beginExplicitLogout(portal);
 const epoch=epochs[portal],marker=boundaryMarker(portal),safe=method==='GET',attempts=safe&&!path.startsWith('/auth/session')?2:1;
 const stale=()=>epochs[portal]!==epoch||boundaryMarker(portal)!==marker;
 // A browser logout fence never grants access; the backend still authorizes every request.
 if(!isPublic&&!loginWrite&&!logoutWrite&&explicitlyLoggedOut(portal)){
  if(path.split('?')[0]==='/auth/session')return {success:true,user:null,enrollment:null,portal};
  const protectedPath=/^\/(?:auth\/(?:me|security)|academy-admin(?:\/|$)|admin(?:\/|$)|notifications(?:\/|$)|student-notifications(?:\/|$)|certificates\/(?:mine|status|admin|[^/]+\/download)|payments\/(?:mine|checkout|orders|access|membership-status|requests)|courses\/(?:enrolled\/mine|[^/]+\/(?:learn|enroll|resume|lessons)))/.test(path);
  if(protectedPath)throw new ApiError('Please sign in to continue.',401,'SESSION_REQUIRED');
 }
 for(let attempt=0;attempt<attempts;attempt++){
  if(options.signal?.aborted)throw abortError();
  const controller=new AbortController();let timedOut=false,retryAfter=0;
  const paymentWrite=method==='POST'&&/^\/payments\/(?:checkout$|orders\/[^/]+\/confirm$)/.test(path);
  const timeout=setTimeout(()=>{timedOut=true;controller.abort();},paymentWrite?70000:safe?12000:25000),cancel=()=>controller.abort();
  options.signal?.addEventListener('abort',cancel,{once:true});
  try{
   const response=await fetch(`${API_URL}${path}`,{...options,method,credentials:'include',headers,signal:controller.signal,cache:'no-store'});
   const raw=await response.text();let data:any;
   try{data=raw?JSON.parse(raw):null;}catch{throw new ApiError('The service returned an invalid response. Please retry shortly.',response.ok?502:response.status,'API_INVALID_RESPONSE',response.headers.get('X-Request-ID')||undefined);}
   if(!data||typeof data!=='object')throw new ApiError('The service response was incomplete. Please retry.',502,'API_INVALID_RESPONSE');
   if(stale())throw abortError(); // Never deliver another account's in-flight private response.
   if(!response.ok||data.success===false){
    retryAfter=Number(response.headers.get('Retry-After')||0)*1000;
    // A provider/password 401 is not a session logout. Revalidate only a recognized session denial.
    if(response.status===401&&data.code==='SESSION_REQUIRED'&&!path.startsWith('/auth/')&&epochs[portal]===epoch&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('sa:session-check',{detail:{portal,epoch}}));
    throw new ApiError(data.message||`Request failed (${response.status})`,response.ok?502:response.status,data.code,data.requestId||response.headers.get('X-Request-ID')||undefined);
   }
   if(loginWrite){if(data.success!==true||!data.user||data.user.role!==portal||typeof data.user.id!=='string'||!data.user.id)throw new ApiError('Sign-in could not be confirmed. Please retry signing in.',502,'AUTH_RESPONSE_INVALID');invalidateAccountRequests(portal);markExplicitLogin(portal);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('sa:authenticated',{detail:{portal,user:data.user,setupRequired:data.setupRequired}}));}
   if(logoutWrite)invalidateAccountRequests(portal);
   if(!safe&&/^\/(?:admin|academy-admin)\//.test(path)){invalidatePublicApi();if(typeof window!=='undefined')window.dispatchEvent(new Event('sa-website-content'));}
   return data;
  }catch(caught:any){
   if(options.signal?.aborted||stale())throw abortError();
   const error=timedOut?new ApiError(paymentWrite?'Payment confirmation is taking longer. Check the existing order before trying another payment.':'The service is taking longer than expected. Please retry; your account has not been signed out.',408,'API_TIMEOUT'):caught instanceof TypeError?new ApiError('The service is temporarily unreachable. Check your connection and retry.',0,'API_UNREACHABLE'):caught;
   if(!safe||attempt===attempts-1||!(error instanceof ApiError)||![0,408,429,502,503,504].includes(error.status)||retryAfter>2000)throw error;
  }finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',cancel);}
  await waitFor(new Promise(resolve=>setTimeout(resolve,Math.max(retryAfter,350+Math.random()*200))),options.signal);
 }
 throw new ApiError('Service unavailable.',503);
}
const pendingSignOuts=new Map<Portal,Promise<any>>();
const pendingAuthWrites=new Map<Portal,Promise<any>>();
export async function apiFetch(path:string,options:RequestInit={}){
 if(options.signal?.aborted)throw abortError();
 const method=(options.method||'GET').toUpperCase();
 const portal=requestHeaders(options).get('X-SA-Portal') as Portal;
 const isLogout=method==='POST'&&path==='/auth/logout';
 const isCredentials=method==='POST'&&/^\/auth\/(?:login|admin\/login|super-admin\/login|register)$/.test(path);
 if(isLogout||isCredentials){
  if(isLogout){
   const active=pendingSignOuts.get(portal);if(active)return waitFor(active,options.signal);
   // Fence immediately, even if an older credentials response is still pending.
   if(!explicitlyLoggedOut(portal))beginExplicitLogout(portal);
  }
  const queuedMarker=boundaryMarker(portal),previous=pendingAuthWrites.get(portal);
  const run=()=>{
   if(isCredentials&&explicitlyLoggedOut(portal)&&boundaryMarker(portal)!==queuedMarker)throw abortError();
   return request(path,options);
  };
  // Set-Cookie ordering matters in BOTH directions. An old login response must
  // finish before logout revokes/clears the newly received token; a new login
  // must wait for logout expirations. No automatic repeat of either mutation.
  const promise=previous?waitFor(previous.catch(()=>{}),options.signal).then(run):run();
  pendingAuthWrites.set(portal,promise);if(isLogout)pendingSignOuts.set(portal,promise);
  try{return await promise;}finally{
   if(pendingAuthWrites.get(portal)===promise)pendingAuthWrites.delete(portal);
   if(pendingSignOuts.get(portal)===promise)pendingSignOuts.delete(portal);
  }
 }
 const reusable=(options.method||'GET').toUpperCase()==='GET'&&publicPath(path)&&!options.body;
 if(!reusable)return request(path,options);
 const key=catalogKey(path,portal),existing=publicCache.get(key);
 if(existing&&existing.until>Date.now())return existing.value;
 let promise=pendingPublic.get(key);
 if(!promise){
  const generation=publicGeneration;
  promise=request(path,{...options,signal:undefined},true).then(value=>{if(generation===publicGeneration){if(publicCache.size>=50)publicCache.delete(publicCache.keys().next().value!);publicCache.set(key,{value,until:Date.now()+20000});notifyPublic();}return value;});
  pendingPublic.set(key,promise);
  const cleanup=()=>{if(pendingPublic.get(key)===promise)pendingPublic.delete(key);};promise.then(cleanup,cleanup);
 }
 return waitFor(promise,options.signal);
}
export function portalMediaUrl(value:string,portalOverride?:Portal){
 if(!value)return value;
 try{
  const origin=typeof window==='undefined'?'http://localhost':window.location.origin;
  const base=new URL(API_URL,origin),u=new URL(value,origin);
  const mediaId=u.pathname.match(/\/api\/media\/([a-f0-9]{24})$/i)?.[1];
  // Media URLs may have been stored when the API used localhost, Render or another host.
  // A valid internal /api/media/<ObjectId> is always remapped through the CURRENT API base
  // so Vercel/Hostinger proxy cookies continue to work after deployment changes.
  if(mediaId){const portal=portalOverride||currentPortal();const mapped=new URL(base.pathname+'/media/'+mediaId,base.origin);if(portal!=='student')mapped.searchParams.set('portal',portal);return mapped.origin===origin?mapped.pathname+mapped.search:mapped.href;}
 }catch{}
 return value;
}
export function portalMediaDownloadUrl(value:string){
 const mapped=portalMediaUrl(value);if(!mapped)return mapped;
 try{
  const origin=typeof window==='undefined'?'http://localhost':window.location.origin,u=new URL(mapped,origin);
  // The backend uses this flag to send Content-Disposition: attachment with the original GridFS filename.
  u.searchParams.set('download','1');
  return u.origin===origin?u.pathname+u.search:u.href;
 }catch{return mapped;}
}
export {safeStudentNext} from './studentDestination';

export async function saveCsv(source:string|{csv:string;filename?:string}){const d=typeof source==='string'?await apiFetch(source):source;const url=URL.createObjectURL(new Blob(['\uFEFF'+d.csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=d.filename||'report.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export async function downloadApiFile(path:string,filename='certificate.pdf'){
 const portal=currentPortal(),epoch=accountEpoch(portal),marker=boundaryMarker(portal);
 if(explicitlyLoggedOut(portal))throw new ApiError('Please sign in to download this document.',401,'SESSION_REQUIRED');
 const response=await fetch(API_URL+path,{credentials:'include',headers:requestHeaders(),cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!response.ok){let message='The document could not be downloaded.';try{message=(await response.json()).message||message;}catch{}throw new ApiError(message,response.status);}
 if(!response.headers.get('content-type')?.includes('application/pdf'))throw new ApiError('The server did not return a PDF document.',502);
 const blob=await response.blob();
 if(epoch!==accountEpoch(portal)||marker!==boundaryMarker(portal))throw abortError();
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename.replace(/[^a-zA-Z0-9_.-]/g,'_');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
