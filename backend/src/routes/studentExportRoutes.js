import {Router} from 'express';
import User from '../models/User.js';
import {requireAuth,requireRole} from '../middleware/auth.js';
import {rateLimit} from '../middleware/rateLimit.js';
import {audit} from '../services/audit.js';
import {studentCsvHeader,studentCsvRow} from '../utils/studentCsv.js';
const r=Router();
r.use(requireAuth,requireRole('client_admin','super_admin'));
async function write(res,value){
 if(res.destroyed)return false;if(res.write(value))return true;
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{res.removeListener('drain',drained);res.removeListener('close',closed);res.removeListener('error',failed);};
  const drained=()=>{cleanup();resolve(!res.destroyed);},closed=()=>{cleanup();resolve(false);},failed=error=>{cleanup();reject(error);};
  res.once('drain',drained);res.once('close',closed);res.once('error',failed);
 });
}
r.get('/export.csv',rateLimit('student-csv-export',5,900000,{authenticated:true}),async(req,res,next)=>{
 // Fixed role and explicit projection: query parameters cannot request admin,
 // password, session, payment or removed-user fields. A cursor exports every page.
 const cursor=User.find({role:'student',deletedAt:null}).select('name email phone country createdAt status -_id').sort({createdAt:1,_id:1}).lean().cursor({batchSize:500});
 const disconnected=()=>{cursor.close().catch(()=>{});};res.once('close',disconnected);let count=0;
 try{
  let item=await cursor.next();
  res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition',`attachment; filename="singh-academy-students-${new Date().toISOString().slice(0,10)}.csv"`);res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');
  if(!await write(res,'\uFEFF'+studentCsvHeader))return;
  while(item){if(!await write(res,studentCsvRow(item)))return;count++;item=await cursor.next();}
  await audit(req,{scope:'academy',action:'students.csv_exported',entityType:'student_export',changes:{rows:count}}).catch(error=>console.error('Student export audit failed:',error.code||error.name));
  res.end();
 }catch(error){if(!res.destroyed){if(res.headersSent)res.destroy(error);else next(error);}}
 finally{res.removeListener('close',disconnected);await cursor.close().catch(()=>{});}
});
export default r;
