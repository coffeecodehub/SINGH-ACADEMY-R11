/** Explicit immediate access cancellation. Renewal disable remains a separate
 * operation and retains paid rights. This module never issues a refund. */
import crypto from 'node:crypto';
import BillingAgreement from '../models/BillingAgreement.js';
import CheckoutOrder from '../models/CheckoutOrder.js';
import Invoice from '../models/Invoice.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Enrollment from '../models/Enrollment.js';
import SectionAccess from '../models/SectionAccess.js';
import {transaction} from './businessWrite.js';
import {businessError} from '../utils/business.js';
import {objectId} from './businessRead.js';
import {getStripe,paypalApi} from './paymentProviders.js';
import {readPayPalSubscription} from './paypalSubscriptions.js';
import {paymentEnvironment} from '../utils/commerce.js';
import {publicAgreement,reconcileStripeInvoice,reconcilePayPalSubscription,assertPayPalCollectionsReconciled,payPalLastPaymentRecorded} from './recurringBilling.js';
import {closeCheckoutWithoutCreating} from './onlineCheckout.js';
import {renewalSourceInvoice} from './renewalSetup.js';
import {audit} from './audit.js';
import {releaseCoupon} from './coupons.js';
const terminal=a=>['cancelled','canceled','expired','incomplete_expired'].includes(a.status);
const productField=kind=>kind==='course'?'courseSlug':kind==='section'?'sectionSlug':'planName';
const invoiceProduct=i=>i[productField(i.kind)];
function confirmation(body){if(body?.confirmImmediateCancellation!==true)throw businessError('Confirm that this subscription access ends immediately with no refund.',400);}
function stripeIdentity(agreement,remote){if(remote.id!==agreement.providerSubscriptionId||remote.metadata?.sa_order_id!==String(agreement.checkoutOrder)||remote.metadata?.sa_user_id!==String(agreement.user)||remote.livemode!==(agreement.environment==='live')||paymentEnvironment('stripe')!==agreement.environment)throw businessError('Stripe subscription ownership or environment does not match this cancellation.',409);}
async function stripeFinancialClosure(agreement,stripe){
 let cursor;
 for(let page=0;page<10;page++){
  const result=await stripe.invoices.list({subscription:agreement.providerSubscriptionId,limit:100,...(cursor?{starting_after:cursor}:{})});
  if(!Array.isArray(result.data))throw businessError('Stripe invoice history could not be verified.',503);
  for(const invoice of result.data){
   const ref=invoice.parent?.subscription_details?.subscription||invoice.subscription,id=typeof ref==='string'?ref:ref?.id;
   if(id!==agreement.providerSubscriptionId||invoice.livemode!==(agreement.environment==='live'))throw businessError('Stripe invoice history does not match this agreement.',409);
   if(invoice.status==='paid'){if(invoice.total>0)await reconcileStripeInvoice(invoice.id);}
   else if(!['void','uncollectible'].includes(invoice.status))throw businessError('A Stripe invoice or collection is still unresolved. Cancellation is pending financial reconciliation.',503);
  }
  if(!result.has_more)return;if(!result.data.length)break;cursor=result.data.at(-1).id;
 }
 throw businessError('Stripe invoice history is incomplete. Cancellation remains pending.',503);
}
async function originalInvoice(agreement,order,body,forAccountRemoval){
 const supplied=body?.sourceInvoiceId,stored=agreement.sourceInvoiceId||order.sourceInvoiceId;
 if(stored&&supplied&&String(stored)!==supplied)throw businessError('The original purchase does not match this subscription.',409);
 if(supplied&&!agreement.renewalSetup&&!agreement.sourceInvoiceId&&!order.sourceInvoiceId)throw businessError('This subscription has no linked original purchase. Cancel an independent purchase through its own invoice.',409);
 const id=agreement.sourceInvoiceId||order.sourceInvoiceId||supplied;
 if(id)return renewalSourceInvoice(agreement.user,agreement.kind,agreement.product,{sourceInvoiceId:String(id),environment:agreement.environment,requireEligible:false});
 if(!agreement.renewalSetup||forAccountRemoval)return null;
 return renewalSourceInvoice(agreement.user,agreement.kind,agreement.product,{createdBefore:agreement.createdAt,environment:agreement.environment,requireEligible:false});
}
async function bindProvider(agreement,order){
 if(agreement.providerSubscriptionId)return agreement;
 if(agreement.provider==='stripe'&&order.providerOrderId){
  const session=await(await getStripe()).checkout.sessions.retrieve(order.providerOrderId),sub=typeof session.subscription==='string'?session.subscription:session.subscription?.id;
  if(session.id!==order.providerOrderId||session.mode!=='subscription'||session.client_reference_id!==String(order._id)||session.metadata?.sa_order_id!==String(order._id)||session.metadata?.sa_user_id!==String(order.user)||session.livemode!==(order.environment==='live'))throw businessError('Stripe checkout ownership could not be confirmed.',409);
  if(sub){await BillingAgreement.updateOne({_id:agreement._id,user:agreement.user,providerSubscriptionId:{$exists:false}},{$set:{providerSubscriptionId:sub},$inc:{__v:1}});return BillingAgreement.findById(agreement._id);}
 }
 if(agreement.provider==='paypal'&&order.providerOrderId){
  const remote=await readPayPalSubscription(order);await BillingAgreement.updateOne({_id:agreement._id,user:agreement.user,providerSubscriptionId:{$exists:false}},{$set:{providerSubscriptionId:remote.id},$inc:{__v:1}});return BillingAgreement.findById(agreement._id);
 }
 return agreement;
}
async function closeProvider(agreement,order,operation){
 agreement=await bindProvider(agreement,order);
 if(!agreement.providerSubscriptionId){
  const closed=await closeCheckoutWithoutCreating(order._id);order=await CheckoutOrder.findById(order._id);agreement=await bindProvider(await BillingAgreement.findById(agreement._id),order);
  if(!agreement.providerSubscriptionId){if(!['cancelled','expired','failed'].includes(closed.status))throw businessError('Provider checkout cancellation is still unresolved.',503);return agreement;}
 }
 if(agreement.provider==='stripe'){
  const stripe=await getStripe();let remote=await stripe.subscriptions.retrieve(agreement.providerSubscriptionId);stripeIdentity(agreement,remote);
  if(!['canceled','incomplete_expired'].includes(remote.status)){
   try{await stripe.subscriptions.cancel(remote.id,{invoice_now:false,prorate:false},{idempotencyKey:'sa-cancel-access-'+operation.id});}
   catch(error){remote=await stripe.subscriptions.retrieve(remote.id);stripeIdentity(agreement,remote);if(!['canceled','incomplete_expired'].includes(remote.status))throw error;}
  }
  remote=await stripe.subscriptions.retrieve(remote.id);stripeIdentity(agreement,remote);if(!['canceled','incomplete_expired'].includes(remote.status))throw businessError('Stripe has not confirmed immediate cancellation. Retry the same action.',502);
  await stripeFinancialClosure(agreement,stripe);
 }else{
  let remote=await readPayPalSubscription(order);
  if(!['CANCELLED','EXPIRED'].includes(remote.status)){
   if(!['ACTIVE','SUSPENDED'].includes(remote.status))throw businessError('PayPal must confirm cancellation or expiry of the original approval before immediate cancellation can finish.',503);
   try{await paypalApi('/v1/billing/subscriptions/'+encodeURIComponent(remote.id)+'/cancel',{method:'POST',body:{reason:'Owner requested immediate subscription cancellation and access termination. No refund was requested.'}});}
   catch(error){remote=await readPayPalSubscription(order);if(!['CANCELLED','EXPIRED'].includes(remote.status))throw error;}
  }
  remote=await readPayPalSubscription(order);if(!['CANCELLED','EXPIRED'].includes(remote.status))throw businessError('PayPal has not confirmed immediate cancellation. Retry the same action.',502);
  if(!await payPalLastPaymentRecorded(order,remote))await reconcilePayPalSubscription(remote.id);
  await assertPayPalCollectionsReconciled(order,remote);
 }
 return agreement;
}
async function revokeInvoiceRights(userId,ids,at,reason,session){
 if(!ids.length)return;
 await Invoice.updateMany({_id:{$in:ids},user:userId},{$set:{accessRevokedAt:at,accessCancelledAt:at,accessCancellationReason:reason}},{session});
 await Subscription.updateMany({user:userId,$or:[{invoice:{$in:ids}}]},{$set:{status:'cancelled',cancelledAt:at,accessCancelledAt:at,cancellationReason:'Immediate access cancellation; no refund.'}},{session});
 await SectionAccess.updateMany({user:userId,invoice:{$in:ids}},{$set:{status:'cancelled'}},{session});
 await Enrollment.updateMany({user:userId,invoice:{$in:ids}},{$set:{status:'cancelled',reason:'This purchase was cancelled immediately; no refund.'}},{session});
 await CheckoutOrder.updateMany({user:userId,invoice:{$in:ids}},{$set:{accessCancelledAt:at}},{session});
}
export async function cancelAgreementAccessNow(userId,id,body={},options={}){
 if(!options.forAccountRemoval)confirmation(body);
 else if(!await User.exists({_id:userId,role:'student',status:'blocked',removalState:{$in:['pending','removed']}}))throw businessError('Account removal must block the student before taking over provider billing.',409);
 const owned={_id:objectId(String(id)),user:userId};let agreement=await BillingAgreement.findOne(owned);if(!agreement)throw businessError('Billing agreement not found.',404);
 if(agreement.accessCancelledAt)return publicAgreement(agreement);
 const order=await CheckoutOrder.findOne({_id:agreement.checkoutOrder,user:userId});if(!order)throw businessError('The subscription checkout is missing.',409);
 const source=await originalInvoice(agreement,order,body,options.forAccountRemoval),existing=agreement.renewalOperation;
 let operation=existing;
 if(existing&&existing.action!=='cancel_access'){
  if(!options.forAccountRemoval)throw businessError('Another billing change is awaiting confirmation. Finish that action before immediate cancellation.',503);
  agreement=await transaction(async session=>{
   const owner=await User.findOneAndUpdate({_id:userId,role:'student',status:'blocked',removalState:{$in:['pending','removed']}},{$inc:{commerceVersion:1}},{new:true,session});if(!owner)throw businessError('Account removal is no longer pending for this student.',409);
   const current=await BillingAgreement.findOne(owned).session(session);if(!current)throw businessError('Billing agreement not found.',404);
   if(current.accessCancelledAt||current.renewalOperation?.action==='cancel_access')return current;
   if(current.renewalOperation?.id!==existing.id||current.renewalOperation?.action!==existing.action)throw businessError('The prior billing operation changed. Retry account removal.',503);
   const replacement={id:crypto.randomUUID(),autoRenew:false,action:'cancel_access',startedAt:new Date()},updated=await BillingAgreement.findOneAndUpdate({...owned,'renewalOperation.id':existing.id,'renewalOperation.action':existing.action??{$exists:false}},{$set:{renewalOperation:replacement,accessCancellationRequestedAt:current.accessCancellationRequestedAt||new Date(),...(source?{sourceInvoiceId:source._id}:{})},$inc:{__v:1}},{new:true,runValidators:true,session});
   if(!updated)throw businessError('The prior billing operation changed. Retry account removal.',503);
   await audit({user:{_id:options.actorUserId||userId}},{scope:'business',action:'subscription.removal_cancellation_takeover',targetUser:userId,entityType:'billing_agreement',entityId:String(current._id),changes:{provider:current.provider,priorOperation:{id:existing.id,action:existing.action||(existing.autoRenew?'enable':'disable'),autoRenew:existing.autoRenew,startedAt:existing.startedAt},cancellationOperationId:replacement.id,reason:'account_removed',noRefund:true}},session);
   return updated;
  });
  if(agreement.accessCancelledAt)return publicAgreement(agreement);
  operation=agreement.renewalOperation;
 }
 if(!operation){operation={id:crypto.randomUUID(),autoRenew:false,action:'cancel_access',startedAt:new Date()};agreement=await BillingAgreement.findOneAndUpdate({...owned,renewalOperation:{$exists:false}},{$set:{renewalOperation:operation,accessCancellationRequestedAt:agreement.accessCancellationRequestedAt||new Date(),...(source?{sourceInvoiceId:source._id}:{})},$inc:{__v:1}},{new:true,runValidators:true});if(!agreement)throw businessError('Another billing action is in progress. Retry immediate cancellation.',503);}
 // The durable operation deliberately remains after any provider/read failure.
 // Retrying cannot silently reactivate renewal or create another purchase.
 await closeProvider(agreement,order,operation);
 return transaction(async session=>{
  const locked=await User.findOneAndUpdate({_id:userId,role:'student'},{$inc:{commerceVersion:1}},{new:true,session});if(!locked)throw businessError('The billing owner is missing.',409);
  const current=await BillingAgreement.findOne({...owned,'renewalOperation.id':operation.id}).session(session);if(!current){const done=await BillingAgreement.findOne(owned).session(session);if(done?.accessCancelledAt)return publicAgreement(done);throw businessError('Cancellation state changed. Retry the same action.',503);}
  const at=new Date(),reason=options.forAccountRemoval?'account_removed':'owner_immediate',field=productField(current.kind);
  const invoices=await Invoice.find({user:userId,kind:current.kind,[field]:current.product,testMode:current.environment==='test'?true:{$ne:true},$or:[{billingAgreement:current._id},...(source?[{_id:source._id}]:[])]}).select('_id').session(session).lean();
  await revokeInvoiceRights(userId,invoices.map(i=>i._id),at,reason,session);
  await Subscription.updateMany({user:userId,billingAgreement:current._id},{$set:{status:'cancelled',cancelledAt:at,accessCancelledAt:at,cancellationReason:'Immediate subscription cancellation; no refund.'}},{session});
  await CheckoutOrder.updateOne({_id:current.checkoutOrder,user:userId},{$set:{accessCancelledAt:at,...(!['paid','renewal_ready'].includes(order.status)?{status:'cancelled',cancelRequestedAt:at}:{})}},{session});if(order.couponId&&!['paid','renewal_ready'].includes(order.status))await releaseCoupon({couponId:order.couponId,orderId:order._id,session});
  const updated=await BillingAgreement.findOneAndUpdate({...owned,'renewalOperation.id':operation.id},{$set:{status:'cancelled',autoRenew:false,cancelAtPeriodEnd:false,providerCancelledAt:at,cancelledAt:at,accessCancelledAt:at},$unset:{activeKey:1,renewalOperation:1},$inc:{__v:1}},{new:true,runValidators:true,session});
  await audit({user:{_id:options.actorUserId||userId}},{scope:'business',action:'subscription.access_cancelled_immediately',targetUser:userId,entityType:'billing_agreement',entityId:String(current._id),changes:{provider:current.provider,sourceInvoiceId:source?String(source._id):null,invoiceIds:invoices.map(i=>String(i._id)),accessCancelledAt:at,noRefund:true,reason}},session);
  return publicAgreement(updated);
 });
}
export async function cancelPurchaseAccessNow(userId,id,body={}){
 confirmation(body);const invoice=await Invoice.findOne({_id:objectId(String(id)),user:userId});if(!invoice)throw businessError('Paid purchase not found.',404);
 if(!['course','section','membership'].includes(invoice.kind)||invoice.status!=='paid'||!invoice.fulfillmentAt)throw businessError('Only a confirmed paid purchase can be cancelled here.',409);
 const result=await transaction(async session=>{
  const locked=await User.findOneAndUpdate({_id:userId,role:'student'},{$inc:{commerceVersion:1}},{new:true,session});if(!locked)throw businessError('The billing owner is missing.',409);
  const current=await Invoice.findOne({_id:invoice._id,user:userId}).session(session);
  // Deferred setup takes this same owner lock before binding sourceInvoiceId.
  // Recheck inside the transaction so a concurrent setup cannot acquire a new
  // charge mandate while this action revokes only its original paid purchase.
  if(await BillingAgreement.exists({user:userId,$or:[{sourceInvoiceId:current._id},...(current.billingAgreement?[{_id:current.billingAgreement}]:[])],accessCancelledAt:{$exists:false},$and:[{$or:[{activeKey:{$exists:true}},{status:{$nin:['cancelled','expired']}}]}]}).session(session))throw businessError('This purchase has a linked billing agreement. Use Cancel subscription now for that agreement first.',409);
  const at=current.accessCancelledAt||new Date();if(!current.accessCancelledAt){await revokeInvoiceRights(userId,[current._id],at,'owner_immediate',session);await audit({user:{_id:userId}},{scope:'business',action:'purchase.access_cancelled_immediately',targetUser:userId,entityType:'invoice',entityId:String(current._id),changes:{kind:current.kind,product:invoiceProduct(current),accessCancelledAt:at,noRefund:true}},session);}
  return {_id:current._id,invoiceId:String(current._id),kind:current.kind,product:invoiceProduct(current),accessCancelledAt:at,canCancelActivePurchase:false};
 });return result;
}
export async function cancelAllBillingForDeletion(userId,options={}){
 const user=await User.findOne({_id:userId,role:'student'});if(!user||user.status!=='blocked'||!['pending','removed'].includes(user.removalState))throw businessError('Account removal must block the user before provider billing shutdown.',409);
 await CheckoutOrder.updateMany({user:userId,provider:'paypal',status:{$ne:'paid'}},{$set:{cancelRequestedAt:new Date()}});
 const agreements=await BillingAgreement.find({user:userId}).sort({createdAt:1}).lean();let agreementsCancelled=0,checkoutsClosed=0;
 for(const agreement of agreements){await cancelAgreementAccessNow(userId,agreement._id,{}, {...options,forAccountRemoval:true});agreementsCancelled++;}
 const checkouts=await CheckoutOrder.find({user:userId,status:{$in:['creating','pending','failed']}}).sort({createdAt:1}).lean();
 for(const checkout of checkouts){await closeCheckoutWithoutCreating(checkout._id);checkoutsClosed++;}
 // Re-scan after every provider action. The User commerce lock in checkout and
 // enable prevents a pre-removal authenticated request from escaping this scan.
 if(await BillingAgreement.exists({user:userId,accessCancelledAt:{$exists:false}})||await CheckoutOrder.exists({user:userId,status:{$in:['creating','pending']}}))throw businessError('Provider billing shutdown is still pending. Retry account removal.',503);
 return {complete:true,agreementsCancelled,checkoutsClosed};
}
