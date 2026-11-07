import User from '../models/User.js';
import {objectId} from './businessRead.js';
import {transaction} from './businessWrite.js';
import {confirmIdentity} from './identity.js';
import {revokeUserSessions} from './sessions.js';
import {audit} from './audit.js';
import {businessError,text} from '../utils/business.js';
import {emailValue} from '../utils/security.js';

const cancelBilling=async(userId,options)=>{
 const {cancelAllBillingForDeletion}=await import('./recurringBilling.js');
 return cancelAllBillingForDeletion(userId,options);
};
const result=(removed)=>({success:true,removed,accessBlocked:true,removalState:removed?'removed':'pending',billingCancellationPending:!removed,
 message:removed?'Student account removed. Sign-in is disabled, sessions are revoked and provider billing closure is confirmed. Financial and audit history was retained.':'Student access is blocked and sessions are revoked. Provider billing closure is not yet confirmed. Retry removal to finish the cancellation; the account remains blocked.'});

/** Two phases: commit denial/session revocation first, then stop external billing.
 * No provider call runs in a retried Mongo transaction, and no financial rows are
 * deleted. An uncertain provider response keeps a blocked, retryable account. */
export async function removeStudent(req,id,{cancel=cancelBilling}={}){
 await confirmIdentity(req);
 const reason=text(req.body?.reason,'Reason for removal',500,5),confirmation=emailValue(req.body?.confirmationEmail);
 if(!confirmation)throw businessError('Type the student email to confirm account removal.',400);
 const userId=objectId(id);
 const alreadyRemoved=await transaction(async session=>{
  const user=await User.findOne({_id:userId,role:'student'}).select('+tokenVersion +commerceVersion').session(session);
  if(!user)throw businessError('Student account not found.',404);
  if(confirmation!==user.email)throw businessError('The confirmation email does not match this student.',400);
  if(user.deletedAt||user.removalState==='removed')return true;
  if(user.removalState!=='pending'){
   user.status='blocked';user.blockedReason='Account removal requested by an administrator.';user.removalState='pending';
   user.removalRequestedAt=new Date();user.removalRequestedBy=req.user._id;user.removalReason=reason;
   user.tokenVersion=Number(user.tokenVersion||0)+1;user.commerceVersion=Number(user.commerceVersion||0)+1;
   for(const field of ['verificationToken','verificationExpires','resetPasswordToken','resetPasswordExpires','resetOtpHash','resetOtpExpires','resetOtpVerifiedAt'])user[field]=null;
   user.resetOtpAttempts=0;await user.save({session});await revokeUserSessions(user._id,session);
   await audit(req,{scope:'academy',action:'student.removal_requested',targetUser:user._id,entityType:'user',entityId:String(user._id),reason,changes:{accessBlocked:true,billingCancellationPending:true}},session);
  }
  return false;
 });
 if(alreadyRemoved)return result(true);
 let billing;
 try{billing=await cancel(userId,{actorUserId:req.user._id});}catch{}
 if(billing?.complete!==true){
  await audit(req,{scope:'academy',action:'student.removal_billing_pending',targetUser:userId,entityType:'user',entityId:String(userId),changes:{accessBlocked:true,billingCancellationPending:true}});
  return result(false);
 }
 await transaction(async session=>{
  const user=await User.findOneAndUpdate({_id:userId,role:'student',removalState:'pending',deletedAt:null},{$set:{status:'blocked',removalState:'removed',deletedAt:new Date(),deletedBy:req.user._id}},{new:true,runValidators:true,session});
  if(!user){
   const current=await User.findOne({_id:userId,role:'student'}).session(session);
   if(current?.deletedAt&&current.removalState==='removed')return;
   throw businessError('The student removal state changed. Refresh the record before retrying.',409);
  }
  const counts={};for(const key of ['agreementsCancelled','checkoutsClosed'])if(Number.isSafeInteger(billing[key])&&billing[key]>=0)counts[key]=billing[key];
  await audit(req,{scope:'academy',action:'student.removed',targetUser:user._id,entityType:'user',entityId:String(user._id),reason,changes:{accessBlocked:true,billingCancellationConfirmed:true,...counts}},session);
 });
 return result(true);
}
