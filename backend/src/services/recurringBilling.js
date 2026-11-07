import crypto from 'node:crypto';
import BillingAgreement from '../models/BillingAgreement.js';
import CheckoutOrder from '../models/CheckoutOrder.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import {transaction} from './businessWrite.js';
import {businessError,toMinor} from '../utils/business.js';
import {assertEvidence,paymentEnvironment} from '../utils/commerce.js';
import {objectId} from './businessRead.js';
import {getStripe,paypalApi,stripeSubscriptionInvoiceEvidence} from './paymentProviders.js';
import {grantSectionAccess} from './sectionAccess.js';
import {consumeCoupon} from './coupons.js';
import {syncMembershipCourseEnrollments} from './membershipEnrollments.js';
import {baseGrantSnapshot} from './courseEntitlements.js';
import {audit} from './audit.js';
import {publicOrder,syncCheckout} from './onlineCheckout.js';
import {paypalSubscriptionEvidence,readPayPalSubscription,assertPayPalResume,paypalNextBilling,paypalCollectionState} from './paypalSubscriptions.js';
const one=async(Model,body,session)=>(await Model.create([body],{session}))[0];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const ended=a=>['cancelled','canceled','incomplete_expired','expired'].includes(a.status);
function renewalConsentFingerprint(a){return hash(JSON.stringify([String(a._id),String(a.checkoutOrder),a.provider,a.environment,a.providerSubscriptionId,a.amountMinor,a.currency,a.intervalMonths,...(a.provider==='paypal'?[a.providerNextBillingAt?new Date(a.providerNextBillingAt).toISOString():null]:[])]));}
export function publicAgreement(a){
 const accessCancellation=Boolean(a.accessCancellationRequestedAt||a.accessCancelledAt),bound=Boolean(a.providerSubscriptionId)&&!ended(a)&&!accessCancellation,paidPeriod=Number.isFinite(+new Date(a.currentPeriodEnd))&&new Date(a.currentPeriodEnd)>new Date(),pending=a.renewalOperation;
 return {_id:a._id,sourceInvoiceId:a.sourceInvoiceId?String(a.sourceInvoiceId):null,accessCancelledAt:a.accessCancelledAt||null,canCancelAccess:!a.accessCancelledAt&&(!pending||pending.action==='cancel_access'),title:a.title,kind:a.kind,product:a.product,provider:a.provider,environment:a.environment,status:a.status,autoRenew:a.autoRenew,cancelAtPeriodEnd:a.cancelAtPeriodEnd,currentPeriodStart:a.currentPeriodStart,currentPeriodEnd:a.currentPeriodEnd,intervalMonths:a.intervalMonths,amountMinor:a.amountMinor,currency:a.currency,country:a.country,
  canDisableRenewal:bound&&(pending?pending.autoRenew===false:a.autoRenew===true&&!a.cancelAtPeriodEnd)&&(a.provider!=='paypal'||a.status==='active'),
  canEnableRenewal:bound&&Boolean(a.activeKey)&&(a.provider==='paypal'?a.status==='paused'&&a.providerOutstandingMinor===0&&a.providerFailedPayments===0&&new Date(a.providerNextBillingAt)>new Date()&&(pending?pending.autoRenew===true:a.autoRenew===false):(a.status==='active'||a.status==='trialing'&&a.renewalSetup===true)&&paidPeriod&&(pending?pending.autoRenew===true:a.autoRenew===false&&a.cancelAtPeriodEnd===true)),
  canEndDisabledAgreement:a.provider==='paypal'&&bound&&a.status==='paused'&&a.autoRenew===false&&(!pending||pending.action==='end'),renewalControlMode:a.provider==='paypal'?'suspend':'cancel_at_period_end',providerNextBillingAt:a.providerNextBillingAt,renewalSetup:a.renewalSetup===true,billingStartsAt:a.billingStartsAt,setupConfirmedAt:a.setupConfirmedAt,renewalActionPending:Boolean(pending),...(pending?{renewalPendingAutoRenew:pending.autoRenew,renewalPendingAction:pending.action||(pending.autoRenew?'enable':'disable')}:{}),renewalConsentFingerprint:renewalConsentFingerprint(a)};
}
/** Provider-confirmed deferred setup saves a mandate, never a paid invoice or a
 * free entitlement. The existing financial grants remain the only access. */
