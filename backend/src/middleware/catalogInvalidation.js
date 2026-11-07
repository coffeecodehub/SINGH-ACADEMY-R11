import {catalogCache} from '../services/catalogCache.js';
/** Clear published CMS cache only after a successful content write. Other processes
 * pick changes up within the bounded 10s TTL. No database resets or learner writes. */
export function catalogInvalidation(req,res,next){
 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&/^\/api\/(?:admin|academy-admin)(?:\/|$)/.test(req.originalUrl||''))res.once('finish',()=>{if(res.statusCode>=200&&res.statusCode<300)catalogCache.clear();});
 next();
}
