import {hostedEnvironment} from '../utils/deploymentMode.js';
import crypto from 'node:crypto';
/** No request bodies, cookies, email addresses or token-bearing URLs are written to access logs. */
export function httpSafety(req,res,next){
  const started=performance.now();req.requestId=crypto.randomUUID();
  res.set('CDN-Cache-Control','no-store');res.set('Surrogate-Control','no-store');res.set('X-LiteSpeed-Cache-Control','no-cache');
  res.vary('Cookie');res.vary('X-SA-Portal');
  res.set('X-Request-ID',req.requestId);res.set('X-Content-Type-Options','nosniff');
  res.set('X-Frame-Options','DENY');res.set('Referrer-Policy','no-referrer');res.set('Cache-Control','private, no-store');
  if(hostedEnvironment())res.set('Strict-Transport-Security','max-age=31536000');
  const originalJson=res.json.bind(res);
  res.json=body=>{if(!res.headersSent)res.set('Server-Timing',`app;dur=${(performance.now()-started).toFixed(1)}`);return originalJson(body);};
  res.on('finish',()=>{
    const duration=Math.round(performance.now()-started);
    if(res.statusCode>=500 || (process.env.LOG_REQUESTS==='true'&&!req.path.startsWith('/api/health'))) {
      console.log(JSON.stringify({event:'http',requestId:req.requestId,method:req.method,route:req.route?.path||'api',status:res.statusCode,durationMs:duration}));
    }
  });
  next();
}
export function plainQuery(req,res,next){
  if(Object.values(req.query||{}).some(v=>typeof v!=='string'))return res.status(400).json({success:false,message:'Query parameters must be single text values.'});
  next();
}