export async function confirmRenewalSetup(original,evidence){
 if(!original.renewalSetup||!original.autoRenew||!['stripe','paypal'].includes(original.provider)||evidence.state!=='renewal_ready'||evidence.provider!==original.provider||evidence.environment!==original.environment||evidence.providerOrderId!==original.providerOrderId||evidence.orderId!==String(original._id)||evidence.futureAmountMinor!==original.amountMinor||evidence.currency!==original.currency||evidence.providerStatus!==(original.provider==='paypal'?'active':'trialing')||typeof evidence.providerSubscriptionId!=='string'||original.provider==='stripe'&&typeof evidence.providerInvoiceId!=='string'||+new Date(evidence.billingStartsAt)!==+new Date(original.billingStartsAt)||new Date(evidence.billingStartsAt)<=new Date())throw businessError('Deferred renewal confirmation did not match the accepted agreement.',409);
 return transaction(async session=>{
  const order=await CheckoutOrder.findById(original._id).session(session);if(!order)throw businessError('Renewal setup checkout is missing.',409);
  const agreement=await BillingAgreement.findOne({_id:order.billingAgreement,user:order.user,checkoutOrder:order._id}).session(session);if(!agreement)throw businessError('Renewal setup agreement is missing.',409);
  if(agreement.providerSubscriptionId&&agreement.providerSubscriptionId!==evidence.providerSubscriptionId)throw businessError('Renewal setup subscription changed.',409);
  if(agreement.accessCancelledAt||['paid','renewal_ready'].includes(order.status))return publicOrder(order);
  const confirmedAt=new Date();agreement.providerSubscriptionId=evidence.providerSubscriptionId;agreement.providerCustomerId=evidence.providerCustomerId;agreement.status=evidence.providerStatus;agreement.providerProductId=order.providerProductId;agreement.providerPlanId=order.providerPlanId;if(order.provider==='paypal'){agreement.providerStartAt=evidence.billingStartsAt;agreement.providerNextBillingAt=evidence.billingStartsAt;agreement.providerOutstandingMinor=0;agreement.providerFailedPayments=0;}agreement.autoRenew=!evidence.cancelAtPeriodEnd;agreement.cancelAtPeriodEnd=evidence.cancelAtPeriodEnd;agreement.currentPeriodStart=evidence.periodStartsAt;agreement.currentPeriodEnd=evidence.billingStartsAt;agreement.setupConfirmedAt=confirmedAt;await agreement.save({session});
  order.status='renewal_ready';order.setupConfirmedAt=confirmedAt;await order.save({session});
  await audit(null,{scope:'business',action:'subscription.renewal_setup_confirmed',targetUser:order.user,entityType:'billing_agreement',entityId:String(agreement._id),changes:{provider:order.provider,providerSubscriptionId:evidence.providerSubscriptionId,billingStartsAt:evidence.billingStartsAt,amountMinor:agreement.amountMinor,currency:agreement.currency,intervalMonths:agreement.intervalMonths,noChargeNow:true}},session);
  return publicOrder(order);
 });
}
function validatedRecurringEvidence(order,evidence){
 const expected=evidence.billingReason==='subscription_create'?order.amountMinor:order.renewalAmountMinor;
 assertEvidence({...order.toObject?.()||order,amountMinor:expected},evidence);
 if(!order.autoRenew||!['stripe','paypal'].includes(order.provider)||typeof evidence.providerSubscriptionId!=='string'||typeof evidence.providerInvoiceId!=='string'||!['subscription_create','subscription_cycle'].includes(evidence.billingReason))throw businessError('Invalid recurring settlement.',409);
 const start=new Date(evidence.periodStartsAt),end=new Date(evidence.periodEndsAt);
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw businessError('Invalid provider billing period.',409);
 if(order.renewalSetup&&(start<new Date(order.billingStartsAt)||new Date(evidence.paidAt)<new Date(+new Date(order.billingStartsAt)-300000)))throw businessError('Deferred renewal was collected before the accepted first charge date. Reconcile with the provider.',409);
 return {start,end,expected};
}
/** Called only with freshly verified provider evidence. Every invoice is its own
 * immutable grant; old/replayed invoices cannot extend an already paid period. */
