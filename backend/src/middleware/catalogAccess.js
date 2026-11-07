import {requireAuth} from './auth.js';
/** Only public landing DTOs + branding may bypass the catalog session gate. */
export function catalogAccess(req,res,next){
 const path=req.originalUrl.split('?')[0].replace(/\/$/,'');
 if(req.method==='GET'&&['/api/content/landing','/api/content/site'].includes(path))return next();
 return requireAuth(req,res,next);
}
