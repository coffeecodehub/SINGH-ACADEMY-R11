import {verifyProxyIdentity} from '../utils/proxyIdentity.js';
/** Installed AFTER provider webhook routes. Invalid supplied attestations fail
 * closed, while optional deployments retain the existing IP limits unchanged. */
export function proxyIdentity(req,res,next){
 const payload=req.get('X-SA-Network'),signature=req.get('X-SA-Network-Signature');
 const required=process.env.SA_REQUIRE_PROXY_IDENTITY==='true'&&!['GET','HEAD','OPTIONS'].includes(req.method);
 if(!payload&&!signature){if(required)return res.status(503).json({success:false,code:'PROXY_IDENTITY_REQUIRED',message:'The trusted website connection is not configured. Contact the Academy.'});return next();}
 const ip=verifyProxyIdentity(payload,signature,{method:req.method,path:req.originalUrl,
  origin:req.get('origin')||'',portal:req.get('x-sa-portal')||'',key:req.get('idempotency-key')||'',cookie:req.get('cookie')||''},process.env.SA_PROXY_SHARED_SECRET);
 if(!ip)return res.status(403).json({success:false,code:'PROXY_IDENTITY_INVALID',message:'The trusted website connection could not be verified.'});
 req.saClientIp=ip;req.saProxyVerified=true;return next();
}