export async function settleRecurringPeriod(original,evidence,verificationSource='provider_webhook'){
 const {start,end,expected}=validatedRecurringEvidence(original,evidence),providerInvoiceKey=[original.provider,original.environment,evidence.providerInvoiceId].join(':');
 return transaction(async session=>{
  const order=await CheckoutOrder.findById(original._id).session(session);if(!order)throw businessError('Recurring checkout is missing.',409);
  const agreement=await BillingAgreement.findOne({_id:order.billingAgreement,user:order.user,checkoutOrder:order._id}).session(session);if(!agreement)throw businessError('Recurring agreement needs reconciliation.',409);
  if(agreement.providerSubscriptionId&&agreement.providerSubscriptionId!==evidence.providerSubscriptionId)throw businessError('Recurring subscription changed.',409);
  if(await Invoice.exists({providerInvoiceKey}).session(session))return publicOrder(order);
  const user=await User.findOneAndUpdate({_id:order.user,role:'student'},{$inc:{commerceVersion:1}},{new:true,session});if(!user)throw businessError('Recurring customer needs reconciliation.',409);
  const first=evidence.billingReason==='subscription_create';
  if(first&&order.couponId)await consumeCoupon({couponId:order.couponId,orderId:order._id,session});
  const testMode=order.environment==='test',date=new Date(evidence.paidAt),accessCancelledAt=agreement.accessCancelledAt||(['pending','removed'].includes(user.removalState)?user.removalRequestedAt||new Date():null),cancellationReason=['pending','removed'].includes(user.removalState)?'account_removed':'owner_immediate';
  const invoice=await one(Invoice,{number:'SA-RENEW-'+evidence.providerInvoiceId,user:order.user,kind:order.kind,title:order.title,courseSlug:order.kind==='course'?order.product:undefined,sectionSlug:order.kind==='section'?order.product:undefined,planName:order.kind==='membership'?order.product:undefined,durationMonths:order.durationMonths,accessStartsAt:start,accessExpiresAt:end,grantVersion:1,grantStartsAt:start,grantExpiresAt:end,currency:order.currency,totalMinor:expected,paidMinor:expected,creditedMinor:0,status:'paid',paidAt:date,dueAt:date,fulfillmentAt:new Date(),origin:'recurring',...(accessCancelledAt?{grantSuppressed:true,accessRevokedAt:accessCancelledAt,accessCancelledAt,accessCancellationReason:cancellationReason}:{}),testMode,createdBy:order.user,billingAgreement:agreement._id,providerInvoiceKey,subtotalMinor:order.renewalAmountMinor,discountMinor:first?order.discountMinor||0:0,coupon:first?order.couponId:undefined,requestKey:providerInvoiceKey,requestFingerprint:hash(providerInvoiceKey)},session);
  const payment=await one(Payment,{user:order.user,invoice:invoice._id,checkoutOrder:order._id,billingAgreement:agreement._id,providerInvoiceId:evidence.providerInvoiceId,kind:order.kind,courseSlug:order.kind==='course'?order.product:undefined,sectionSlug:order.kind==='section'?order.product:undefined,provider:order.provider,providerPaymentId:evidence.paymentId,providerRecordKey:[order.provider,order.environment,evidence.paymentId].join(':'),status:'paid',amountMinor:expected,amount:expected/100,currency:order.currency,paidAt:date,verifiedAt:new Date(),verificationSource,testMode,reference:evidence.paymentId,requestKey:'payment:'+providerInvoiceKey,requestFingerprint:hash(providerInvoiceKey)},session);
  if(!accessCancelledAt){
  if(order.kind==='membership'){
   await one(Subscription,{user:order.user,plan:order.product,status:'active',startsAt:start,endsAt:end,durationMonths:order.durationMonths,priceMinor:expected,currency:order.currency,invoice:invoice._id,source:'provider',billingAgreement:agreement._id,...(order.provider==='stripe'?{stripeSubscriptionId:evidence.providerSubscriptionId}:{paypalSubscriptionId:evidence.providerSubscriptionId}),cancelAtPeriodEnd:evidence.cancelAtPeriodEnd,testMode},session);
   await syncMembershipCourseEnrollments({userId:order.user,startsAt:start,endsAt:end,invoice:invoice._id,testMode,session});
  }else if(order.kind==='section')await grantSectionAccess({userId:order.user,sectionSlug:order.product,startsAt:start,endsAt:end,invoice:invoice._id,testMode,session});
  else{
   const stored=await Enrollment.findOne({user:order.user,courseSlug:order.product}).select('+baseGrant').session(session);
   if(!testMode||!stored||stored.testMode===true)await Enrollment.findOneAndUpdate({user:order.user,courseSlug:order.product},{$set:{status:'active',accessStartsAt:start,accessExpiresAt:end,source:'provider',invoice:invoice._id,testMode,reason:'Verified recurring provider invoice',...(baseGrantSnapshot(stored)?{baseGrant:baseGrantSnapshot(stored)}:{})}},{upsert:true,new:true,runValidators:true,session});
  }
  }
  agreement.providerSubscriptionId=evidence.providerSubscriptionId;agreement.providerCustomerId=evidence.providerCustomerId;agreement.providerProductId=order.providerProductId;agreement.providerPlanId=order.providerPlanId;if(order.provider==='paypal'){agreement.providerStartAt=evidence.remote?.start_time;agreement.providerNextBillingAt=evidence.providerNextBillingAt;agreement.providerOutstandingMinor=0;agreement.providerFailedPayments=0;}agreement.firstProviderInvoiceId=agreement.firstProviderInvoiceId||evidence.providerInvoiceId;
  if(!agreement.currentPeriodEnd||end>agreement.currentPeriodEnd){agreement.currentPeriodStart=start;agreement.currentPeriodEnd=end;agreement.lastProviderInvoiceId=evidence.providerInvoiceId;}
  agreement.status=evidence.providerStatus==='canceled'?'cancelled':['active','past_due','unpaid','paused'].includes(evidence.providerStatus)?evidence.providerStatus:'active';agreement.cancelAtPeriodEnd=evidence.cancelAtPeriodEnd===true;agreement.autoRenew=agreement.status!=='cancelled'&&agreement.status!=='paused'&&!agreement.cancelAtPeriodEnd;if(agreement.accessCancelledAt){agreement.status='cancelled';agreement.autoRenew=false;agreement.cancelAtPeriodEnd=false;}if(agreement.status==='cancelled'&&!agreement.accessCancellationRequestedAt||agreement.accessCancelledAt)agreement.activeKey=undefined;await agreement.save({session});
  if(order.renewalSetup){if(order.status!=='renewal_ready'){order.status='renewal_ready';order.setupConfirmedAt=order.setupConfirmedAt||new Date();await order.save({session});}}
  else if(order.status!=='paid'){order.status='paid';order.paidAt=date;order.invoice=invoice._id;order.payment=payment._id;order.accessStartsAt=start;order.accessExpiresAt=end;order.providerInvoiceId=evidence.providerInvoiceId;await order.save({session});}
  await one(Notification,{dedupeKey:providerInvoiceKey,type:'payment_received',title:testMode?'Sandbox renewal recorded':'Subscription payment received',message:accessCancelledAt?'A provider payment was recorded after access cancellation. No access was restored and no refund was issued.':`Verified ${order.currency} ${(expected/100).toFixed(2)} for ${order.title}. Paid access ends ${end.toISOString()}.`,user:order.user,link:'/admin?section=purchases'},session);
  await audit(null,{scope:'business',action:'subscription.invoice_paid',targetUser:order.user,entityType:'billing_agreement',entityId:String(agreement._id),changes:{providerInvoiceId:evidence.providerInvoiceId,amountMinor:expected,startsAt:start,endsAt:end,verificationSource}},session);
  return publicOrder(order);
 });
}
export async function reconcileStripeInvoice(invoiceId){
 const stripe=await getStripe(),invoice=await stripe.invoices.retrieve(invoiceId),ref=invoice.parent?.subscription_details?.subscription||invoice.subscription,subscriptionId=typeof ref==='string'?ref:ref?.id;
 if(!subscriptionId)return {ignored:true};
 const subscription=await stripe.subscriptions.retrieve(subscriptionId),localId=subscription.metadata?.sa_order_id;
 if(typeof localId!=='string'||!/^[a-f0-9]{24}$/i.test(localId))return {ignored:true};
 const order=await CheckoutOrder.findOne({_id:objectId(localId),provider:'stripe',environment:paymentEnvironment('stripe'),autoRenew:true});
 if(!order)return {ignored:true};if(!order.providerOrderId)throw businessError('Subscription checkout registration is pending. Retry webhook.',503);
 const expected=invoice.billing_reason==='subscription_create'?order.amountMinor:order.renewalAmountMinor;
 const evidence=await stripeSubscriptionInvoiceEvidence(order,subscriptionId,invoiceId,expected);
 if(evidence.state==='renewal_ready')return confirmRenewalSetup(order,evidence);
 if(evidence.state==='setup_history')return {ignored:true};
 if(evidence.state!=='paid')throw businessError('Provider invoice settlement is not yet available. Retry this signed event.',503);return settleRecurringPeriod(order,evidence,'provider_webhook');
}
async function ownedPayPalOrder(subscriptionId){
 if(typeof subscriptionId!=='string'||!/^[-A-Za-z0-9]{3,100}$/.test(subscriptionId))throw businessError('Invalid PayPal subscription reference.',400);
 const environment=paymentEnvironment('paypal');let order=await CheckoutOrder.findOne({provider:'paypal',environment,autoRenew:true,providerOrderId:subscriptionId});
 if(!order){const remote=await paypalApi('/v1/billing/subscriptions/'+encodeURIComponent(subscriptionId)+'?fields=plan'),localId=remote.custom_id;if(typeof localId!=='string'||!/^[a-f0-9]{24}$/i.test(localId))return null;order=await CheckoutOrder.findOne({_id:localId,provider:'paypal',environment,autoRenew:true});if(!order)return null;if(!order.providerOrderId)throw businessError('PayPal subscription registration is pending. Retry this event.',503);if(order.providerOrderId!==subscriptionId)throw businessError('PayPal subscription reference changed.',409);}
 return order;
}
function payPalAgreementState(order,remote){
 const status={APPROVAL_PENDING:'incomplete',APPROVED:'incomplete',ACTIVE:'active',SUSPENDED:'paused',CANCELLED:'cancelled',EXPIRED:'cancelled'}[remote.status]||'incomplete',next=paypalNextBilling(remote),outstanding=remote.billing_info?.outstanding_balance;
 return {status,autoRenew:remote.status==='ACTIVE',cancelAtPeriodEnd:false,providerSubscriptionId:remote.id,providerCustomerId:remote.subscriber?.payer_id,providerProductId:order.providerProductId,providerPlanId:order.providerPlanId,providerStartAt:remote.start_time,...(next?{providerNextBillingAt:next}:{}),providerOutstandingMinor:outstanding?.currency_code===order.currency?toMinor(outstanding.value,{allowZero:true}):undefined,providerFailedPayments:remote.billing_info?.failed_payments_count,...(status==='cancelled'?{cancelledAt:new Date()}:{} )};
}
export async function payPalLastPaymentRecorded(order,remote){
 const last=remote.billing_info?.last_payment;if(!last)return true;const at=new Date(last.time),amountMinor=toMinor(last.amount?.value,{allowZero:true});
 return Number.isFinite(+at)&&last.amount?.currency_code===order.currency&&Boolean(await Payment.exists({provider:'paypal',user:order.user,checkoutOrder:order._id,paidAt:{$gte:new Date(+at-1000),$lte:new Date(+at+1000)},currency:order.currency,amountMinor,testMode:order.environment==='test'}));
}
export async function assertPayPalCollectionsReconciled(order,remote){
 const dates=[order.createdAt,remote.create_time,remote.start_time].filter(Boolean).map(value=>+new Date(value)).filter(Number.isFinite),start=new Date(Math.min(Date.now()-86400000,...dates)),query=new URLSearchParams({start_time:start.toISOString(),end_time:new Date(Date.now()+1000).toISOString()}),history=await paypalApi('/v1/billing/subscriptions/'+encodeURIComponent(remote.id)+'/transactions?'+query);
 if(!Array.isArray(history.transactions)||history.total_pages>1||history.total_items!==undefined&&history.total_items!==history.transactions.length||(history.links||[]).some(link=>link.rel==='next'))throw businessError('PayPal financial history is incomplete. Reconcile the original agreement before ending or replacing it.',503);
 for(const row of history.transactions){
  const state=paypalCollectionState(row.status);if(state==='uncertain')throw businessError('A PayPal collection is pending or unresolved. The original billing agreement cannot be ended or replaced yet.',503);
  if(state==='clear')continue;
  const gross=row.amount_with_breakdown?.gross_amount,amountMinor=toMinor(gross?.value,{allowZero:true});
  if(gross?.currency_code!==order.currency||!await Payment.exists({providerRecordKey:['paypal',order.environment,row.id].join(':'),user:order.user,checkoutOrder:order._id,currency:order.currency,amountMinor,testMode:order.environment==='test'}))throw businessError('PayPal has an unrecorded recurring collection. Reconcile that payment before ending or replacing the original agreement.',503);
 }
 if(!await payPalLastPaymentRecorded(order,remote))throw businessError('PayPal reports an unrecorded last payment. Reconciliation must finish before this agreement can be replaced.',503);
}
export async function refreshPayPalAgreement(subscriptionId){
 const order=await ownedPayPalOrder(subscriptionId);if(!order)return {ignored:true};
 const remote=await readPayPalSubscription(order),state=payPalAgreementState(order,remote);if(state.status==='cancelled')await assertPayPalCollectionsReconciled(order,remote);
 const stored=await BillingAgreement.findOne({_id:order.billingAgreement,user:order.user,checkoutOrder:order._id});if(!stored)throw businessError('PayPal billing agreement needs reconciliation.',409);
 const preserveCancellation=stored.accessCancellationRequestedAt&&!stored.accessCancelledAt;
 const agreement=await BillingAgreement.findOneAndUpdate({_id:stored._id,__v:stored.__v},{$set:state,...(state.status==='cancelled'&&!preserveCancellation?{$unset:{activeKey:1,renewalOperation:1}}:{}),$inc:{__v:1}},{new:true,runValidators:true});
 if(!agreement)throw businessError('PayPal billing agreement needs reconciliation.',409);return publicAgreement(agreement);
}
export async function reconcilePayPalSubscription(subscriptionId,{saleId,refundAlreadyVerified=false}={}){
 const order=await ownedPayPalOrder(subscriptionId);if(!order)return {ignored:true};
 if(saleId&&await Invoice.exists({providerInvoiceKey:['paypal',order.environment,saleId].join(':')}))return {replayed:true};
 if(refundAlreadyVerified)throw businessError('The already-returned PayPal payment needs financial reconciliation before its refund can be recorded. No new access was granted.',503);
 const evidence=await paypalSubscriptionEvidence(order,{saleId});
 if(evidence.state==='paid'){const result=await settleRecurringPeriod(order,evidence,'provider_webhook');if(['CANCELLED','EXPIRED'].includes(evidence.remote?.status))await refreshPayPalAgreement(subscriptionId);return result;}
 if(evidence.state==='renewal_ready'){if(saleId)throw businessError('The claimed PayPal payment has not been collected. Retry reconciliation.',503);return confirmRenewalSetup(order,evidence);}
 await refreshPayPalAgreement(subscriptionId);if(saleId)throw businessError('PayPal recurring settlement is not yet available. Retry this event.',503);return {pending:evidence.state==='pending'};
}
async function changePayPalRemote(agreement,autoRenew,onBeforeMutation){
 const order=await CheckoutOrder.findOne({_id:agreement.checkoutOrder,user:agreement.user,provider:'paypal',providerOrderId:agreement.providerSubscriptionId});if(!order)throw businessError('PayPal agreement checkout is missing.',409);
 let remote=await readPayPalSubscription(order);if(autoRenew)assertPayPalResume(agreement,remote);
 const desired=autoRenew?'ACTIVE':'SUSPENDED';
 if(!autoRenew&&['CANCELLED','EXPIRED'].includes(remote.status)){await assertPayPalCollectionsReconciled(order,remote);return {remote,state:payPalAgreementState(order,remote)};}
 if(remote.status!==desired){
  if(autoRenew&&remote.status!=='SUSPENDED'||!autoRenew&&remote.status!=='ACTIVE')throw businessError('PayPal cannot change renewal for this agreement state. Finish or close its original approval first.',409);
  onBeforeMutation();try{await paypalApi('/v1/billing/subscriptions/'+encodeURIComponent(remote.id)+(autoRenew?'/activate':'/suspend'),{method:'POST',body:{reason:autoRenew?'Owner accepted the Academy recurring price and enabled renewal.':'Owner disabled Academy automatic renewal; existing paid access remains.'}});}catch(error){const current=await readPayPalSubscription(order);if(current.status!==desired)throw error;remote=current;}
 }
 remote=await readPayPalSubscription(order);if(remote.status!==desired)throw businessError('PayPal has not confirmed the requested renewal setting. Retry the same action.',502);if(autoRenew)assertPayPalResume(agreement,remote);
 return {remote,state:payPalAgreementState(order,remote)};
}
function assertAgreementIdentity(agreement,subscription){
 if(subscription.id!==agreement.providerSubscriptionId||subscription.metadata?.sa_order_id!==String(agreement.checkoutOrder)||subscription.metadata?.sa_user_id!==String(agreement.user)||subscription.livemode!==(agreement.environment==='live')||paymentEnvironment('stripe')!==agreement.environment)throw businessError('Provider agreement identity mismatch.',409);
}
function agreementState(subscription){
 const cancelled=['canceled','incomplete_expired'].includes(subscription.status),status=cancelled?'cancelled':subscription.status;
 return {status:['incomplete','trialing','active','past_due','cancelled','unpaid','paused'].includes(status)?status:'incomplete',cancelAtPeriodEnd:subscription.cancel_at_period_end===true,autoRenew:!cancelled&&subscription.cancel_at_period_end!==true,...(cancelled?{cancelledAt:new Date()}:{} )};
}
export async function refreshStripeAgreement(subscriptionId){
 const stripe=await getStripe(),env=paymentEnvironment('stripe');
 for(let attempt=0;attempt<3;attempt++){
  const subscription=await stripe.subscriptions.retrieve(subscriptionId);
  if(subscription.id!==subscriptionId||subscription.livemode!==(env==='live'))throw businessError('Subscription environment or identity mismatch.',409);
  let agreement=await BillingAgreement.findOne({provider:'stripe',environment:env,providerSubscriptionId:subscriptionId});
  if(!agreement){const localId=subscription.metadata?.sa_order_id;if(typeof localId!=='string'||!/^[a-f0-9]{24}$/i.test(localId))return {ignored:true};agreement=await BillingAgreement.findOne({provider:'stripe',environment:env,checkoutOrder:localId});if(!agreement)return {ignored:true};}
  if(agreement.providerSubscriptionId&&agreement.providerSubscriptionId!==subscriptionId)throw businessError('Subscription identity changed.',409);
  assertAgreementIdentity({...agreement.toObject(),providerSubscriptionId:subscriptionId},subscription);
  const state=agreementState(subscription),preserveCancellation=agreement.accessCancellationRequestedAt&&!agreement.accessCancelledAt,updated=await BillingAgreement.findOneAndUpdate({_id:agreement._id,__v:agreement.__v},{$set:{...state,providerSubscriptionId:subscriptionId},...(state.status==='cancelled'&&!preserveCancellation?{$unset:{activeKey:1,renewalOperation:1}}:{}),$inc:{__v:1}},{new:true,runValidators:true});
  if(updated)return publicAgreement(updated);
 }
 throw businessError('Subscription changed while being refreshed. Retry this event.',503);
}
function assertResumeTerms(agreement,body){
 if(body.termsAccepted!==true)throw businessError('Confirm the recurring price and renewal terms before enabling automatic renewal.',400);
 if(body.consentFingerprint!==renewalConsentFingerprint(agreement))throw businessError('The renewal details changed. Refresh and review the recurring price before enabling renewal.',409);
}
function assertResumable(agreement,remote){
 if(ended(agreement)||!agreement.activeKey||!['active','trialing'].includes(remote.status)||!agreement.currentPeriodEnd||new Date(agreement.currentPeriodEnd)<=new Date())throw businessError('This agreement cannot resume automatic renewal. Choose a new course or section checkout and accept its renewal terms.',409);
 const items=remote.items?.data,price=items?.[0]?.price,providerEnd=Number(items?.[0]?.current_period_end??remote.current_period_end)*1000;
 if(!Array.isArray(items)||items.length!==1||remote.items.has_more||price?.unit_amount!==agreement.amountMinor||price.currency?.toUpperCase()!==agreement.currency||price.recurring?.interval!=='month'||price.recurring.interval_count!==agreement.intervalMonths)throw businessError('The provider recurring price does not match your saved agreement. Renewal was not enabled; contact the Academy.',409);
 if(remote.status==='trialing'){
  const expected=Math.ceil(+new Date(agreement.billingStartsAt)/1000),method=typeof remote.default_payment_method==='string'?remote.default_payment_method:remote.default_payment_method?.id;
  if(!agreement.renewalSetup||!Number.isSafeInteger(expected)||remote.trial_end!==expected||providerEnd!==expected*1000||!method||remote.trial_settings?.end_behavior?.missing_payment_method!=='cancel')throw businessError('The provider first charge date or payment method differs from your accepted renewal setup. Renewal was not enabled.',409);
 }
 if(!Number.isFinite(providerEnd)||providerEnd<=Date.now()||providerEnd>+new Date(agreement.currentPeriodEnd)+1000)throw businessError('The current provider period has no confirmed matching paid access. Renewal was not enabled.',409);
}
/** One durable provider key per requested toggle. Opposing changes cannot race;
 * a lost provider response leaves the same operation available for safe retry. */
