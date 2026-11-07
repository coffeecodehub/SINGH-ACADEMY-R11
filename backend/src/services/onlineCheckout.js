import {effectiveCourseEnrollment,baseGrantSnapshot} from './courseEntitlements.js';
import {assertNoActivePurchase} from './catalogEntitlements.js';
import crypto from 'node:crypto';
import Section from '../models/Section.js';
import BillingAgreement from '../models/BillingAgreement.js';
import {regionalOffers,getMembershipPlans} from './regionalPricing.js';
import {quoteProduct,claimCoupon,consumeCoupon,releaseCoupon} from './coupons.js';
import {grantSectionAccess,effectiveSectionAccess} from './sectionAccess.js';
import {settleRecurringPeriod,confirmRenewalSetup,refreshPayPalAgreement} from './recurringBilling.js';
import {paypalSubscriptionBody,createPayPalSubscription,paypalSubscriptionEvidence,closePayPalSubscriptionCheckout} from './paypalSubscriptions.js';
import {renewalSetupTiming,renewalCheckoutConflict,renewalSourceInvoice} from './renewalSetup.js';
import mongoose from 'mongoose';
import CheckoutOrder from '../models/CheckoutOrder.js';
import Course from '../models/Course.js';
import SiteContent from '../models/SiteContent.js';
import User from '../models/User.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import Enrollment from '../models/Enrollment.js';
import Notification from '../models/Notification.js';
import {audit} from './audit.js';
import {queueSubscriptionConfirmation,queueCourseConfirmation} from './studentNotifications.js';
import {syncMembershipCourseEnrollments} from './membershipEnrollments.js';
import {transaction} from './businessWrite.js';
import {objectId,capabilities} from './businessRead.js';
import {businessError,text,requestKey,stableJson,addMonths} from '../utils/business.js';
import {courseOffers,selectCourseOffer,planOffer,gatewayCurrency,requireGateway,assertEvidence,courseMonthPeriod,coursePeriod,realAccessFilter,activeEnrollmentWindow,gatewayConfiguration} from '../utils/commerce.js';
import {createStripeOrder,createPayPalOrder,stripeOrderBody,paypalOrderBody,providerCredentialFingerprint,findStripeOrder,stripeEvidence,paypalEvidence,closeStripeCheckout,closePayPalCheckout} from './paymentProviders.js';
const one=async(Model,body,session)=>(await Model.create([body],{session}))[0];
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
export function publicOrder(order){return {_id:order._id,provider:order.provider,environment:order.environment,kind:order.kind,product:order.product,...(order.renewalOf?{renewalOf:String(order.renewalOf)}:{}),title:order.title,optionLabel:order.optionLabel,currency:order.currency,amountMinor:order.amountMinor,status:order.status,cancellationRequested:Boolean(order.cancelRequestedAt),...(order.recoveryRequired?{recoveryRequired:true,recoveryMessage:'The previous payment needs Academy reconciliation. Do not make another payment until its status is confirmed.'}:{}),paidAt:order.paidAt,accessDays:order.accessDays,durationMonths:order.durationMonths,accessStartsAt:order.accessStartsAt,accessExpiresAt:order.accessExpiresAt,grantNote:order.grantNote,subtotalMinor:order.subtotalMinor??order.amountMinor,discountMinor:order.discountMinor||0,autoRenew:order.autoRenew===true,renewalAmountMinor:order.renewalAmountMinor??order.amountMinor,country:order.country,billingAgreement:order.billingAgreement,sourceInvoiceId:order.sourceInvoiceId?String(order.sourceInvoiceId):null,accessCancelledAt:order.accessCancelledAt||null,renewalSetup:order.renewalSetup===true,billingStartsAt:order.billingStartsAt,setupConfirmedAt:order.setupConfirmedAt,amountDueNowMinor:order.renewalSetup?0:order.amountMinor,nonRefundableNotice:'Purchases are non-refundable except where required by applicable law or provider rights.'};}
export async function catalog(kind,product,user={}){
 if(['course','section'].includes(kind)){
  const Model=kind==='section'?Section:Course,item=await Model.findOne({slug:product,published:true}).lean();if(!item)throw businessError('Published product not found.',404);
  return {kind,title:item.title,product:item.slug,...(kind==='course'?{sectionSlug:item.sectionSlug||''}:{}),free:kind==='course'&&item.accessType==='free',membershipOnly:kind==='course'&&item.accessType==='membership',offers:regionalOffers(item,user.country)};
 }
 if(kind==='membership'){
  const plans=await getMembershipPlans(user.country),plan=plans.find(p=>(p.name===product||p.key===product)&&p.active!==false);
  if(!plan)throw businessError('Membership plan not found.',404);return {kind,title:plan.name,product:plan.name,offers:regionalOffers(plan,user.country)};
 }
 throw businessError('Choose a course, section or membership.');
}
export async function quoteCheckout(req){
 const body=req.body||{},kind=text(body.kind,'Purchase type',20,1),product=text(body.product,'Product',200,1),optionKey=body.optionKey==null?'':text(body.optionKey,'Price option',64),autoRenew=body.autoRenew===true,renewalSetup=body.renewalSetup===true;
 if(renewalSetup&&!autoRenew)throw businessError('Automatic renewal must be enabled to set up the next paid term.',409);
 if(renewalSetup&&body.couponCode)throw businessError('Discount codes cannot be applied to deferred automatic renewal setup. Its first future charge uses the standard recurring price.',409);
 const result=await quoteProduct({user:req.user,kind,product,optionKey,couponCode:body.couponCode||''});
 const quote={...result.quote,kind,product,optionKey:result.offer.key,autoRenew,renewalAmountMinor:result.quote.subtotalMinor,noPaymentRequired:result.quote.amountMinor===0};
 const source=renewalSetup?await renewalSourceInvoice(req.user._id,kind,product,{sourceInvoiceId:body.sourceInvoiceId}):null;
 quote.sourceInvoiceId=source?String(source._id):null;
 const timing=renewalSetup?await renewalSetupTiming(req.user._id,kind,product):null;
 quote.renewalSetup=renewalSetup;quote.billingStartsAt=timing?.billingStartsAt||null;quote.amountDueNowMinor=renewalSetup?0:quote.amountMinor;
 const methods=gatewayConfiguration(),conflict=await renewalCheckoutConflict(req.user._id,kind,product,{renewalSetup,autoRenew,environment:methods.stripe.environment}),sharedReason=conflict||timing?.reason||(autoRenew&&quote.amountMinor===0?'Disable automatic renewal to redeem a 100% discount without a payment method.':'');
 const sourceEnvironment=source?(source.testMode?'test':'live'):null;
 const stripeReason=sharedReason||(sourceEnvironment&&sourceEnvironment!==methods.stripe.environment?'The original purchase belongs to a different Stripe payment environment.':'')||(autoRenew&&quote.durationMonths>36?'Stripe automatic renewal supports terms up to 36 months. Choose another duration or one-time access.':''),paypalReason=sharedReason||(sourceEnvironment&&sourceEnvironment!==methods.paypal.environment?'The original purchase belongs to a different PayPal payment environment.':'')||(autoRenew&&(quote.durationMonths>12||!['course','section'].includes(kind))?'PayPal automatic renewal supports course/section terms of 1–12 months. Choose another duration or one-time access.':'');
 quote.providerUnavailableReasons={stripe:stripeReason,paypal:paypalReason};quote.availableProviders={stripe:methods.stripe.enabled&&!stripeReason,paypal:methods.paypal.enabled&&!paypalReason};
 if(sharedReason||stripeReason&&paypalReason)quote.recurringUnavailableReason=sharedReason||stripeReason+' '+paypalReason;
 quote.fingerprint=digest(stableJson({kind,product,optionKey:quote.optionKey,country:quote.country,subtotalMinor:quote.subtotalMinor,discountMinor:quote.discountMinor,amountMinor:quote.amountMinor,currency:quote.currency,durationMonths:quote.durationMonths,autoRenew,renewalSetup,sourceInvoiceId:quote.sourceInvoiceId,billingStartsAt:quote.billingStartsAt?new Date(quote.billingStartsAt).toISOString():null,couponId:quote.couponId?String(quote.couponId):null}));
 return {...result,quote};
}
const CLOSED=new Set(['expired','failed','cancelled']);
function recoveryError(){const e=businessError('The previous payment needs Academy reconciliation. Its status is uncertain; do not pay again. Contact support with the checkout reference.',409);e.code='CHECKOUT_RECONCILIATION_REQUIRED';return e;}
async function markRecovery(order,reason){await CheckoutOrder.updateOne({_id:order._id,status:{$ne:'paid'}},{$set:{recoveryRequired:true,recoveryReason:reason}});}
async function persistRemote(order,claim,remote){
 if(typeof remote.id!=='string'||!remote.id||remote.id.length>150)throw businessError('Payment provider did not return a valid order ID.',502);
 const updated=await CheckoutOrder.findOneAndUpdate({_id:order._id,creationClaim:claim,providerOrderId:{$exists:false},status:{$in:['creating','pending']}},
  {$set:{providerOrderId:remote.id,approvalUrl:remote.url||null,status:CLOSED.has(remote.state)?remote.state:'pending',recoveryRequired:false},$unset:{creationClaim:1,creationClaimUntil:1,recoveryReason:1}},{new:true}).select('+approvalUrl');
 if(!updated)throw businessError('Checkout changed while being reconciled. Check the same order.',409);
 return {order:publicOrder(updated),url:updated.status==='pending'?updated.approvalUrl:null};
}
async function makeRemote(order,user,{allowReplay=true}={}){
 if(order.providerOrderId)return {order:publicOrder(order),url:order.status==='renewal_ready'?null:order.approvalUrl};
 if(order.status==='paid'||CLOSED.has(order.status))return {order:publicOrder(order),url:null};
 const claim=crypto.randomUUID(),now=new Date();
 let claimed=await CheckoutOrder.findOneAndUpdate({_id:order._id,providerOrderId:{$exists:false},cancelRequestedAt:{$exists:false},status:{$in:['creating','pending']},$or:[{creationClaimUntil:{$exists:false}},{creationClaimUntil:{$lt:now}}]},
  {$set:{creationClaim:claim,creationClaimUntil:new Date(+now+90000)}},{new:true}).select('+creationPayload +creationCredentialFingerprint +approvalUrl +creationClaim');
 if(!claimed){const current=await CheckoutOrder.findById(order._id).select('+approvalUrl');if(current?.providerOrderId)return {order:publicOrder(current),url:current.approvalUrl};throw businessError('Checkout is being reconciled. Wait a moment and retry the same action.',409);}
 try{
  const neverSent=claimed.creationProtocolVersion===1&&!claimed.creationAttemptedAt;
  const activeGateway=requireGateway(claimed.provider);
  if(activeGateway.environment!==claimed.environment){await markRecovery(claimed,'Provider environment changed since original checkout.');throw recoveryError();}
  const fingerprint=providerCredentialFingerprint(claimed.provider);
  const sameCredential=claimed.creationCredentialFingerprint===fingerprint;
  if(!neverSent&&claimed.creationCredentialFingerprint&&!sameCredential){await markRecovery(claimed,'Provider credentials changed since original checkout. Verify original account before recovery.');throw recoveryError();}
  if(neverSent){
   if(!allowReplay)return {order:publicOrder(claimed),url:null};
   // The original request is durably captured BEFORE the external mutation.
   // Domain/email/price changes cannot alter a later idempotency replay.
   if(+new Date(claimed.expiresAt)<Date.now()+1800000)claimed.expiresAt=new Date(Date.now()+3600000);
   const payload=claimed.provider==='stripe'?stripeOrderBody(claimed,user):claimed.autoRenew?paypalSubscriptionBody(claimed):paypalOrderBody(claimed);
   const marked=await CheckoutOrder.findOneAndUpdate({_id:claimed._id,creationClaim:claim,creationAttemptedAt:{$exists:false},status:{$in:['creating','pending']},cancelRequestedAt:{$exists:false},creationClaimUntil:{$gt:new Date()}},
    {$set:{creationAttemptedAt:now,lastCreationAttemptedAt:now,creationCredentialFingerprint:fingerprint,creationPayload:payload,expiresAt:claimed.expiresAt}},{new:true}).select('+creationPayload +creationCredentialFingerprint +creationClaim');
   if(!marked)throw businessError('Checkout changed before provider creation.',409);claimed=marked;
  }else{
   const age=Date.now()-+new Date(claimed.creationAttemptedAt||0);
   // PayPal retention is API/account-specific. Unknown retention means no
   // missing-ID create replay; an operator can bind a verified existing order.
   const configuredPayPalSeconds=Number(process.env.PAYPAL_CREATE_REPLAY_SECONDS||0);
   const paypalSeconds=Number.isSafeInteger(configuredPayPalSeconds)&&configuredPayPalSeconds>=0&&configuredPayPalSeconds<=18000?configuredPayPalSeconds:0;
   const horizon=claimed.provider==='stripe'?23*3600000:claimed.autoRenew?71*3600000:paypalSeconds*1000;
   const replaySafe=sameCredential&&claimed.creationPayload&&age>=0&&age<horizon;
   if(!allowReplay||!replaySafe){
    if(claimed.provider==='stripe'){
     const search=await findStripeOrder(claimed);
     if(search.remote)return await persistRemote(claimed,claim,search.remote);
     // Only an exhaustive search AFTER this exact checkout's expiry and every
     // bounded in-flight creation can prove an absent Stripe session safe.
     if(sameCredential&&search.complete&&Date.now()>+new Date(claimed.expiresAt)+300000&&Date.now()>+new Date(claimed.lastCreationAttemptedAt||claimed.createdAt)+300000){
      const closed=await CheckoutOrder.findOneAndUpdate({_id:claimed._id,creationClaim:claim,providerOrderId:{$exists:false}},{$set:{status:'expired',recoveryRequired:false}},{new:true});
      return {order:publicOrder(closed),url:null};
     }
    }
    await markRecovery(claimed,'Creation replay cannot be proven idempotent within provider retention.');throw recoveryError();
   }
   await CheckoutOrder.updateOne({_id:claimed._id,creationClaim:claim},{$set:{lastCreationAttemptedAt:new Date()}});
  }
  if(!await User.exists({_id:claimed.user,role:'student',status:'active',removalState:{$nin:['pending','removed']}}))throw businessError('Account removal or an access restriction prevents opening this checkout.',403);
  const remote=claimed.provider==='stripe'?await createStripeOrder(claimed,user):claimed.autoRenew?await createPayPalSubscription(claimed):await createPayPalOrder(claimed,user);
  const saved=await persistRemote(claimed,claim,remote);
  if(!saved.url&&!CLOSED.has(saved.order.status))saved.order=await syncCheckout(claimed._id,{userId:user._id,capture:false});
  return saved;
 }finally{await CheckoutOrder.updateOne({_id:order._id,creationClaim:claim},{$unset:{creationClaim:1,creationClaimUntil:1}});}
}
/** Operator/worker recovery is read-only by default. Replay is explicit and uses
 * the immutable original body/key, only within the provider retention horizon. */
