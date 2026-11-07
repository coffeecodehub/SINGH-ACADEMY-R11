import User from '../models/User.js';
import AuthSession from '../models/AuthSession.js';
import {COOKIE_NAMES,requestedPortal,validPortal,validSessionToken,hashToken,isSessionUsable,normalizeRole,adminMfaRequired} from '../utils/security.js';
export {normalizeRole};
const requestSession=Symbol('academy.request.session');
export function resolveSession(req,portal=requestedPortal(req)){
 if(!req[requestSession])req[requestSession]=new Map();
 if(!req[requestSession].has(portal))req[requestSession].set(portal,loadSession(req,portal));
 return req[requestSession].get(portal);
}
async function loadSession(req,portal){
 if(!validPortal(portal)||req.cookies?.['sa_logout_'+portal]==='1')return null;
 const token=req.cookies?.[COOKIE_NAMES[portal]];if(!validSessionToken(token))return null;
 const session=await AuthSession.findOne({tokenHash:hashToken(token),portal,revokedAt:null}).lean();if(!session)return null;
 const user=await User.findById(session.user).select('+tokenVersion');
 if(!isSessionUsable(session,user,portal))return null;
 // Ignore legacy setup-only sessions; MFA was removed by the Academy policy.
 session.setupOnly=false;
 if(Date.now()-new Date(session.lastSeenAt).getTime()>60000)await AuthSession.updateOne({_id:session._id,revokedAt:null},{$set:{lastSeenAt:new Date()}});
 return {user,session,portal};
}
export async function requireAuth(req,res,next){try{
 const resolved=await resolveSession(req);if(!resolved)return res.status(401).json({success:false,code:'SESSION_REQUIRED',message:'Please sign in to this portal.'});
 Object.assign(req,{user:resolved.user,authSession:resolved.session,authPortal:resolved.portal});req.user.normalizedRole=normalizeRole(req.user.role);
 next();
 }catch(e){next(e);}}
export function requireRole(...roles){const allowed=new Set(roles.map(normalizeRole));return(req,res,next)=>{
 const role=req.user?.normalizedRole||normalizeRole(req.user?.role);
 if(allowed.has(role))return next();return res.status(403).json({success:false,message:'This portal does not have permission for that action.'});
};}