async function changeOwnedRenewal(userId,id,autoRenew,body={}){
 const owned={_id:objectId(String(id)),user:userId};let agreement=await BillingAgreement.findOne(owned);
 if(!agreement)throw businessError('Billing agreement not found.',404);
 if(agreement.accessCancellationRequestedAt||agreement.accessCancelledAt)throw businessError('Immediate access cancellation is already requested for this agreement. Retry that action or use a new checkout after it finishes.',409);
 if(autoRenew)assertResumeTerms(agreement,body);
 if(!autoRenew&&ended(agreement)&&!agreement.renewalOperation)return publicAgreement(agreement);
 if(!agreement.providerSubscriptionId)throw businessError('Checkout is still being prepared. Check or close that checkout before changing renewal.',409);
 const acquire=async session=>{
  if(autoRenew){const user=await User.findOneAndUpdate({_id:userId,role:'student',status:'active',removalState:{$nin:['pending','removed']}},{$inc:{commerceVersion:1}},{new:true,session});if(!user)throw businessError('Account removal or an access restriction prevents enabling renewal.',403);}
  const current=await BillingAgreement.findOne(owned).session(session);if(!current)throw businessError('Billing agreement not found.',404);
  if(current.accessCancellationRequestedAt||current.accessCancelledAt)throw businessError('Immediate cancellation is already requested for this agreement.',409);
  if(autoRenew)assertResumeTerms(current,body);
  let op=current.renewalOperation;if(op&&(['end','cancel_access'].includes(op.action)||op.autoRenew!==autoRenew))throw businessError('Another billing change is awaiting confirmation. Retry that action first.',409);
  if(op)return current;
  op={id:crypto.randomUUID(),autoRenew,action:autoRenew?'enable':'disable',startedAt:new Date()};
  const claimed=await BillingAgreement.findOneAndUpdate({...owned,renewalOperation:{$exists:false}},{$set:{renewalOperation:op},$inc:{__v:1}},{new:true,runValidators:true,session});if(!claimed)throw businessError('Another billing action is in progress. Refresh and retry.',409);return claimed;
 };
 agreement=autoRenew?await transaction(acquire):await acquire(null);const operation=agreement.renewalOperation;
 let mutationAttempted=false;
 try{
  if(autoRenew){assertResumeTerms(agreement,body);if(!await User.exists({_id:userId,role:'student',status:'active',removalState:{$nin:['pending','removed']}}))throw businessError('Account removal prevents enabling renewal.',403);}
  let remote,state;
  if(agreement.provider==='paypal')({remote,state}=await changePayPalRemote(agreement,autoRenew,()=>{mutationAttempted=true;}));
  else{
  const stripe=await getStripe();remote=await stripe.subscriptions.retrieve(agreement.providerSubscriptionId);assertAgreementIdentity(agreement,remote);
  if(autoRenew)assertResumable(agreement,remote);
  const key='sa-renewal-'+operation.id;
  if(!autoRenew&&remote.status==='incomplete'){
   mutationAttempted=true;const cancelled=await stripe.subscriptions.cancel(remote.id,{}, {idempotencyKey:key});
   if(cancelled.id!==remote.id||cancelled.status!=='canceled')throw businessError('Provider did not confirm cancellation of the unpaid agreement. Retry the same action.',502);
  }else if(!['canceled','incomplete_expired'].includes(remote.status)&&remote.cancel_at_period_end!==!autoRenew){
   mutationAttempted=true;const updated=await stripe.subscriptions.update(remote.id,{cancel_at_period_end:!autoRenew},{idempotencyKey:key});
   if(updated.id!==remote.id||updated.cancel_at_period_end!==!autoRenew)throw businessError('Provider did not confirm the renewal change. Retry the same action.',502);
  }
  remote=await stripe.subscriptions.retrieve(remote.id);assertAgreementIdentity(agreement,remote);
  if(autoRenew)assertResumable(agreement,remote);
  state=agreementState(remote);
  }
  if(state.autoRenew!==autoRenew)throw businessError('The payment provider has not confirmed the requested renewal setting. Retry the same action.',502);
  return await transaction(async session=>{
   const updated=await BillingAgreement.findOneAndUpdate({...owned,'renewalOperation.id':operation.id},{$set:{...state,...(autoRenew?{renewalConsentedAt:new Date()}:{} )},$unset:{renewalOperation:1,...(state.status==='cancelled'?{activeKey:1}:{})},$inc:{__v:1}},{new:true,runValidators:true,session});
   if(!updated){const current=await BillingAgreement.findOne(owned).session(session);if(!current)throw businessError('Billing agreement not found.',404);return publicAgreement(current);}
   await audit({user:{_id:userId}},{scope:'business',action:autoRenew?'subscription.auto_renew_enabled':'subscription.auto_renew_disabled',targetUser:userId,entityType:'billing_agreement',entityId:String(updated._id),changes:{provider:agreement.provider,providerSubscriptionId:remote.id,autoRenew:state.autoRenew,cancelAtPeriodEnd:state.cancelAtPeriodEnd,status:state.status,...(autoRenew?{amountMinor:updated.amountMinor,currency:updated.currency,intervalMonths:updated.intervalMonths,termsAccepted:true}:{})}},session);
   return publicAgreement(updated);
  });
 }catch(error){
  // Before a provider mutation, a failed validation/read can safely release the
  // operation. Afterwards its key must survive an ambiguous response.
  if(!mutationAttempted)await BillingAgreement.updateOne({...owned,'renewalOperation.id':operation.id},{$unset:{renewalOperation:1},$inc:{__v:1}});
  throw error;
 }
}
export async function cancelOwnedAgreement(userId,id){return changeOwnedRenewal(userId,id,false);}
export async function resumeOwnedAgreement(userId,id,body){return changeOwnedRenewal(userId,id,true,body);}
/** Irreversibly close only an already-disabled PayPal agreement. This is a
 * separate explicit owner action from reversible suspend/activate controls. */
