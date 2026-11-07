import {privateKey} from '../utils/security.js';
import {Router} from 'express';import {requireAuth,requireRole} from '../middleware/auth.js';
import {pagination,businessError,escapeRegex} from '../utils/business.js';import {objectId} from '../services/businessRead.js';
import Course from '../models/Course.js';import TeamMember from '../models/TeamMember.js';import Event from '../models/Event.js';
import Notification from '../models/Notification.js';import CourseCompletion from '../models/CourseCompletion.js';
import {rateLimit} from '../middleware/rateLimit.js';
import {academyOverview} from '../services/academyOverview.js';
import {subscriptionFilters} from '../utils/adminSubscriptions.js';
import {subscriptionDisplay} from '../utils/subscriptionDisplay.js';
import {normalizeCountry} from '../utils/countries.js';
import {confirmIdentity} from '../services/identity.js';
import {audit} from '../services/audit.js';
import {transaction} from '../services/businessWrite.js';
import {removeStudent} from '../services/studentRemoval.js';
import {reviewStatusQuery,adminReviewDTO} from '../utils/reviews.js';
import Subscription from '../models/Subscription.js';import User from '../models/User.js';import SiteContent from '../models/SiteContent.js';import ContactMessage from '../models/ContactMessage.js';import Review from '../models/Review.js';import AdminNavState from '../models/AdminNavState.js';import Invoice from '../models/Invoice.js';import Payment from '../models/Payment.js';import Enrollment from '../models/Enrollment.js';import {invoiceBalance,invoiceState} from '../utils/business.js';
const r=Router(),students=Router();
// Both administrators manage student accounts. Other academy billing/activity
// controls retain their existing Client Admin boundary.
students.use('/students',requireAuth,requireRole('client_admin','super_admin'),(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
r.use(students);r.use(requireAuth,requireRole('client_admin'));
r.get('/security/network',async(req,res)=>res.json({success:true,proxyVerified:req.saProxyVerified===true,networkFingerprint:privateKey('network-check:'+String(req.saClientIp||req.ip||'unknown')).slice(0,24)}));
const notificationFilter={type:{$in:['course_completed','certificate_issued','course_retry','certificate_revoked']}};
r.get('/overview',async(req,res)=>res.json(await academyOverview(true)));
const navSections={students:'studentsSeenAt',forms:'formsSeenAt',reviews:'reviewsSeenAt',subscriptions:'subscriptionsSeenAt',certificates:'certificatesSeenAt',notifications:'notificationsSeenAt'};
function after(date){return date?{$gt:new Date(date)}:{$gt:new Date(0)};}
r.get('/nav-counts',async(req,res)=>{
 const state=await AdminNavState.findOne({user:req.user._id}).lean();
 const [students,forms,reviews,subscriptions,certificates,notifications]=await Promise.all([
  User.countDocuments({role:'student',deletedAt:null,$or:[{createdAt:after(state?.studentsSeenAt)},{lastLoginAt:after(state?.studentsSeenAt)}]}),
  ContactMessage.countDocuments({createdAt:after(state?.formsSeenAt)}),
  Review.countDocuments({createdAt:after(state?.reviewsSeenAt)}),
  Subscription.countDocuments({createdAt:after(state?.subscriptionsSeenAt)}),
  CourseCompletion.countDocuments({completedAt:after(state?.certificatesSeenAt)}),
  Notification.countDocuments({...notificationFilter,createdAt:after(state?.notificationsSeenAt)})
 ]);
 res.json({success:true,counts:{students,forms,reviews,subscriptions,certificates,notifications}});
});
r.post('/nav-seen/:section',rateLimit('academy-nav-seen',120,60000,{authenticated:true}),async(req,res)=>{
 const field=navSections[req.params.section];if(!field)throw businessError('Unknown admin section.',400);
 await AdminNavState.findOneAndUpdate({user:req.user._id},{$set:{[field]:new Date()}},{upsert:true,new:true,setDefaultsOnInsert:true});
 res.json({success:true});
});
students.get('/students',async(req,res)=>{
 const {page,pageSize,skip}=pagination(req.query),filter={role:'student',deletedAt:null};if(req.query.q){const q=String(req.query.q).slice(0,120).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');filter.$or=[{name:{$regex:q,$options:'i'}},{email:{$regex:q,$options:'i'}}];}
 const [items,total]=await Promise.all([User.find(filter).select('name email country status removalState removalRequestedAt createdAt lastLoginAt loginCount').sort({createdAt:-1,_id:-1}).skip(skip).limit(pageSize).lean(),User.countDocuments(filter)]);
 res.json({success:true,items,total,page,pageSize});
});
students.patch('/students/:id/country',rateLimit('student-country-admin',20,900000,{authenticated:true}),async(req,res)=>{
 await confirmIdentity(req);
 const country=normalizeCountry(req.body?.country);if(!country)throw businessError('Select a valid country of residence.',400);
 await transaction(async session=>{
  const user=await User.findOneAndUpdate({_id:objectId(req.params.id),role:'student',removalState:null,deletedAt:null},{$set:{country}},{new:true,runValidators:true,session});
  if(!user)throw businessError('Student account not found.',404);
  await audit(req,{scope:'academy',action:'student.country_updated',targetUser:user._id,entityType:'user',entityId:String(user._id),changes:{country}},session);
 });
 res.json({success:true,country,message:'Student country updated. Existing paid purchases keep their original price.'});
});
students.delete('/students/:id',rateLimit('student-removal-admin',20,900000,{authenticated:true}),async(req,res)=>{
 const removed=await removeStudent(req,req.params.id);res.status(removed.removed?200:202).json(removed);
});
r.get('/forms',async(req,res)=>{
 const {page,pageSize,skip}=pagination(req.query),filter={};if(req.query.status){if(!['new','responded','closed'].includes(String(req.query.status)))throw businessError('Invalid form status.',400);filter.status=String(req.query.status);}if(req.query.q){const q=String(req.query.q).slice(0,120).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');filter.$or=[{name:{$regex:q,$options:'i'}},{email:{$regex:q,$options:'i'}},{topic:{$regex:q,$options:'i'}},{message:{$regex:q,$options:'i'}}];}
 const [items,total,newCount]=await Promise.all([ContactMessage.find(filter).sort({createdAt:-1,_id:-1}).skip(skip).limit(pageSize).lean(),ContactMessage.countDocuments(filter),ContactMessage.countDocuments({status:'new'})]);
 res.json({success:true,items,total,newCount,page,pageSize});
});
r.get('/reviews',async(req,res)=>{
 const {page,pageSize,skip}=pagination(req.query),filter={};
 if(req.query.q){const q=String(req.query.q).slice(0,120);const regex={$regex:escapeRegex(q),$options:'i'};filter.$or=[{name:regex},{message:regex}];}
 if(req.query.status){const status=String(req.query.status);if(!['pending','approved','rejected'].includes(status))throw businessError('Invalid review visibility.',400);filter.$and=[reviewStatusQuery(status)];}
 if(req.query.rating){const rating=Number(req.query.rating);if(!Number.isInteger(rating)||rating<1||rating>5)throw businessError('Invalid review rating.',400);filter.rating=rating;}
 const [items,total]=await Promise.all([Review.find(filter).select('name rating message status approvedBy approvedAt revision createdAt updatedAt').sort({updatedAt:-1,createdAt:-1,_id:-1}).skip(skip).limit(pageSize).lean(),Review.countDocuments(filter)]);
 res.set('Cache-Control','private, no-store');res.json({success:true,items:items.map(adminReviewDTO),total,page,pageSize});
});
r.patch('/forms/:id/status',rateLimit('academy-form-status',60,60000,{authenticated:true}),async(req,res)=>{
 const status=String(req.body?.status||'');if(!['new','responded','closed'].includes(status))throw businessError('Choose new, responded or closed.',400);
 const item=await ContactMessage.findOneAndUpdate({_id:objectId(req.params.id)},{$set:{status,updatedBy:req.user._id}},{new:true});if(!item)throw businessError('Form submission not found.',404);res.json({success:true,item});
});

r.get('/notifications',async(req,res)=>{const {page,pageSize,skip}=pagination(req.query),filter={...notificationFilter};if(req.query.unread==='true')filter.read=false;const [items,total,unread]=await Promise.all([Notification.find(filter).select('title message type user entityId link read createdAt').sort({createdAt:-1,_id:-1}).skip(skip).limit(pageSize).lean(),Notification.countDocuments(filter),Notification.countDocuments({...notificationFilter,read:false})]);res.json({success:true,items,total,page,pageSize,unread});});
r.patch('/notifications/:id/read',rateLimit('academy-notification',100,60000,{authenticated:true}),async(req,res)=>{const item=await Notification.findOneAndUpdate({_id:objectId(req.params.id),...notificationFilter},{$set:{read:true}},{new:true});if(!item)throw businessError('Notification not found.',404);res.json({success:true});});

r.get('/purchases',async(req,res)=>{
 const {page,pageSize,skip}=pagination(req.query),now=new Date(),filter={kind:'course'};
 if(req.query.q){
  const q=String(req.query.q).slice(0,120);
  const regex={$regex:escapeRegex(q),$options:'i'};
  const users=await User.find({role:'student',$or:[{name:regex},{email:regex}]}).select('_id').limit(1000).lean();
  filter.$or=[{title:regex},{courseSlug:regex},{number:regex},{user:{$in:users.map(u=>u._id)}}];
 }
 if(req.query.status){
  const status=String(req.query.status);
  if(!['paid','open','partial','overdue','void'].includes(status))throw businessError('Invalid purchase status.',400);
  if(status==='paid')filter.status='paid';
  else if(status==='void')filter.status='void';
  else if(status==='overdue'){filter.status='open';filter.dueAt={$lt:now};}
  else if(status==='partial'){filter.status='open';filter.paidMinor={$gt:0};filter.dueAt={$gte:now};}
  else if(status==='open'){filter.status='open';filter.paidMinor=0;filter.dueAt={$gte:now};}
 }
 if(req.query.from||req.query.to){
  filter.createdAt={};
  if(req.query.from)filter.createdAt.$gte=new Date(String(req.query.from)+'T00:00:00.000Z');
  if(req.query.to)filter.createdAt.$lte=new Date(String(req.query.to)+'T23:59:59.999Z');
 }
 const [items,total]=await Promise.all([
  Invoice.find(filter).select('number title courseSlug currency totalMinor paidMinor creditedMinor dueAt status paidAt accessStartsAt accessExpiresAt noScheduledExpiry createdAt testMode user origin discountFull coupon subtotalMinor discountMinor').populate('user','name email status').sort({createdAt:-1,_id:-1}).skip(skip).limit(pageSize).lean(),
  Invoice.countDocuments(filter)
 ]);
 const ids=items.map(i=>i._id);
 const [payments,enrollments]=await Promise.all([
  Payment.find({invoice:{$in:ids},status:'paid'}).select('invoice provider providerPaymentId paidAt amountMinor currency').sort({paidAt:-1,_id:-1}).lean(),
  Enrollment.find({invoice:{$in:ids}}).select('invoice courseSlug source accessStartsAt accessExpiresAt').lean()
 ]);
 const rows=items.map(i=>{
  const payment=payments.find(p=>String(p.invoice)===String(i._id));
  const enrollment=enrollments.find(e=>String(e.invoice)===String(i._id));
  const effectiveStatus=invoiceState(i,now);
  return {...i,balanceMinor:invoiceBalance(i),effectiveStatus,payment,enrollment};
 });
 res.json({success:true,items:rows,total,page,pageSize,serverNow:now});
});

r.get('/subscriptions',async(req,res)=>{
 const {page,pageSize,skip}=pagination(req.query),now=new Date(),{filter,search}=subscriptionFilters(req.query,now);
 let searchTruncated=false;
 if(search){const users=await User.find({role:'student',$or:[{name:search},{email:search}]}).select('_id').limit(1001).lean();searchTruncated=users.length>1000;const match={$or:[{plan:search},{user:{$in:users.slice(0,1000).map(u=>u._id)}}]};filter.$and=[match];}
 const [items,total,site]=await Promise.all([Subscription.find(filter).select('user plan status startsAt endsAt durationMonths invoice createdAt testMode currency priceMinor').populate('user','name email status').populate('invoice','number paidAt totalMinor currency').sort({createdAt:-1,_id:-1}).skip(skip).limit(pageSize).lean(),Subscription.countDocuments(filter),SiteContent.findOne({key:'membershipPlans'}).select('value').lean()]);
 res.json({success:true,items:items.map(t=>({...t,...subscriptionDisplay(t,now),entryDate:t.createdAt,subscriptionDate:t.invoice?.paidAt||null})),total,page,pageSize,plans:(Array.isArray(site?.value)?site.value:[]).map(p=>p.name),serverNow:now,searchLimit:1000,searchTruncated});
});
export default r;