export async function reconcileCreation(orderId,{allowReplay=false}={}){
 const order=await CheckoutOrder.findById(objectId(String(orderId))).select('+approvalUrl');
 if(!order)throw businessError('Checkout not found.',404);
 if(order.providerOrderId||order.status==='paid'||CLOSED.has(order.status))return syncCheckout(order._id,{capture:false});
 const user=await User.findOne({_id:order.user,role:'student'}).select('email');if(!user)throw businessError('Checkout customer needs review.',409);
 const result=await makeRemote(order,user,{allowReplay});return result.order;
}
/** Manual reconciliation binds a provider ID only after checking provider truth;
 * it never fabricates settlement and never calls PayPal capture. */
export async function bindRecoveredCheckout(orderId,providerOrderId){
 if(typeof providerOrderId!=='string'||!/^[-_A-Za-z0-9]{1,150}$/.test(providerOrderId))throw businessError('Invalid provider order reference.',400);
 const order=await CheckoutOrder.findById(objectId(String(orderId)));
 if(!order)throw businessError('Checkout not found.',404);
 if(order.providerOrderId&&order.providerOrderId!==providerOrderId)throw businessError('Checkout already has a different provider reference.',409);
 const candidate={...(order.toObject?order.toObject():order),providerOrderId};
 const evidence=order.provider==='stripe'?await stripeEvidence(candidate):order.autoRenew?await paypalSubscriptionEvidence(candidate):await paypalEvidence(candidate,{capture:false});
 if(evidence.state==='paid')assertEvidence(candidate,evidence);
 const updated=await CheckoutOrder.findOneAndUpdate({_id:order._id,$or:[{providerOrderId:{$exists:false}},{providerOrderId}]},{$set:{providerOrderId,recoveryRequired:false}},{new:true});
 if(!updated)throw businessError('Checkout changed during reconciliation.',409);
 await audit(null,{scope:'business',action:'checkout.provider_reference_reconciled',targetUser:order.user,entityType:'checkout',entityId:String(order._id),changes:{provider:order.provider,providerOrderId}});
 return syncCheckout(order._id,{capture:false});
}
export async function startCheckout(req){
 const body=req.body||{},kind=text(body.kind,'Purchase type',20,1),product=text(body.product,'Course or plan',200,1),provider=text(body.provider||'discount','Payment method',20,1),optionKey=body.optionKey==null?'':text(body.optionKey,'Price option',64),autoRenew=body.autoRenew===true,renewalSetup=body.renewalSetup===true;
 if(body.autoRenew!==undefined&&body.termsAccepted!==true)throw businessError('Accept the purchase and renewal terms before continuing.',400);
 const renewalOf=body.renewalOf?String(objectId(body.renewalOf)):'';
 if(renewalOf&&(kind!=='membership'||!await Subscription.exists({_id:renewalOf,user:req.user._id,plan:product})))throw businessError('Membership renewal record not found.',404);
 if(!(await capabilities()).transactions)throw businessError('Checkout requires transaction-capable database storage. No payment was started.',503);
 const key=digest(String(req.user._id)+':'+requestKey(req)),existing=await CheckoutOrder.findOne({requestKey:key,user:req.user._id}).select('+approvalUrl +requestFingerprint');
 const couponCode=body.couponCode==null?'':text(body.couponCode,'Coupon code',64).toUpperCase();
 const requestShape={kind,product,provider,optionKey,renewalOf,autoRenew,couponCode,...(renewalSetup?{renewalSetup:true}:{}),...(body.sourceInvoiceId?{sourceInvoiceId:body.sourceInvoiceId}:{})};
 const requestFingerprint=digest(stableJson(requestShape));
 if(existing){
  if(existing.requestFingerprint!==requestFingerprint)throw businessError('This checkout key belongs to another purchase.',409);
  if(['paid','renewal_ready'].includes(existing.status))return {order:publicOrder(existing),url:null};
  if(existing.provider==='discount'){await fulfillDiscountOrder(existing._id);return {order:publicOrder(await CheckoutOrder.findById(existing._id)),url:null};}
  if(existing.cancelRequestedAt||CLOSED.has(existing.status))throw businessError('The previous checkout is closed or being closed. Check its status before another purchase.',409);
  return makeRemote(existing,req.user);
 }
 const {product:item,offer,quote}=await quoteCheckout(req);
 if(body.quoteFingerprint&&body.quoteFingerprint!==quote.fingerprint||autoRenew&&body.quoteFingerprint!==quote.fingerprint)throw businessError('The price or offer changed. Review a fresh quote before paying.',409);
 if(autoRenew&&(!quote.availableProviders[provider]||quote.recurringUnavailableReason))throw businessError(quote.providerUnavailableReasons?.[provider]||quote.recurringUnavailableReason||'This provider does not support the selected automatic renewal term.',409);
 if(kind==='course'){
  if(item.accessType==='free')throw businessError('This course is free. Open the lesson player to begin.',409);
  if(item.accessType==='membership')throw businessError('This course requires an Academy membership.',409);
 }
 if(quote.amountMinor<0||quote.amountMinor>99999999||quote.subtotalMinor>99999999)throw businessError('The price needs administrator review.',409);
 const free=quote.amountMinor===0;
 if(free&&(!quote.couponId||quote.discountMinor!==quote.subtotalMinor||quote.subtotalMinor<=0||autoRenew))throw businessError('A fully discounted term requires a valid coupon and one-time access.',409);
 const config=free?{environment:'live'}:requireGateway(provider),currency=gatewayCurrency(quote.currency),orderId=String(new mongoose.Types.ObjectId());
 let order;
 try{order=await transaction(async session=>{
  const purchasingUser=await User.findOneAndUpdate({_id:req.user._id,role:'student',status:'active',removalState:{$nin:['pending','removed']}},{$inc:{commerceVersion:1}},{new:true,session});if(!purchasingUser)throw businessError('This account cannot start a new purchase while access or removal is restricted.',403);
  if(!renewalSetup)await assertNoActivePurchase(req.user._id,kind,product,{session,environment:config.environment});
  const conflict=await renewalCheckoutConflict(req.user._id,kind,product,{renewalSetup,autoRenew,environment:config.environment,session});if(conflict)throw businessError(conflict,409);
  if(renewalSetup){
   await renewalSourceInvoice(req.user._id,kind,product,{sourceInvoiceId:quote.sourceInvoiceId,environment:config.environment,session});
   const current=await renewalSetupTiming(req.user._id,kind,product,{session});
   if(current.reason||+current.billingStartsAt!==+new Date(quote.billingStartsAt))throw businessError(current.reason||'Your paid access dates changed. Refresh the renewal quote before continuing.',409);
  }
  if(autoRenew&&await BillingAgreement.exists({activeKey:[req.user._id,config.environment,kind,product].join(':')}).session(session))throw businessError('An automatic renewal already exists for this product. Manage it in My Billing before starting another.',409);
  if(quote.couponId)await claimCoupon({couponId:quote.couponId,orderId,userId:req.user._id,session});
  const order=await one(CheckoutOrder,{_id:orderId,user:req.user._id,provider:free?'discount':provider,environment:config.environment,kind,product,title:item.title||item.name,sectionSlug:kind==='section'?product:undefined,renewalOf:renewalOf||undefined,optionKey:offer.key,optionLabel:offer.label,amountMinor:quote.amountMinor,subtotalMinor:quote.subtotalMinor,discountMinor:quote.discountMinor,couponId:quote.couponId,discountFull:free,country:quote.country,currency,accessDays:0,durationMonths:quote.durationMonths,autoRenew,renewalSetup,sourceInvoiceId:renewalSetup?quote.sourceInvoiceId:undefined,billingStartsAt:renewalSetup?quote.billingStartsAt:undefined,renewalAmountMinor:quote.subtotalMinor,termsAcceptedAt:body.termsAccepted===true?new Date():undefined,requestKey:key,requestFingerprint,status:'creating',creationProtocolVersion:1,expiresAt:new Date(Date.now()+3600000)},session);
  if(autoRenew){const agreement=await one(BillingAgreement,{user:req.user._id,checkoutOrder:order._id,provider,environment:config.environment,kind,product,title:order.title,country:quote.country,currency,amountMinor:quote.subtotalMinor,intervalMonths:quote.durationMonths,renewalSetup,sourceInvoiceId:renewalSetup?quote.sourceInvoiceId:undefined,billingStartsAt:renewalSetup?quote.billingStartsAt:undefined,activeKey:[req.user._id,config.environment,kind,product].join(':'),termsAcceptedAt:new Date(),status:'creating'},session);order.billingAgreement=agreement._id;await order.save({session});}
  return order;
 });}catch(error){if(error.code!==11000&&error.status!==409)throw error;const concurrent=await CheckoutOrder.findOne({requestKey:key,user:req.user._id}).select('+approvalUrl +requestFingerprint');if(!concurrent||concurrent.requestFingerprint!==requestFingerprint)throw error;order=concurrent;}
 if(free){await fulfillDiscountOrder(order._id);return {order:publicOrder(await CheckoutOrder.findById(order._id)),url:null};}
 return makeRemote(order,req.user);
}
/** Recover an uncertain create response with the original key; do not create
 * another provider order just because a browser/network response was lost. */
