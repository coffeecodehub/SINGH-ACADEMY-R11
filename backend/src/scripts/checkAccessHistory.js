/** READ-ONLY legacy-data audit. Does not overwrite access dates, grant invoices,
 * repair payments, seed data, or connect to a guessed database. */
import 'dotenv/config';import fs from 'node:fs';import path from 'node:path';import mongoose from 'mongoose';import {fileURLToPath} from 'node:url';
import {invoiceCourseGrants} from '../utils/courseEntitlements.js';
const root=fileURLToPath(new URL('../../..',import.meta.url));
const report={startedAt:new Date().toISOString(),readOnly:true,status:'running',users:0,invoices:0,issues:[],enrollmentWarnings:0,enrollmentIssues:[],pendingRecovery:0};
try{
 const uri=process.env.MONGODB_URI||process.env.MONGO_URI;if(!uri)throw new Error('MONGODB_URI is required.');
 mongoose.set('autoIndex',false);mongoose.set('autoCreate',false);await mongoose.connect(uri,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});report.databaseName=mongoose.connection.name;
 const {default:Invoice}=await import('../models/Invoice.js');const {default:Enrollment}=await import('../models/Enrollment.js');
 let key=null,group=[];const flush=()=>{if(!group.length)return;report.issues.push(...invoiceCourseGrants(group).issues);report.users++;group=[];};
 for await(const row of Invoice.find({kind:'course'}).sort({user:1,paidAt:1,_id:1}).lean().cursor()){
  if(String(row.user)!==key){flush();key=String(row.user);}group.push(row);report.invoices++;
 }flush();
 for await(const row of Enrollment.find({source:{$in:['provider','manual_payment']}}).select('_id user courseSlug invoice').lean().cursor()){
  const matching=row.invoice&&await Invoice.exists({_id:row.invoice,user:row.user,kind:'course',courseSlug:row.courseSlug});
  if(!matching){report.enrollmentWarnings++;if(report.enrollmentIssues.length<500)report.enrollmentIssues.push({enrollmentId:String(row._id),reason:'Missing or mismatched owned course invoice; enrollment mirror alone does not grant access'});}
 }
 const {default:CheckoutOrder}=await import('../models/CheckoutOrder.js');
 report.pendingRecovery=await CheckoutOrder.countDocuments({$or:[{recoveryRequired:true,status:{$in:['creating','pending']}},{status:{$in:['creating','pending']},providerOrderId:{$exists:false},createdAt:{$lt:new Date(Date.now()-60*60*1000)}}]});
 report.status=report.issues.length||report.enrollmentWarnings||report.pendingRecovery?'needs_review':'passed';if(report.status!=='passed')process.exitCode=1;
}catch(error){report.status='failed';report.error=error.code?String(error.code):error.name;process.exitCode=1;}
finally{await mongoose.disconnect();report.finishedAt=new Date().toISOString();fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa','access-history.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({readOnly:true,status:report.status,users:report.users,invoices:report.invoices,issues:report.issues.length,enrollmentWarnings:report.enrollmentWarnings,pendingRecovery:report.pendingRecovery}));}
