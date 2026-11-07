/** Owned pending checkouts are not subscriptions or paid-access evidence. */
import BillingAgreement from '../models/BillingAgreement.js';
import CheckoutOrder from '../models/CheckoutOrder.js';
import Invoice from '../models/Invoice.js';
import User from '../models/User.js';
import {publicAgreement} from './recurringBilling.js';
import {closeCheckoutWithoutCreating,reconcileCreation,syncCheckout,publicOrder} from './onlineCheckout.js';
import {transaction} from './businessWrite.js';
import {objectId} from './businessRead.js';
import {businessError} from '../utils/business.js';
import {audit} from './audit.js';
import {loadAgreementPaidAccess} from './billingAccessDisplay.js';
const pending=order=>['creating','pending'].includes(order?.status);
const closed=order=>['cancelled','expired','failed'].includes(order?.status);
const matches=(agreement,order)=>agreement&&order&&String(order.user)===String(agreement.user)&&String(order._id)===String(agreement.checkoutOrder)&&String(order.billingAgreement)===String(agreement._id)&&order.provider===agreement.provider&&order.environment===agreement.environment&&order.kind===agreement.kind&&order.product===agreement.product;
export function agreementCheckoutView(agreement,order){
 const item=publicAgreement(agreement),owned=matches(agreement,order),waiting=owned&&(pending(order)||closed(order)&&['creating','incomplete'].includes(agreement.status))&&!agreement.accessCancelledAt;
 return {...item,checkoutOrderId:owned?String(order._id):null,checkoutStatus:owned?order.status:null,pendingCheckout:Boolean(waiting),checkoutCancellationPending:Boolean(waiting&&order.cancelRequestedAt),canContinueCheckout:Boolean(waiting&&pending(order)&&!order.cancelRequestedAt&&!agreement.accessCancellationRequestedAt),canCancelPendingCheckout:Boolean(waiting&&!agreement.renewalOperation)};
}
export async function ownedAgreementViews(userId){
 // Never let recent cancelled attempts evict an older active subscription.
 const terminal=['cancelled','canceled','expired','incomplete_expired'];
 const current=await BillingAgreement.find({user:userId,accessCancelledAt:{$exists:false},$or:[{status:{$nin:terminal}},{renewalOperation:{$exists:true}}]}).sort({createdAt:-1}).lean();
 // A bounded terminal tail preserves the existing response contract/history;
 // the current-controls UI hides it, and financial history stays paginated.
 const history=await BillingAgreement.find({user:userId,$or:[{status:{$in:terminal}},{accessCancelledAt:{$exists:true}}]}).sort({createdAt:-1}).limit(100).lean();
 const seen=new Set(current.map(item=>String(item._id))),agreements=[...current,...history.filter(item=>!seen.has(String(item._id)))];
 const orders=await CheckoutOrder.find({user:userId,_id:{$in:agreements.map(item=>item.checkoutOrder)}}).lean(),byId=new Map(orders.map(order=>[String(order._id),order]));
 const paidAccess=await loadAgreementPaidAccess(userId,agreements,orders);
 return agreements.map(item=>({...agreementCheckoutView(item,byId.get(String(item.checkoutOrder))),paidAccess:paidAccess.get(String(item._id))}));
}
async function owned(userId,id){
 const agreement=await BillingAgreement.findOne({_id:objectId(String(id)),user:userId});if(!agreement)throw businessError('Billing agreement not found.',404);
 const order=await CheckoutOrder.findOne({_id:agreement.checkoutOrder,user:userId}).select('+approvalUrl');
 if(!matches(agreement,order))throw businessError('The original checkout could not be matched. Contact the Academy before another purchase.',409);
 return {agreement,order};
}
async function activeStudent(userId){if(!await User.exists({_id:userId,role:'student',status:'active',removalState:{$nin:['pending','removed']}}))throw businessError('This account cannot continue a checkout.',403);}
function approvalAddress(value,provider){
 try{const u=new URL(value),hosts=provider==='stripe'?['checkout.stripe.com']:['www.paypal.com','www.sandbox.paypal.com'];if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.includes(u.hostname))return u.href;}catch{}
 throw businessError('The original provider checkout address is unavailable. Contact the Academy; do not start a duplicate payment.',409);
}
export async function continuePendingCheckout(userId,id){
 await activeStudent(userId);let {agreement,order}=await owned(userId,id);
 if(!pending(order))return {item:agreementCheckoutView(agreement,order),order:publicOrder(order),url:null};
 if(order.cancelRequestedAt||agreement.accessCancellationRequestedAt||agreement.accessCancelledAt||agreement.renewalOperation)throw businessError('Checkout cancellation or another billing change is pending. Confirm that action before continuing.',409);
 // Explicit continuation reuses the immutable existing create request/key. Read
 // reconciliation never captures PayPal or invents a new purchase/price.
 if(!order.providerOrderId)await reconcileCreation(order._id,{allowReplay:true});
 else await syncCheckout(order._id,{userId,capture:false});
 ({agreement,order}=await owned(userId,id));await activeStudent(userId);
 if(!pending(order))return {item:agreementCheckoutView(agreement,order),order:publicOrder(order),url:null};
 if(order.cancelRequestedAt||agreement.accessCancellationRequestedAt||agreement.accessCancelledAt||agreement.renewalOperation)throw businessError('Checkout cancellation is pending. The provider address was not opened.',409);
 if(order.status!=='pending'||!order.providerOrderId)throw businessError('The same checkout is still being prepared. Please retry Continue checkout shortly.',409);
 return {item:agreementCheckoutView(agreement,order),order:publicOrder(order),url:approvalAddress(order.approvalUrl,order.provider)};
}
export async function cancelPendingCheckout(userId,id,body={}){
 if(body.confirmPendingCancellation!==true)throw businessError('Confirm cancellation of this pending checkout.',400);
 let {agreement,order}=await owned(userId,id);
 if(['paid','renewal_ready'].includes(order.status))return {checkoutCancelled:false,item:agreementCheckoutView(agreement,order),order:publicOrder(order)};
 if(agreement.renewalOperation||agreement.accessCancellationRequestedAt)throw businessError('Another subscription change must finish first.',409);
 if(!pending(order)&&!closed(order))throw businessError('This checkout needs reconciliation.',409);
 if(!order.providerOrderId&&order.creationProtocolVersion===1&&!order.creationAttemptedAt){
  // Fence the exact old creation token before releasing this product's key. An
  // expired process may wake after its lease and must fail its original CAS.
  const fenced=await CheckoutOrder.findOneAndUpdate({_id:order._id,user:userId,status:{$in:['creating','pending','failed','expired','cancelled']},providerOrderId:{$exists:false},creationAttemptedAt:{$exists:false},$or:[{creationClaimUntil:{$exists:false}},{creationClaimUntil:{$lt:new Date()}}]},{$set:{status:'cancelled',cancelRequestedAt:order.cancelRequestedAt||new Date()},$unset:{creationClaim:1,creationClaimUntil:1}},{new:true});
  if(!fenced)throw businessError('Provider creation is still in flight. Retry cancellation once that operation is reconciled.',503);order=fenced;
 }else if(closed(order)&&!order.providerOrderId)throw businessError('The earlier provider attempt has no verified identity. Academy reconciliation is required before cancellation can be confirmed.',503);
 await CheckoutOrder.updateOne({_id:order._id,user:userId,status:{$in:['creating','pending']}},{$set:{cancelRequestedAt:order.cancelRequestedAt||new Date()}});
 await closeCheckoutWithoutCreating(order._id);
 return transaction(async session=>{
  await User.updateOne({_id:userId},{$inc:{commerceVersion:1}},{session});
  const currentOrder=await CheckoutOrder.findOne({_id:order._id,user:userId}).session(session),currentAgreement=await BillingAgreement.findOne({_id:agreement._id,user:userId}).session(session);
  if(!matches(currentAgreement,currentOrder))throw businessError('The checkout changed while cancellation was being confirmed.',409);
  if(['paid','renewal_ready'].includes(currentOrder.status))return {checkoutCancelled:false,item:agreementCheckoutView(currentAgreement,currentOrder),order:publicOrder(currentOrder)};
  if(currentAgreement.renewalOperation||currentAgreement.accessCancellationRequestedAt)throw businessError('Another subscription change must finish before this checkout can be removed.',409);
  if(!currentOrder.providerOrderId&&(!(currentOrder.creationProtocolVersion===1&&!currentOrder.creationAttemptedAt)||new Date(currentOrder.creationClaimUntil||0)>new Date()))throw businessError('The earlier provider attempt has no verified closure identity. Academy reconciliation is required.',503);
  if(!closed(currentOrder)||await Invoice.exists({user:userId,billingAgreement:currentAgreement._id,status:'paid'}).session(session))throw businessError('A collection is still being reconciled. This checkout remains visible until confirmed.',503);
  currentAgreement.status='cancelled';currentAgreement.autoRenew=false;currentAgreement.cancelAtPeriodEnd=false;currentAgreement.cancelledAt=new Date();currentAgreement.providerCancelledAt=currentAgreement.cancelledAt;currentAgreement.accessCancelledAt=currentAgreement.cancelledAt;currentAgreement.activeKey=undefined;await currentAgreement.save({session});
  await audit({user:{_id:userId}},{scope:'business',action:'checkout.pending_cancelled',targetUser:userId,entityType:'checkout',entityId:String(currentOrder._id),changes:{agreement:String(currentAgreement._id),provider:currentAgreement.provider,paidAccessUnchanged:true,noRefund:true}},session);
  return {checkoutCancelled:true,item:agreementCheckoutView(currentAgreement,currentOrder),order:publicOrder(currentOrder)};
 });
}