export async function checkoutStatus(req){
 const key=digest(String(req.user._id)+':'+requestKey(req));
 const order=await CheckoutOrder.findOne({requestKey:key,user:req.user._id}).select('+approvalUrl');
 if(!order)return {found:false,order:null,url:null,creationPending:false};
 return {found:true,order:publicOrder(order),url:order.status==='pending'&&!order.cancelRequestedAt?order.approvalUrl||null:null,
  creationPending:!order.providerOrderId&&new Date(order.creationClaimUntil||0)>new Date()};
}
export async function fulfillOnlineOrder(orderId,evidence,verificationSource='provider_api'){
 // No external provider calls inside the transaction: retries must only repeat database operations.
 const recurring=await CheckoutOrder.findById(objectId(String(orderId)));
 if(recurring?.autoRenew)return settleRecurringPeriod(recurring,evidence,verificationSource);
 return transaction(async session=>{
  const order=await CheckoutOrder.findById(objectId(String(orderId))).session(session);if(!order)throw businessError('Checkout order not found.',404);assertEvidence(order,evidence);
  if(order.status==='paid')return publicOrder(order);
  if(order.couponId)await consumeCoupon({couponId:order.couponId,orderId:order._id,session});
  const user=await User.findOneAndUpdate({_id:order.user,role:'student'},{$inc:{commerceVersion:1}},{new:true,session});
  if(!user)throw businessError('Paid order customer needs review.',409);
  const date=new Date(evidence.paidAt),testMode=order.environment==='test',accessCancelledAt=order.accessCancelledAt||(['pending','removed'].includes(user.removalState)?user.removalRequestedAt||new Date():null);let start=date,expires=null,grantNote='',grantStart=date,grantSuppressed=false,stored=null,preserveDisplay=false;
  // Serialize paid renewals per user, so independent successful payments cannot overwrite each other.
  if(order.kind==='membership'){
   const previous=await Subscription.findOne({user:user._id,status:'active',testMode:testMode?true:{$ne:true},endsAt:{$gt:date}}).sort({endsAt:-1}).session(session);
   if(previous)start=new Date(previous.endsAt);expires=addMonths(start,order.durationMonths);
  }else if(order.kind==='section'){
   const current=await effectiveSectionAccess(user._id,order.product,session,{environment:order.environment,now:date,includeScheduled:true});const period=courseMonthPeriod(current,date,order.durationMonths);start=period.startsAt;expires=period.endsAt;grantStart=current?.accessExpiresAt&&new Date(current.accessExpiresAt)>date?new Date(current.accessExpiresAt):date;
  }else{
   stored=await Enrollment.findOne({user:user._id,courseSlug:order.product}).select('+baseGrant').session(session);
   const current=await effectiveCourseEnrollment(user._id,order.product,session,{environment:order.environment,now:date,includeScheduled:true});
   preserveDisplay=testMode&&stored&&stored.testMode!==true;
   if(current?.status==='active'&&new Date(current.accessStartsAt)>date){
    start=new Date(current.accessStartsAt);expires=current.accessExpiresAt;grantSuppressed=true;
    grantNote='Payment received; existing scheduled course access needs Academy review.';
   }else if(order.durationMonths==null&&current?.status==='active'&&new Date(current.accessStartsAt)<=date&&(!current.accessExpiresAt||new Date(current.accessExpiresAt)>date)){
    start=current.accessStartsAt;expires=current.accessExpiresAt;grantSuppressed=true;
    grantNote='Payment received while this course was already accessible. Existing access was preserved; contact the Academy to review the duplicate purchase.';
   }else{
    const period=order.durationMonths==null?coursePeriod(current,date,order.accessDays||0):courseMonthPeriod(current,date,order.durationMonths);
    start=period.startsAt;expires=period.endsAt;grantSuppressed=Boolean(period.alreadyLifetime);
    grantStart=current?.accessExpiresAt&&new Date(current.accessStartsAt)<=date&&new Date(current.accessExpiresAt)>date?new Date(current.accessExpiresAt):date;
    if(period.alreadyLifetime)grantNote='Payment received; existing legacy no-expiry course access was preserved.';
   }
   if(preserveDisplay&&!grantSuppressed)grantNote='Sandbox payment recorded separately; existing real course access was preserved.';
  }
  if(accessCancelledAt){grantSuppressed=true;grantNote='Payment recorded after access cancellation or account removal. Access was not restored; no refund was issued.';}
  const invoice=await one(Invoice,{number:'SA-ONLINE-'+String(order._id).toUpperCase(),user:user._id,kind:order.kind,title:order.title,courseSlug:order.kind==='course'?order.product:undefined,sectionSlug:order.kind==='section'?order.product:undefined,subtotalMinor:order.subtotalMinor??order.amountMinor,discountMinor:order.discountMinor||0,coupon:order.couponId,planName:order.kind==='membership'?order.product:undefined,accessDays:order.accessDays,durationMonths:order.durationMonths,accessStartsAt:start,accessExpiresAt:expires,noScheduledExpiry:expires===null,grantVersion:1,grantStartsAt:order.kind==='membership'?start:grantStart,grantExpiresAt:expires,grantNoExpiry:expires===null,grantSuppressed,...(accessCancelledAt?{accessRevokedAt:accessCancelledAt,accessCancelledAt,accessCancellationReason:['pending','removed'].includes(user.removalState)?'account_removed':'owner_immediate'}:{}),renewalOf:order.renewalOf,dueAt:date,currency:order.currency,totalMinor:order.amountMinor,paidMinor:order.amountMinor,creditedMinor:0,status:'paid',paidAt:date,fulfillmentAt:new Date(),createdBy:user._id,origin:'online_checkout',testMode,requestKey:'online-invoice-'+String(order._id),requestFingerprint:digest(String(order._id))},session);
  const payment=await one(Payment,{user:user._id,invoice:invoice._id,checkoutOrder:order._id,kind:order.kind,courseSlug:order.kind==='course'?order.product:undefined,sectionSlug:order.kind==='section'?order.product:undefined,provider:order.provider,providerPaymentId:evidence.paymentId,providerRecordKey:[order.provider,order.environment,evidence.paymentId].join(':'),status:'paid',amountMinor:order.amountMinor,amount:order.amountMinor/100,currency:order.currency,paidAt:date,verifiedAt:new Date(),verificationSource,testMode,reference:evidence.paymentId,requestKey:'online-payment-'+String(order._id),requestFingerprint:digest(String(order._id))},session);
  if(!accessCancelledAt&&order.kind==='membership'){const term=await one(Subscription,{user:user._id,plan:order.product,status:'active',startsAt:start,endsAt:expires,dueAt:null,durationMonths:order.durationMonths,priceMinor:order.amountMinor,currency:order.currency,invoice:invoice._id,source:'provider',cancelAtPeriodEnd:true,testMode},session);await syncMembershipCourseEnrollments({userId:user._id,startsAt:start,endsAt:expires,invoice:invoice._id,testMode,session,reason:`Academy membership: ${order.product}`});await queueSubscriptionConfirmation(term,session);}
  else if(!accessCancelledAt&&order.kind==='section')await grantSectionAccess({userId:user._id,sectionSlug:order.product,startsAt:grantStart,endsAt:expires,invoice:invoice._id,testMode,session});
  else if(!grantSuppressed&&!preserveDisplay)await Enrollment.findOneAndUpdate({user:user._id,courseSlug:order.product},{$set:{status:'active',accessStartsAt:start,accessExpiresAt:expires,source:'provider',invoice:invoice._id,reason:'Verified online payment '+evidence.paymentId,testMode,...(baseGrantSnapshot(stored)?{baseGrant:baseGrantSnapshot(stored)}:{})}},{upsert:true,new:true,runValidators:true,session});
  if(!accessCancelledAt&&order.kind==='course')await queueCourseConfirmation(order,invoice,session);
  order.status='paid';order.recoveryRequired=false;order.recoveryReason=undefined;order.paidAt=date;order.invoice=invoice._id;order.payment=payment._id;order.accessStartsAt=start;order.accessExpiresAt=expires;order.grantNote=grantNote;await order.save({session});
  await one(Notification,{dedupeKey:'online-paid-'+String(order._id),type:grantNote?'payment_review':'payment_received',title:testMode?'Sandbox payment received':'Online payment received',message:`${user.name} purchased ${order.title} through ${order.provider}. ${order.currency} ${(order.amountMinor/100).toFixed(2)}.${grantNote?' '+grantNote:''}${user.status==='blocked'?' Customer account is blocked; contact the owner.':''}`,user:user._id,link:order.kind==='course'?'/admin?section=purchases':'/admin?section=subscriptions',entityId:String(payment._id)},session);
  await audit(null,{scope:'business',action:'payment.online_verified',targetUser:user._id,entityType:'checkout',entityId:String(order._id),changes:{provider:order.provider,environment:order.environment,amountMinor:order.amountMinor,currency:order.currency,invoice:String(invoice._id),verificationSource}},session);
  return publicOrder(order);
 });
}
export async function syncCheckout(orderId,{userId,capture=false,verificationSource='provider_api'}={}){
 const filter={_id:objectId(String(orderId)),...(userId?{user:objectId(String(userId))}:{})},order=await CheckoutOrder.findOne(filter);
 if(!order)throw businessError('Checkout order not found.',404);if(order.status==='paid')return publicOrder(order);
 if(!order.providerOrderId)return publicOrder(order);
 let evidence;
 if(order.provider==='paypal'&&order.autoRenew)evidence=await paypalSubscriptionEvidence(order);
 else if(order.provider==='paypal'&&capture){
  // The same database lease is used by provider switching. Before an external
  // capture, persist an uncertainty marker; expiry of a lease never erases it.
  const claimed=await claimCheckoutOperation(order._id);
  try{
   evidence=await paypalEvidence(claimed,{capture:!claimed.cancelRequestedAt,
    onBeforeCapture:async()=>{
     if(await User.exists({_id:claimed.user,removalState:{$in:['pending','removed']}}))throw businessError('Account removal prevents any new PayPal capture.',409);
     const result=await CheckoutOrder.updateOne({_id:claimed._id,operationClaim:claimed.operationClaim,cancelRequestedAt:{$exists:false}},
      {$set:{captureAttemptedAt:new Date()}});
     if(result.matchedCount!==1)throw businessError('Checkout changed before PayPal capture. Check payment status.',409);
    }});
  }finally{await releaseCheckoutOperation(claimed);}
 }else evidence=order.provider==='stripe'?await stripeEvidence(order):await paypalEvidence(order,{capture:false});
 if(evidence.state==='renewal_ready')return confirmRenewalSetup(order,evidence);
 if(evidence.state==='paid')return fulfillOnlineOrder(order._id,evidence,verificationSource);
 if(order.provider==='paypal'&&order.autoRenew&&evidence.state==='cancelled')await refreshPayPalAgreement(order.providerOrderId);
 if(['expired','cancelled','failed'].includes(evidence.state))await CheckoutOrder.updateOne({_id:order._id,status:{$nin:['paid','renewal_ready']}},{$set:{status:evidence.state,recoveryRequired:false},$unset:{recoveryReason:1}});
 const updated=await CheckoutOrder.findById(order._id);return publicOrder(updated);
}

