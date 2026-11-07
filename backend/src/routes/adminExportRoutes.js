import {Router} from 'express';
import {requireAuth,normalizeRole} from '../middleware/auth.js';
import {rateLimit} from '../middleware/rateLimit.js';
import {audit} from '../services/audit.js';
import {businessError} from '../utils/business.js';
import {adminExportDefinition,csvLine} from '../services/adminExports.js';
const r=Router();
r.use(requireAuth);
// Operational records retain Client Admin's existing boundary. Builder-team
// Super Admin may export the reviews it can already administer, never finance.
r.get('/:kind.csv',rateLimit('admin-data-export',60,900000,{authenticated:true}),async(req,res,next)=>{
 const kind=req.params.kind;
 const role=req.user.normalizedRole||normalizeRole(req.user.role);
 if(role!=='client_admin'&&!(role==='super_admin'&&kind==='reviews'))throw businessError('This workspace cannot export these records.',403);
 const definition=adminExportDefinition(kind,req.query),cursor=definition.cursor();let count=0;
 const disconnected=()=>{cursor.close().catch(()=>{});};res.once('close',disconnected);
 async function write(value){if(res.destroyed)return false;if(res.write(value))return true;return new Promise((resolve,reject)=>{const cleanup=()=>{res.removeListener('drain',drain);res.removeListener('close',close);res.removeListener('error',error);},drain=()=>{cleanup();resolve(!res.destroyed);},close=()=>{cleanup();resolve(false);},error=e=>{cleanup();reject(e);};res.once('drain',drain);res.once('close',close);res.once('error',error);});}
 try{
  await audit(req,{scope:'academy',action:'data.csv_export_requested',entityType:kind,changes:{filtered:true}});
  let item=await cursor.next();res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="singh-academy-${kind}-${new Date().toISOString().slice(0,10)}.csv"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  if(!await write('\uFEFF'+csvLine(definition.headers)))return;
  while(item){if(!await write(csvLine(definition.row(item))))return;count++;item=await cursor.next();}
  await audit(req,{scope:'academy',action:'data.csv_exported',entityType:kind,changes:{rows:count}}).catch(e=>console.error('Export audit failed:',e.code||e.name));res.end();
 }catch(e){if(!res.destroyed){if(res.headersSent)res.destroy(e);else next(e);}}
 finally{res.removeListener('close',disconnected);await cursor.close().catch(()=>{});}
});
export default r;
