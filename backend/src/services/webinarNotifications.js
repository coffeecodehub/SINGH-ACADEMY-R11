import crypto from 'node:crypto';
import Event from '../models/Event.js';
import User from '../models/User.js';
import Invoice from '../models/Invoice.js';
import Subscription from '../models/Subscription.js';
import StudentNotification from '../models/StudentNotification.js';
import {invoiceCourseGrants,grantActive,invoiceGrantEligible} from '../utils/courseEntitlements.js';
import {loadSectionGrants} from './sectionAccess.js';
import {futurePublishedWebinar,webinarSignature,webinarNotice,webinarMail} from '../utils/webinarNotifications.js';
import {httpError} from '../utils/cmsValidation.js';
/** Embedded outbox: publication content and its durable fan-out marker commit in
 * one document write. The worker never performs an untracked fire-and-forget send. */
export async function saveEventWithAnnouncement(body,previous=null,{now=new Date()}={}){
 const merged={...(previous?.toObject?.()||previous||{}),...body};
 if(merged.type==='webinar'&&merged.status==='published'&&(!merged.date||!Number.isFinite(+new Date(merged.date))))throw httpError(400,'Add the webinar date and time before publishing.');
 let announcement=previous?.webinarAnnouncement,writeAnnouncement=false;
 if(futurePublishedWebinar(merged,now)){
  const signature=webinarSignature(merged);
  if(announcement?.signature!==signature){writeAnnouncement=true;announcement={id:crypto.randomUUID(),signature,status:'queued',publishedAt:now,lastUserId:null,updated:Boolean(announcement),queued:0};}
  else if(announcement.status==='cancelled'){writeAnnouncement=true;announcement={...(announcement.toObject?.()||announcement),status:'queued',lastUserId:null,leaseToken:null,leaseUntil:null};}
 }else if(announcement&&announcement.status!=='cancelled'){writeAnnouncement=true;announcement={...(announcement.toObject?.()||announcement),status:'cancelled',leaseToken:null,leaseUntil:null};}
 const values={...body,...(writeAnnouncement?{webinarAnnouncement:announcement}:{})};
 if(!previous){const item=await Event.create(values),out=item.toObject();delete out.webinarAnnouncement;return out;}
 const version=Number(previous.__v)||0,filter={_id:previous._id,...(previous.__v===undefined?{$or:[{__v:{$exists:false}},{__v:0}]}:{__v:version})};
 const item=await Event.findOneAndUpdate(filter,{$set:values,$inc:{__v:1}},{new:true,runValidators:true});
 if(!item)throw httpError(409,'This event changed while you were editing. Reload it before saving.');return item;
}
export async function hasActivePaidLearning(userId,now=new Date()){
 const invoices=await Invoice.find({user:userId,kind:'course',testMode:{$ne:true}}).lean();
 if(invoiceCourseGrants(invoices).grants.some(grant=>grantActive(grant,now)))return true;
 if((await loadSectionGrants(userId,{environment:'live'})).some(grant=>grantActive(grant,now)))return true;
 const terms=await Subscription.find({user:userId,status:'active',testMode:{$ne:true},startsAt:{$lte:now},endsAt:{$gt:now}}).lean();
 if(!terms.length)return false;
 return Boolean(await Invoice.find({user:userId,_id:{$in:terms.map(term=>term.invoice).filter(Boolean)},kind:'membership',testMode:{$ne:true}}).lean().then(items=>items.some(invoice=>invoiceGrantEligible(invoice)&&terms.some(term=>String(term.invoice)===String(invoice._id)))));
}
export async function enqueueWebinarAnnouncements({now=new Date(),batchSize=50,jobs=2}={}){
 let queued=0,processed=0;
 for(let index=0;index<jobs;index++){
  const token=crypto.randomUUID(),event=await Event.findOneAndUpdate({type:'webinar',status:'published',date:{$gt:now},$or:[{'webinarAnnouncement.status':'queued'},{'webinarAnnouncement.status':'sending','webinarAnnouncement.leaseUntil':{$lt:now}}]},{$set:{'webinarAnnouncement.status':'sending','webinarAnnouncement.leaseToken':token,'webinarAnnouncement.leaseUntil':new Date(+now+300000)}},{new:true,sort:{date:1}}).select('+webinarAnnouncement').lean();
  if(!event)break;const job=event.webinarAnnouncement,guard={_id:event._id,'webinarAnnouncement.id':job.id,'webinarAnnouncement.leaseToken':token};
  try{
   const filter={role:'student',status:{$ne:'blocked'},deletedAt:null,removalState:{$nin:['pending','removed']},$or:[{createdAt:{$lte:job.publishedAt}},{createdAt:{$exists:false}}],...(job.lastUserId?{_id:{$gt:job.lastUserId}}:{})};
   const users=await User.find(filter).select('_id name').sort({_id:1}).limit(Math.min(Math.max(batchSize,1),200)).lean();
   for(const user of users){
    // A stale lease may insert an already-deduped old notice but can never advance
    // a newer publication's cursor. Delivery rechecks the exact revision.
    let added=0;if(await hasActivePaidLearning(user._id,now)){try{const result=await StudentNotification.updateOne({dedupeKey:`webinar:${event._id}:${job.id}:${user._id}`},{$setOnInsert:webinarNotice(event,user,job)},{upsert:true});added=result.upsertedCount||0;
     // A draft interval may have skipped a queued invitation. Republish scans
     // from the beginning, re-arms only unsent eligible notices, and never resets sent mail.
     await StudentNotification.updateOne({dedupeKey:`webinar:${event._id}:${job.id}:${user._id}`,emailState:'skipped',lastError:{$in:['webinar_or_membership_unavailable','account_or_term_unavailable']}},{$set:{emailState:'queued',nextAttemptAt:now,lastError:''}});}catch(error){if(error.code!==11000)throw error;}}
    const progress=await Event.updateOne(guard,{$set:{'webinarAnnouncement.lastUserId':user._id,'webinarAnnouncement.leaseUntil':new Date(Date.now()+300000)},$inc:{'webinarAnnouncement.queued':added}});queued+=added;processed++;if(!progress.matchedCount)break;
   }
   await Event.updateOne(guard,{$set:{'webinarAnnouncement.status':users.length<Math.min(Math.max(batchSize,1),200)?'complete':'queued'},$unset:{'webinarAnnouncement.leaseToken':1,'webinarAnnouncement.leaseUntil':1}});
  }catch(error){await Event.updateOne(guard,{$set:{'webinarAnnouncement.status':'queued'},$unset:{'webinarAnnouncement.leaseToken':1,'webinarAnnouncement.leaseUntil':1}});throw error;}
 }
 return {queued,processed};
}
export async function webinarDeliveryContent(item,user,now){
 const event=await Event.findById(item.event).select('+webinarAnnouncement').lean();
 if(!event||!futurePublishedWebinar(event,now)||event.webinarAnnouncement?.id!==item.webinarRevision||!await hasActivePaidLearning(user._id,now))return null;
 return webinarMail(event,{name:user.name,updated:event.webinarAnnouncement.updated});
}