/** Persistent operation lease: switching and app-initiated PayPal capture cannot
 * execute concurrently, even in different tabs, webhooks or server instances.
 */
async function claimCheckoutOperation(id){
 const token=crypto.randomUUID(),now=new Date();
 const claimed=await CheckoutOrder.findOneAndUpdate({_id:id,$or:[
  {operationClaimUntil:{$exists:false}},{operationClaimUntil:{$lt:now}}
 ]},{$set:{operationClaim:token,operationClaimUntil:new Date(+now+90000)}},{new:true})
  .select('+operationClaim +replacementKey');
 if(!claimed)throw businessError('This checkout is currently being checked. Please try the same action again shortly.',409);
 return claimed;
}
async function releaseCheckoutOperation(order){
 await CheckoutOrder.updateOne({_id:order._id,operationClaim:order.operationClaim},
  {$unset:{operationClaim:1,operationClaimUntil:1}});
}

/** Explicit user-requested release before choosing either payment method again.
 * The original request key and authenticated owner identify the checkout.
 * No charge, refund, invoice or entitlement is fabricated here.
 */
export async function releaseCheckout(req){
 const key=digest(String(req.user._id)+':'+requestKey(req));
 let original=await CheckoutOrder.findOne({requestKey:key,user:req.user._id});
 if(!original)throw businessError('The earlier checkout could not be identified yet. Check its status before paying again.',409);
 if(['paid','renewal_ready'].includes(original.status))return {released:false,order:publicOrder(original)};
 if(!original.providerOrderId&&!CLOSED.has(original.status)){
  if(original.creationProtocolVersion===1&&!original.creationAttemptedAt){
   const closed=await CheckoutOrder.findOneAndUpdate({_id:original._id,creationProtocolVersion:1,creationAttemptedAt:{$exists:false},providerOrderId:{$exists:false},status:'creating',$or:[{creationClaimUntil:{$exists:false}},{creationClaimUntil:{$lt:new Date()}}]},
    {$set:{status:'cancelled',cancelRequestedAt:new Date(),recoveryRequired:false}},{new:true});
   if(!closed)throw businessError('The previous checkout is still being prepared. Retry the same action shortly.',409);original=closed;
  }else{
   await makeRemote(original,req.user);
   original=await CheckoutOrder.findOne({_id:original._id,user:req.user._id});
   if(!original?.providerOrderId&&!CLOSED.has(original?.status))throw businessError('The earlier checkout is still being reconciled. Check the same order.',409);
  }
 }
 const claimed=await claimCheckoutOperation(original._id);
 try{
  if(['paid','renewal_ready'].includes(claimed.status))return {released:false,order:publicOrder(claimed)};
  if(claimed.provider==='paypal'&&claimed.providerOrderId&&!claimed.cancelRequestedAt||!['failed','expired','cancelled'].includes(claimed.status)){
   const mark=await CheckoutOrder.updateOne({_id:claimed._id,operationClaim:claimed.operationClaim,status:{$ne:'paid'}},
    {$set:{cancelRequestedAt:claimed.cancelRequestedAt||new Date()}});
   if(mark.matchedCount!==1)throw businessError('Checkout changed while switching. Check its payment status.',409);
   claimed.cancelRequestedAt=claimed.cancelRequestedAt||new Date();
   const truth=claimed.provider==='stripe'?await closeStripeCheckout(claimed):claimed.autoRenew?await closePayPalSubscriptionCheckout(claimed):await closePayPalCheckout(claimed);
   if(truth.state==='renewal_ready')return {released:false,order:await confirmRenewalSetup(claimed,truth)};
   if(truth.state==='paid')return {released:false,order:await fulfillOnlineOrder(claimed._id,truth)};
   if(!['failed','expired','cancelled'].includes(truth.state))
    throw businessError('The earlier payment is still processing. Check its status before switching methods.',409);
   await CheckoutOrder.updateOne({_id:claimed._id,operationClaim:claimed.operationClaim,status:{$ne:'paid'}},
    {$set:{status:truth.state}});
  }
  // Retrying a release, including from a second tab, gets ONE replacement key.
  // Competing provider choices cannot create two replacements for the old order.
  const replacement=claimed.replacementKey||crypto.randomUUID();
  const closed=await CheckoutOrder.findOneAndUpdate({_id:claimed._id,operationClaim:claimed.operationClaim,
    status:{$in:['failed','expired','cancelled']}},
    {$set:{replacementKey:replacement}},{new:true}).select('+replacementKey');
  if(!closed){
   const latest=await CheckoutOrder.findById(claimed._id);
   if(['paid','renewal_ready'].includes(latest?.status))return {released:false,order:publicOrder(latest)};
   throw businessError('Checkout status changed. Check My Billing before paying again.',409);
  }
  if(closed.billingAgreement)await BillingAgreement.updateOne({_id:closed.billingAgreement,status:'creating'},{$set:{status:'cancelled',autoRenew:false},$unset:{activeKey:1}});
  if(closed.couponId)await transaction(session=>releaseCoupon({couponId:closed.couponId,orderId:closed._id,session}));
  return {released:true,order:publicOrder(closed),replacementKey:closed.replacementKey};
 }finally{await releaseCheckoutOperation(claimed);}
}