export async function endDisabledAgreement(userId,id){
 const owned={_id:objectId(String(id)),user:userId};let agreement=await BillingAgreement.findOne(owned);if(!agreement)throw businessError('Billing agreement not found.',404);
 if(agreement.provider!=='paypal')throw businessError('This action is available only for a disabled PayPal agreement.',409);
 if(ended(agreement))return publicAgreement(agreement);
 if(agreement.status!=='paused'||agreement.autoRenew!==false||!agreement.providerSubscriptionId)throw businessError('Disable this PayPal agreement and wait for provider confirmation before ending it.',409);
 let operation=agreement.renewalOperation;
 if(operation&&operation.action!=='end')throw businessError('Another renewal change is awaiting confirmation. Retry that action first.',409);
 if(!operation){operation={id:crypto.randomUUID(),autoRenew:false,action:'end',startedAt:new Date()};agreement=await BillingAgreement.findOneAndUpdate({...owned,status:'paused',autoRenew:false,renewalOperation:{$exists:false}},{$set:{renewalOperation:operation},$inc:{__v:1}},{new:true,runValidators:true});if(!agreement)throw businessError('Another billing action is in progress. Refresh and retry.',409);}
 let mutationAttempted=false;
 try{
  const order=await CheckoutOrder.findOne({_id:agreement.checkoutOrder,user:userId,provider:'paypal',providerOrderId:agreement.providerSubscriptionId});if(!order)throw businessError('PayPal agreement checkout is missing.',409);
  let remote=await readPayPalSubscription(order);
  if(!await payPalLastPaymentRecorded(order,remote))await reconcilePayPalSubscription(remote.id);
  await assertPayPalCollectionsReconciled(order,remote);
  if(!['CANCELLED','EXPIRED'].includes(remote.status)){
   if(remote.status!=='SUSPENDED')throw businessError('PayPal has not confirmed that renewal is disabled. Refresh and disable it before ending the agreement.',409);
   mutationAttempted=true;try{await paypalApi('/v1/billing/subscriptions/'+encodeURIComponent(remote.id)+'/cancel',{method:'POST',body:{reason:'Owner explicitly ended this disabled Academy agreement before a new consented purchase.'}});}catch(error){const current=await readPayPalSubscription(order);if(!['CANCELLED','EXPIRED'].includes(current.status))throw error;remote=current;}
  }
  remote=await readPayPalSubscription(order);if(!['CANCELLED','EXPIRED'].includes(remote.status))throw businessError('PayPal has not confirmed the agreement has ended. Retry the same action.',502);
  await assertPayPalCollectionsReconciled(order,remote);
  return await transaction(async session=>{
   const updated=await BillingAgreement.findOneAndUpdate({...owned,'renewalOperation.id':operation.id},{$set:{status:'cancelled',autoRenew:false,cancelAtPeriodEnd:false,cancelledAt:new Date()},$unset:{activeKey:1,renewalOperation:1},$inc:{__v:1}},{new:true,runValidators:true,session});
   if(!updated){const current=await BillingAgreement.findOne(owned).session(session);if(!current||!ended(current))throw businessError('Agreement closure changed while being saved. Retry.',409);return publicAgreement(current);}
   await audit({user:{_id:userId}},{scope:'business',action:'subscription.disabled_agreement_ended',targetUser:userId,entityType:'billing_agreement',entityId:String(updated._id),changes:{provider:'paypal',providerSubscriptionId:remote.id,status:'cancelled',paidAccessRetained:true}},session);return publicAgreement(updated);
  });
 }catch(error){if(!mutationAttempted)await BillingAgreement.updateOne({...owned,'renewalOperation.id':operation.id},{$unset:{renewalOperation:1},$inc:{__v:1}});throw error;}
}

export {cancelAgreementAccessNow,cancelPurchaseAccessNow,cancelAllBillingForDeletion} from './subscriptionCancellation.js';
