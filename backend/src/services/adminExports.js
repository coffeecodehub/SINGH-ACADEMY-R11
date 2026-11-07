/** Explicit administrative export projections. No caller-selected fields or models. */
import ContactMessage from '../models/ContactMessage.js';
import Review from '../models/Review.js';
import Invoice from '../models/Invoice.js';
import Subscription from '../models/Subscription.js';
import CourseCompletion from '../models/CourseCompletion.js';
import Notification from '../models/Notification.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import {businessError,escapeRegex,strictDate,invoiceBalance,invoiceState} from '../utils/business.js';
import {subscriptionFilters} from '../utils/adminSubscriptions.js';
import {subscriptionDisplay} from '../utils/subscriptionDisplay.js';
import {reviewStatusQuery,adminReviewDTO} from '../utils/reviews.js';
import {csvCell} from '../utils/studentCsv.js';
const iso=v=>{const d=v?new Date(v):null;return d&&Number.isFinite(+d)?d.toISOString():'';};
const amount=v=>Number.isSafeInteger(v)?(v/100).toFixed(2):'';
const userJoin=[{$lookup:{from:'users',localField:'user',foreignField:'_id',pipeline:[{$project:{name:1,email:1,status:1}}],as:'student'}},{$set:{student:{$arrayElemAt:['$student',0]}}}];
function scalar(query,key){const v=query[key];if(v==null||v==='')return '';if(typeof v!=='string'||v.length>200)throw businessError('Invalid export '+key+'.',400);return v.trim();}
function statusFilter(filter,value,allowed){if(value&&!allowed.includes(value))throw businessError('Invalid export status.',400);if(value)filter.status=value;}
export function exportQuery(kind,query={},now=new Date()){
 const q=scalar(query,'q').slice(0,120),status=scalar(query,'status'),filter={},regex=q?{$regex:escapeRegex(q),$options:'i'}:null;
 if(kind==='forms'){statusFilter(filter,status,['new','responded','closed']);if(regex)filter.$or=['name','email','topic','message'].map(k=>({[k]:regex}));}
 else if(kind==='reviews'){if(status){if(!['pending','approved','rejected'].includes(status))throw businessError('Invalid review visibility.',400);filter.$and=[reviewStatusQuery(status)];}const rating=scalar(query,'rating');if(rating){if(!/^[1-5]$/.test(rating))throw businessError('Invalid review rating.',400);filter.rating=Number(rating);}if(regex)filter.$or=[{name:regex},{message:regex}];}
 else if(kind==='certificates'){statusFilter(filter,status,['pending','issued','revoked','retry_requested']);if(regex)filter.$or=['studentName','courseTitle','certificateNumber'].map(k=>({[k]:regex}));}
 else if(kind==='notifications'){filter.type={$in:['course_completed','certificate_issued','course_retry','certificate_revoked']};if(scalar(query,'unread')==='true')filter.read=false;}
 else if(kind==='requests'){statusFilter(filter,status,['new','contacted','invoiced','closed']);if(regex)filter.title=regex;}
 else if(['purchases','section-purchases'].includes(kind)){
  filter.kind=kind==='purchases'?'course':'section';
  if(status&&!['paid','open','partial','overdue','void'].includes(status))throw businessError('Invalid purchase status.',400);
  if(['paid','void'].includes(status))filter.status=status;
  else if(status){filter.status='open';filter.dueAt=status==='overdue'?{$lt:now}:{$gte:now};if(status!=='overdue')filter.paidMinor=status==='partial'?{$gt:0}:0;}
  const from=scalar(query,'from'),to=scalar(query,'to');if(from||to){const start=from?strictDate(from,'From date'):null,end=to?new Date(+strictDate(to,'To date')+86400000):null;if(start&&end&&start>=end)throw businessError('From date must be before the end date.',400);filter.createdAt={...(start?{$gte:start}:{}),...(end?{$lt:end}:{})};}
 }
 else if(kind==='subscriptions'){const parsed=subscriptionFilters({q,status,plan:scalar(query,'plan'),from:scalar(query,'from'),to:scalar(query,'to')},now);return {filter:parsed.filter,search:parsed.search};}
 else throw businessError('Unknown export dataset.',404);
 return {filter,search:regex};
}
const definitions={
 forms:{Model:ContactMessage,fields:'name email topic message status createdAt updatedAt',headers:['Name','Email','Topic','Message','Status','Submitted (UTC)','Updated (UTC)'],row:x=>[x.name,x.email,x.topic,x.message,x.status,iso(x.createdAt),iso(x.updatedAt)]},
 reviews:{Model:Review,fields:'name rating message status approvedBy approvedAt createdAt updatedAt',headers:['Reviewer','Rating','Review','Visibility','Submitted (UTC)','Updated (UTC)'],row:x=>[x.name,x.rating,x.message,adminReviewDTO(x).status,iso(x.createdAt),iso(x.updatedAt)]},
 certificates:{Model:CourseCompletion,fields:'user studentName courseTitle courseSlug completedAt status certificateNumber issuedAt attemptNumber',populate:['user','name email'],headers:['Student','Email','Course','Course slug','Completed (UTC)','Status','Certificate number','Issued (UTC)','Attempt'],row:x=>[x.user?.name||x.studentName,x.user?.email,x.courseTitle,x.courseSlug,iso(x.completedAt),x.status,x.certificateNumber,iso(x.issuedAt),x.attemptNumber]},
 notifications:{Model:Notification,fields:'title message type read createdAt',headers:['Title','Message','Type','Read','Created (UTC)'],row:x=>[x.title,x.message,x.type,x.read?'Yes':'No',iso(x.createdAt)]},
 requests:{Model:PurchaseRequest,fields:'user kind product title message quotedAmountMinor currency status createdAt invoice',populate:['user','name email'],headers:['Student','Email','Kind','Product','Title','Message','Quoted amount','Currency','Status','Received (UTC)'],row:x=>[x.user?.name,x.user?.email,x.kind,x.product,x.title,x.message,amount(x.quotedAmountMinor),x.currency,x.status,iso(x.createdAt)]}
};
const purchaseHeaders=['Student','Email','Kind','Title','Product','Invoice','Currency','Total','Paid','Credited','Outstanding','Status','Paid (UTC)','Created (UTC)','Access start (UTC)','Original access end (UTC)','Access cancelled (UTC)','Sandbox'];
const purchaseFields={number:1,title:1,courseSlug:1,sectionSlug:1,kind:1,currency:1,totalMinor:1,paidMinor:1,creditedMinor:1,status:1,dueAt:1,paidAt:1,createdAt:1,accessStartsAt:1,accessExpiresAt:1,accessCancelledAt:1,testMode:1,user:1};
export function adminExportDefinition(kind,query={},now=new Date()){
 const {filter,search}=exportQuery(kind,query,now);
 if(['purchases','section-purchases'].includes(kind)){
  const pipeline=[{$match:filter},{$project:purchaseFields},...userJoin,...(search?[{$match:{$or:[{title:search},{courseSlug:search},{sectionSlug:search},{number:search},{'student.name':search},{'student.email':search}]}}]:[]),{$sort:{createdAt:-1,_id:-1}}];
  return {headers:purchaseHeaders,cursor:()=>Invoice.aggregate(pipeline).cursor({batchSize:500}),row:x=>[x.student?.name,x.student?.email,x.kind,x.title,x.courseSlug||x.sectionSlug,x.number,x.currency,amount(x.totalMinor),amount(x.paidMinor),amount(x.creditedMinor),amount(invoiceBalance(x)),invoiceState(x,now),iso(x.paidAt),iso(x.createdAt),iso(x.accessStartsAt),iso(x.accessExpiresAt),iso(x.accessCancelledAt),x.testMode?'Yes':'No']};
 }
 if(kind==='subscriptions'){
  const fields={user:1,plan:1,status:1,startsAt:1,endsAt:1,createdAt:1,currency:1,priceMinor:1,testMode:1};
  const pipeline=[{$match:filter},{$project:fields},...userJoin,...(search?[{$match:{$or:[{plan:search},{'student.name':search},{'student.email':search}]}}]:[]),{$sort:{createdAt:-1,_id:-1}}];
  return {headers:['Student','Email','Plan','Status','Currency','Term price','Access start (UTC)','Access end (UTC)','Created (UTC)','Sandbox'],cursor:()=>Subscription.aggregate(pipeline).cursor({batchSize:500}),row:x=>[x.student?.name,x.student?.email,x.plan,subscriptionDisplay(x,now).effectiveStatus,x.currency,amount(x.priceMinor),iso(x.startsAt),iso(x.endsAt),iso(x.createdAt),x.testMode?'Yes':'No']};
 }
 const def=definitions[kind];return {...def,cursor:()=>{let find=def.Model.find(filter).select(def.fields).sort({createdAt:-1,_id:-1});if(def.populate)find=find.populate(...def.populate);return find.lean().cursor({batchSize:500});}};
}
export const csvLine=values=>values.map(csvCell).join(',')+'\r\n';
