import {enqueueWebinarAnnouncements,webinarDeliveryContent} from './webinarNotifications.js';
import crypto from 'node:crypto';
import StudentNotification from '../models/StudentNotification.js';
import Invoice from '../models/Invoice.js';
import {envInteger} from '../utils/deployment.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import {subscriptionNotice,inReminderWindow,coursePurchaseNotice,welcomeNotice,sandboxEmailAllowed} from '../utils/subscriptionNotifications.js';
import {sendAcademyEmail} from '../utils/mailer.js';
import {frontendOrigin} from '../utils/commerce.js';
const DAY=86400000;
export async function queueSubscriptionConfirmation(term,session){
 const payload=subscriptionNotice(term,'subscription_confirmed');
 // Called in the verified-payment transaction. Retried fulfillment cannot enqueue a second message.
 return StudentNotification.updateOne({dedupeKey:payload.dedupeKey},{$setOnInsert:payload},{upsert:true,session});
}
export async function queueCourseConfirmation(order,invoice,session){
 const payload=coursePurchaseNotice(order,invoice);
 return StudentNotification.updateOne({dedupeKey:payload.dedupeKey},{$setOnInsert:payload},{upsert:true,session});
}
export async function queueWelcomeNotification(user){
 const payload=welcomeNotice(user);
 return StudentNotification.updateOne({dedupeKey:payload.dedupeKey},{$setOnInsert:payload},{upsert:true});
}
async function hasRenewal(term){return !!await Subscription.exists({_id:{$ne:term._id},user:term.user,status:'active',testMode:term.testMode===true?true:{$ne:true},startsAt:{$type:'date',$lte:term.endsAt},endsAt:{$type:'date',$gt:term.endsAt}});}
export async function enqueueExpiryReminders(now=new Date()){
 let queued=0,covered=0;
 const filter={status:'active',startsAt:{$lte:now},endsAt:{$gt:now,$lte:new Date(now.getTime()+7*DAY)},...(process.env.NODE_ENV==='production'?{testMode:{$ne:true}}:{})};
 // Cursor bounds memory, not the number of students who may receive a reminder.
 for await(const term of Subscription.find(filter).lean().cursor({batchSize:100})){
  if(!inReminderWindow(term,now))continue;
  const user=await User.exists({_id:term.user,role:'student',status:{$ne:'blocked'}});if(!user)continue;
  if(await hasRenewal(term)){covered++;continue;}
  const payload=subscriptionNotice(term,'subscription_expiring',now);
  try{const result=await StudentNotification.updateOne({dedupeKey:payload.dedupeKey},{$setOnInsert:payload},{upsert:true});if(result.upsertedCount)queued++;}
  catch(error){if(error.code!==11000)throw error;}// Another instance inserted the same unique reminder.
 }
 return {queued,covered};
}
export async function deliverStudentNotifications({now,clock=()=>new Date(),sendEmail=sendAcademyEmail,limit=100}={}){
 let claimed=0,sent=0,skipped=0,failed=0,previewed=0;
 for(let i=0;i<Math.min(Math.max(1,limit),200);i++){
  // A batch can outlive five minutes. Each claim needs its own current lease,
  // not a lease measured from the time the first message was claimed.
  // Explicit `now` retains the deterministic snapshot supported by callers.
  const token=crypto.randomUUID(),at=new Date(now===undefined?clock():now);
  const item=await StudentNotification.findOneAndUpdate({$or:[{emailState:{$in:['queued','deferred']},nextAttemptAt:{$lte:at}},{emailState:'sending',leaseUntil:{$lt:at}}]},{$set:{emailState:'sending',leaseToken:token,leaseUntil:new Date(at.getTime()+300000)},$inc:{attempts:1}},{new:true,sort:{nextAttemptAt:1,_id:1}});
  if(!item)break;claimed++;
  const finish=async data=>StudentNotification.updateOne({_id:item._id,leaseToken:token},{$set:data,$unset:{leaseToken:1,leaseUntil:1}});
  try{
   const [user,term,invoice]=await Promise.all([
    User.findById(item.user).select('email name role status emailVerified deletedAt removalState').lean(),
    item.subscription?Subscription.findById(item.subscription).lean():null,
    item.invoice?Invoice.findOne({_id:item.invoice,user:item.user}).lean():null
   ]);
   const subscriptionType=['subscription_confirmed','subscription_expiring'].includes(item.type);
   const unavailable=!user||user.role!=='student'||user.status==='blocked'||user.deletedAt||['pending','removed'].includes(user.removalState)||(subscriptionType&&(!term||String(term.user)!==String(item.user)||term.status==='cancelled'))||(item.type==='course_purchased'&&(!invoice||invoice.kind!=='course'||invoice.status!=='paid'));
   if(unavailable){await finish({emailState:'skipped',lastError:'account_or_term_unavailable'});skipped++;continue;}
   if(item.testMode&&!sandboxEmailAllowed(user.email)){await finish({emailState:'skipped',lastError:'sandbox_record'});skipped++;continue;}
   if(item.type==='subscription_expiring'&&(!inReminderWindow(term,at)||new Date(term.endsAt).getTime()!==new Date(item.termEnd).getTime()||await hasRenewal(term))){await finish({emailState:'skipped',lastError:'reminder_superseded'});skipped++;continue;}
   // Refresh wording after delays: never tell a student '7 days' when only 2 remain.
   const webinar=item.type==='webinar_published'?await webinarDeliveryContent(item,user,at):null;
   if(item.type==='webinar_published'&&!webinar){await finish({emailState:'skipped',lastError:'webinar_or_membership_unavailable'});skipped++;continue;}
   const content=subscriptionType?subscriptionNotice(term,item.type,at):item;
   const result=await sendEmail({to:user.email,subject:webinar?.subject||content.title,...(webinar?{html:webinar.html}:{}),messageId:`<${crypto.createHash('sha256').update(item.dedupeKey).digest('hex')}@notifications.singhacademy.com>`,text:webinar?.text||`${item.testMode?'SANDBOX TEST — no real money was collected.\n\n':''}${content.message}\n\n${item.type==='welcome'?'Open Singh Academy':'Open My Billing'}: ${frontendOrigin()}${content.link||'/billing'}\n\nSingh Academy`});
   if(!result.dev&&((result.rejected?.length||0)>0||!result.accepted?.some(address=>String(address).toLowerCase()===user.email.toLowerCase())))throw new Error('SMTP_REJECTED');
   await finish({title:content.title,message:content.message,emailState:result.dev?'dev_preview':'sent',emailAcceptedAt:result.dev?null:new Date(),lastError:''});if(result.dev)previewed++;else sent++;
  }catch(error){failed++;await finish({emailState:item.attempts>=8?'failed':'deferred',nextAttemptAt:new Date(at.getTime()+Math.min(24*3600000,60000*2**Math.min(item.attempts,10))),lastError:'email_delivery_not_confirmed'});}
 }
 return {claimed,sent,skipped,failed,previewed};
}
let running=null,nextRemindersAt=0;
export function runStudentNotificationCycle(){
 if(running)return running;
 running=(async()=>{
  let reminders={queued:0,covered:0};
  if(Date.now()>=nextRemindersAt){reminders=await enqueueExpiryReminders();nextRemindersAt=Date.now()+15*60000;}
  const webinars=await enqueueWebinarAnnouncements();
  return {reminders,webinars,delivery:await deliverStudentNotifications({limit:20})};
 })().finally(()=>{running=null;});return running;
}
export function startStudentNotificationWorker(){
 if(process.env.STUDENT_NOTIFICATIONS_ENABLED==='false')return async()=>{};
 const tick=()=>runStudentNotificationCycle().then(result=>{if(result.reminders.queued||result.delivery.claimed)console.log(JSON.stringify({event:'student_notifications',...result}));}).catch(()=>console.error(JSON.stringify({event:'student_notifications_failed',message:'Check database and mail configuration.'})));
 const interval=envInteger(process.env.STUDENT_NOTIFICATION_POLL_MS,5000,5000,60000);
 const timer=setInterval(tick,interval);timer.unref();void tick();
 return async()=>{clearInterval(timer);if(running)await running;};
}