/** A 100% coupon creates financial discount evidence, never a fake provider payment. */
export async function fulfillDiscountOrder(orderId){
 return transaction(async session=>{
  const order=await CheckoutOrder.findById(orderId).select('+requestFingerprint').session(session);if(!order)throw businessError('Discount order not found.',404);
  if(order.status==='paid')return publicOrder(order);
  if(order.provider!=='discount'||!order.discountFull||!order.couponId||order.autoRenew||order.amountMinor!==0||order.discountMinor!==order.subtotalMinor||order.subtotalMinor<=0)throw businessError('Invalid full discount evidence.',409);
  const user=await User.findOneAndUpdate({_id:order.user,role:'student',status:{$ne:'blocked'}},{$inc:{commerceVersion:1}},{new:true,session});if(!user)throw businessError('Student account is unavailable.',403);
  if(['pending','removed'].includes(user.removalState)||order.accessCancelledAt)throw businessError('Account removal or access cancellation prevents activating this discount.',409);
  await consumeCoupon({couponId:order.couponId,orderId:order._id,session});const start=new Date(),end=addMonths(start,order.durationMonths);
  const invoice=await one(Invoice,{number:'SA-COUPON-'+String(order._id).toUpperCase(),user:user._id,kind:order.kind,title:order.title,courseSlug:order.kind==='course'?order.product:undefined,sectionSlug:order.kind==='section'?order.product:undefined,currency:order.currency,totalMinor:0,paidMinor:0,creditedMinor:0,discountFull:true,coupon:order.couponId,subtotalMinor:order.subtotalMinor,discountMinor:order.discountMinor,status:'paid',paidAt:start,dueAt:start,fulfillmentAt:start,origin:'coupon',createdBy:user._id,accessStartsAt:start,accessExpiresAt:end,durationMonths:order.durationMonths,grantVersion:1,grantStartsAt:start,grantExpiresAt:end,testMode:false,requestKey:'coupon-invoice-'+order._id,requestFingerprint:order.requestFingerprint},session);
  if(order.kind==='section')await grantSectionAccess({userId:user._id,sectionSlug:order.product,startsAt:start,endsAt:end,invoice:invoice._id,testMode:false,session});
  else if(order.kind==='course'){const stored=await Enrollment.findOne({user:user._id,courseSlug:order.product}).select('+baseGrant').session(session);await Enrollment.findOneAndUpdate({user:user._id,courseSlug:order.product},{$set:{...(baseGrantSnapshot(stored)?{baseGrant:baseGrantSnapshot(stored)}:{}),status:'active',accessStartsAt:start,accessExpiresAt:end,source:'provider',invoice:invoice._id,testMode:false,reason:'Verified full-discount coupon'}},{upsert:true,new:true,runValidators:true,session});}
  else throw businessError('Coupons apply to individual courses or sections.',409);
  order.status='paid';order.paidAt=start;order.invoice=invoice._id;order.accessStartsAt=start;order.accessExpiresAt=end;await order.save({session});
  await audit(null,{scope:'business',action:'coupon.fulfilled',targetUser:user._id,entityType:'checkout',entityId:String(order._id),changes:{invoice:String(invoice._id),discountMinor:order.discountMinor}},session);return publicOrder(order);
 });
}

