/** Explicit localhost-only development mode. This flag never relaxes hosted scanning. */
export function localhostDevelopment(env=process.env){
 if(env.NODE_ENV!=='development'||env.DEPLOYMENT_STAGE!=='development')return false;
 const values=[env.FRONTEND_URL,env.FRONTEND_URLS].filter(Boolean).flatMap(value=>value.split(',').map(part=>part.trim()));
 if(!values.length)return false;
 return values.every(value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{return false;}});
}
export function localUnscannedUploads(env=process.env){return env.LOCAL_UPLOADS_UNSCANNED==='true'&&localhostDevelopment(env);}
/** Do not trust Express req.ip/trust-proxy for this exception. Inspect the actual peer. */
export function localhostUploadRequest(req){
 if(!req||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress))return false;
 const headers=req.headers||{};
 const localOrigin=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{return false;}};
 if(typeof headers.host!=='string'||!localOrigin('http://'+headers.host))return false;
 if(headers.origin&&!localOrigin(headers.origin))return false;
 // A public reverse proxy may connect over loopback. Never apply the exception
 // when its forwarded identity says that the browser/host is public.
 for(const key of ['x-forwarded-for','x-real-ip','x-sa-client-ip'])if(headers[key]&&String(headers[key]).split(',').some(ip=>!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip.trim())))return false;
 for(const key of ['x-forwarded-host'])if(headers[key]&&String(headers[key]).split(',').some(host=>!localOrigin('http://'+host.trim())))return false;
 if(headers.forwarded||headers['x-sa-proxy-identity'])return false;
 return true;
}
