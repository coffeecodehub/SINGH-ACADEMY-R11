import {signProxyIdentity,singleClientIp,usableProxySecret} from './proxyIdentity.mjs';
/** Fixed-upstream same-origin gateway. Never follows upstream redirects or caches account data. */
const FORWARD=['accept','content-type','cookie','origin','referer','sec-fetch-site','x-sa-portal','x-sa-csrf','idempotency-key','range','if-range','if-none-match','if-modified-since','stripe-signature','paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'];
const HOP=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','content-encoding','content-length','set-cookie']);
const PRIVATE={'Cache-Control':'private, no-store, max-age=0, must-revalidate','CDN-Cache-Control':'no-store','Surrogate-Control':'no-store','X-LiteSpeed-Cache-Control':'no-cache','Pragma':'no-cache','Vary':'Cookie, X-SA-Portal, Origin','X-Content-Type-Options':'nosniff'};
function error(status,code,message){return Response.json({success:false,code,message},{status,headers:PRIVATE});}
export function proxyTarget(env,requestOrigin){
 const localDefault=env.NODE_ENV==='development'&&['localhost','127.0.0.1','[::1]'].includes(new URL(requestOrigin).hostname)?'http://127.0.0.1:5000':'';
 const raw=(env.API_PROXY_TARGET||localDefault).trim().replace(/\/$/,'');
 if(!raw)throw new Error('API_PROXY_TARGET is missing.');
 const url=new URL(raw);
 const loopback=host=>['localhost','127.0.0.1','[::1]'].includes(host);
 const localTest=env.API_PROXY_ALLOW_LOCAL_TEST_ONLY==='true'&&loopback(url.hostname)&&loopback(new URL(requestOrigin).hostname);
 // Explicit fixed service on the private Compose network. This never authorizes an arbitrary HTTP upstream.
 const internalDocker=env.API_PROXY_ALLOW_INTERNAL_DOCKER==='true'&&raw==='http://backend:5000';
 if(url.origin!==raw||!['http:','https:'].includes(url.protocol)||url.username||url.password||(env.NODE_ENV==='production'&&url.protocol!=='https:'&&!localTest&&!internalDocker)||url.origin===requestOrigin)throw new Error('Invalid or self-referencing API_PROXY_TARGET.');
 return url.origin;
}
export async function proxyApi(request,{env=process.env,fetcher=fetch}={}){
 const incoming=new URL(request.url);let target;
 try{target=proxyTarget(env,incoming.origin);}catch{return error(503,'API_CONFIGURATION','The Academy API connection is not configured. Please contact support.');}
 let path=incoming.pathname;
 try{for(let i=0;i<3;i++)path=decodeURIComponent(path);}catch{return error(400,'INVALID_API_PATH','Invalid API path.');}
 if(!path.startsWith('/api/')||/[\\\x00-\x1f\x7f]/.test(path)||path.split('/').some(p=>p==='.'||p==='..'))return error(400,'INVALID_API_PATH','Invalid API path.');
 const headers=new Headers();for(const name of FORWARD){const value=request.headers.get(name);if(value!==null)headers.set(name,value);}
 headers.set('Cache-Control','no-cache');headers.set('Accept-Encoding','identity');
 const proxyKey=env.SA_PROXY_SHARED_SECRET,ipHeader=env.SA_PROXY_CLIENT_IP_HEADER;
 if(proxyKey||ipHeader||env.SA_REQUIRE_PROXY_IDENTITY==='true'){
  // No default forwarded-IP header: only the hosting operator can verify what
  // their edge overwrites. A comma-separated ambiguous chain is refused.
  if(!usableProxySecret(proxyKey)||!ipHeader||!/^[-a-z0-9]+$/.test(ipHeader)||env.SA_PROXY_CLIENT_IP_VERIFIED!=='true')
   return error(503,'PROXY_IDENTITY_CONFIGURATION','Trusted network attribution has not been verified for this deployment.');
  const ip=singleClientIp(request.headers.get(ipHeader));
  if(!ip)return error(503,'PROXY_CLIENT_IP_MISSING','The hosting edge did not provide a verified client address. Contact support.');
  const proof=signProxyIdentity(ip,{method:request.method,path:incoming.pathname+incoming.search,
   origin:headers.get('origin')||'',portal:headers.get('x-sa-portal')||'',key:headers.get('idempotency-key')||'',cookie:headers.get('cookie')||''},proxyKey);
  headers.set('X-SA-Network',proof.payload);headers.set('X-SA-Network-Signature',proof.signature);
 }

 const method=request.method.toUpperCase(),hasBody=!['GET','HEAD'].includes(method)&&request.body!==null;
 const paymentWrite=method==='POST'&&/^\/api\/payments\/(?:checkout$|orders\/[^/]+\/confirm$)/.test(path);
 const longRequest=path.startsWith('/api/media/')||/multipart\/form-data/i.test(headers.get('content-type')||'');
 try{
  const response=await fetcher(target+incoming.pathname+incoming.search,{method,headers,body:hasBody?request.body:undefined,...(hasBody?{duplex:'half'}:{}),cache:'no-store',redirect:'manual',signal:AbortSignal.any([request.signal,AbortSignal.timeout(longRequest?1800000:paymentWrite?65000:25000)])});
  // Never turn a proxy/CDN response into a pretend anonymous session or an empty catalog.
  if(response.status>=300&&response.status<400&&response.status!==304)return error(502,'API_REDIRECT','The backend redirected the API request. Check the configured backend origin.');
  const outgoing=new Headers();response.headers.forEach((value,key)=>{if(!HOP.has(key.toLowerCase()))outgoing.set(key,value);});
  for(const [key,value] of Object.entries(PRIVATE))outgoing.set(key,value);
  if(/^\/api\/media\/[a-f0-9]{24}$/i.test(path)&&method==='GET'&&response.ok&&response.headers.get('X-SA-Public-Image')==='1'&&/^image\//.test(response.headers.get('content-type')||'')){
   outgoing.set('Cache-Control','private, max-age=300');outgoing.delete('Pragma');
  }
  outgoing.delete('X-SA-Public-Image');
  const cookies=response.headers.getSetCookie?.()||[];
  for(const cookie of cookies){
   // All Academy session cookies are host-only: the browser sends them to the frontend document gate and /api.
   if(/^sa_[a-z0-9_]+=/.test(cookie))outgoing.append('Set-Cookie',cookie.replace(/;\s*domain=[^;]*/ig,''));
  }
  return new Response(['HEAD'].includes(method)||[204,304].includes(response.status)?null:response.body,{status:response.status,headers:outgoing});
 }catch(e){return error(e?.name==='TimeoutError'||e?.name==='AbortError'?504:502,'API_UNAVAILABLE','The Academy service is temporarily unavailable. Please retry; no payment has been retried automatically.');}
}