/** Internal shutdown path: never creates or replays a provider checkout. The
 * original uncertainty/lease remains authoritative during account removal. */
export async function closeCheckoutWithoutCreating(orderId){
 let order=await CheckoutOrder.findById(objectId(String(orderId)));if(!order)throw businessError('Checkout not found.',404);
 if(['paid','renewal_ready'].includes(order.status))return publicOrder(order);
 if(!order.providerOrderId&&!CLOSED.has(order.status)){
  if(order.creationProtocolVersion===1&&!order.creationAttemptedAt){
   const closed=await CheckoutOrder.findOneAndUpdate({_id:order._id,status:'creating',providerOrderId:{$exists:false},creationAttemptedAt:{$exists:false},$or:[{creationClaimUntil:{$exists:false}},{creationClaimUntil:{$lt:new Date()}}]},{$set:{status:'cancelled',cancelRequestedAt:new Date()}},{new:true});
   if(!closed)throw businessError('A provider checkout is still in flight. Retry shutdown after its identity is confirmed.',503);order=closed;
  }else{await reconcileCreation(order._id,{allowReplay:false});order=await CheckoutOrder.findById(order._id);if(!order.providerOrderId&&!CLOSED.has(order.status))throw businessError('Provider checkout identity is still unresolved. No new checkout was created.',503);}
 }
 if(CLOSED.has(order.status)&&!order.providerOrderId){if(order.couponId)await transaction(session=>releaseCoupon({couponId:order.couponId,orderId:order._id,session}));return publicOrder(order);}
 const claimed=await claimCheckoutOperation(order._id);
 try{
  await CheckoutOrder.updateOne({_id:claimed._id,operationClaim:claimed.operationClaim},{$set:{cancelRequestedAt:claimed.cancelRequestedAt||new Date()}});claimed.cancelRequestedAt=claimed.cancelRequestedAt||new Date();
  const truth=claimed.provider==='stripe'?await closeStripeCheckout(claimed):claimed.autoRenew?await closePayPalSubscriptionCheckout(claimed):await closePayPalCheckout(claimed);
  if(truth.state==='paid')return fulfillOnlineOrder(claimed._id,truth);
  if(truth.state==='renewal_ready')return confirmRenewalSetup(claimed,truth);
  if(!CLOSED.has(truth.state))throw businessError('Provider checkout closure is not yet confirmed.',503);
  await transaction(async session=>{await CheckoutOrder.updateOne({_id:claimed._id,operationClaim:claimed.operationClaim,status:{$nin:['paid','renewal_ready']}},{$set:{status:truth.state}},{session});if(claimed.couponId)await releaseCoupon({couponId:claimed.couponId,orderId:claimed._id,session});});
  return publicOrder(await CheckoutOrder.findById(claimed._id));
 }finally{await releaseCheckoutOperation(claimed);}
}
