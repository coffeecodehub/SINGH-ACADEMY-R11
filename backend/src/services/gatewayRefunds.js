import {reconcileStripeInvoice,reconcilePayPalSubscription} from './recurringBilling.js';
import User from '../models/User.js';
import crypto from 'node:crypto';
import CheckoutOrder from '../models/CheckoutOrder.js';import {syncCheckout} from './onlineCheckout.js';
import Payment from '../models/Payment.js';import Refund from '../models/Refund.js';import Invoice from '../models/Invoice.js';import Enrollment from '../models/Enrollment.js';import Subscription from '../models/Subscription.js';import Notification from '../models/Notification.js';
import {transaction} from './businessWrite.js';import {audit} from './audit.js';import {businessError,toMinor} from '../utils/business.js';import {getStripe,paypalApi} from './paymentProviders.js';import {paymentEnvironment} from '../utils/commerce.js';
function paypalReference(value,label){if(typeof value!=='string'||!/^[-_A-Za-z0-9]{1,150}$/.test(value))throw businessError('Invalid PayPal '+label+' reference.',400);return value;}
function paypalMoney(amount){
 const currency=amount?.currency||amount?.currency_code;
 if(typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency)||amount.currency&&amount.currency_code&&amount.currency!==amount.currency_code)throw businessError('PayPal monetary evidence is invalid.',409);
 // Sale/Refund are Payments v1 Amount objects (total/currency). The
 // Subscriptions transactions endpoint instead uses gross_amount.value.
 return {amountMinor:toMinor(amount.total),currency};
}
function paypalEvidenceDate(value){const result=new Date(value);if(!value||!Number.isFinite(+result)||result.getUTCFullYear()<2020||result>new Date(Date.now()+300000))throw businessError('PayPal refund timestamp needs reconciliation.',409);return result;}
function linkedPayPalSale(refund){
 const declared=refund.sale_id?paypalReference(refund.sale_id,'sale'):null,up=(refund.links||[]).find(link=>link.rel==='up');let linked;
 if(up){
  try{const url=new URL(up.href),hosts=paymentEnvironment('paypal')==='live'?['api.paypal.com','api-m.paypal.com']:['api.sandbox.paypal.com','api-m.sandbox.paypal.com'];
   if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!hosts.includes(url.hostname))throw Error('Untrusted PayPal link');
   linked=url.pathname.match(/^\/v1\/payments\/sale\/([-_A-Za-z0-9]{1,150})$/)?.[1];if(!linked)throw Error('Unexpected PayPal resource');
  }catch{throw businessError('PayPal refund sale link needs reconciliation.',409);}
 }
 if(declared&&linked&&declared!==linked)throw businessError('PayPal refund sale references disagree.',409);
 if(!declared&&!linked)throw businessError('PayPal refund sale reference is missing.',409);
 return declared||linked;
}
async function paypalSaleOwner(sale){
 const saleId=paypalReference(sale?.id,'sale'),subscriptionId=paypalReference(sale.billing_agreement_id,'subscription'),environment=paymentEnvironment('paypal');
 const subscription=await paypalApi('/v1/billing/subscriptions/'+encodeURIComponent(subscriptionId)+'?fields=plan');
 if(subscription.id!==subscriptionId||typeof subscription.custom_id!=='string'||!/^[a-f0-9]{24}$/i.test(subscription.custom_id))throw businessError('PayPal sale subscription identity needs reconciliation.',409);
 const order=await CheckoutOrder.findOne({_id:subscription.custom_id,provider:'paypal',environment,autoRenew:true,providerOrderId:subscriptionId});
 if(!order||subscription.custom_id!==String(order._id)||!order.providerPlanId||subscription.plan_id!==order.providerPlanId)throw businessError('PayPal sale does not belong to the saved subscription checkout.',409);
 const gross=paypalMoney(sale.amount),payment=await Payment.findOne({providerRecordKey:['paypal',environment,saleId].join(':')});
 if(process.env.PAYPAL_MERCHANT_ID&&sale.payee?.merchant_id&&sale.payee.merchant_id!==process.env.PAYPAL_MERCHANT_ID)throw businessError('PayPal sale merchant does not match.',409);
 if(payment&&(String(payment.user)!==String(order.user)||String(payment.checkoutOrder)!==String(order._id)||payment.provider!=='paypal'||payment.status!=='paid'||!payment.verifiedAt||!['provider_api','provider_webhook'].includes(payment.verificationSource)||payment.testMode!==(environment==='test')||payment.amountMinor!==gross.amountMinor||payment.currency!==gross.currency))throw businessError('PayPal sale differs from the original owned collection record.',409);
 return {environment,payment,gross,localOrderId:String(order._id),remoteOrderId:subscriptionId,providerSubscriptionId:subscriptionId};
}
/** Subscription payments use sale-era refund resources, never Orders v2
 * captures. Only fixed authenticated API paths are fetched; webhook/up URLs
 * supply references and are never followed as network destinations. */
export async function paypalSaleRefundEvidence(refundId){
 paypalReference(refundId,'refund');const refund=await paypalApi('/v1/payments/refund/'+encodeURIComponent(refundId));
 if(refund.id!==refundId)throw businessError('PayPal refund identity differs from the event.',409);
 if(refund.state!=='completed')throw businessError('PayPal has not confirmed the subscription refund. Retry reconciliation.',503);
 const saleId=linkedPayPalSale(refund),sale=await paypalApi('/v1/payments/sale/'+encodeURIComponent(saleId));
 if(sale.id!==saleId)throw businessError('PayPal sale identity differs from the refund.',409);
 const owner=await paypalSaleOwner(sale),money=paypalMoney(refund.amount),refundedAt=paypalEvidenceDate(refund.create_time);
 if(money.currency!==owner.gross.currency||money.amountMinor>owner.gross.amountMinor||refundedAt<paypalEvidenceDate(sale.create_time))throw businessError('PayPal refund differs from the original sale.',409);
 return {provider:'paypal',environment:owner.environment,id:refundId,paymentId:saleId,localOrderId:owner.localOrderId,remoteOrderId:owner.remoteOrderId,providerSubscriptionId:owner.providerSubscriptionId,...money,refundedAt};
}
/** A canonical full reversal credits only the amount not already returned.
 * The transaction re-computes that remainder after locking the owner/payment,
 * so a concurrently arriving partial refund cannot create a second credit. */
export async function paypalSaleReversalEvidence(saleId){
 paypalReference(saleId,'sale');const sale=await paypalApi('/v1/payments/sale/'+encodeURIComponent(saleId));
 if(sale.id!==saleId)throw businessError('PayPal sale reversal identity differs from the event.',409);
 if(sale.state!=='reversed')throw businessError('PayPal has not confirmed the subscription sale reversal. Retry reconciliation.',503);
 const owner=await paypalSaleOwner(sale),refundedAt=paypalEvidenceDate(sale.update_time),paidAt=paypalEvidenceDate(sale.create_time);
 if(refundedAt<paidAt)throw businessError('PayPal reversal predates its sale.',409);
 const amountMinor=owner.gross.amountMinor-(owner.payment?.refundedMinor||0);
 if(!Number.isSafeInteger(amountMinor)||amountMinor<0)throw businessError('PayPal reversal totals need reconciliation.',409);
 if(!amountMinor)return null;
 return {provider:'paypal',environment:owner.environment,id:'sale-reversal-'+saleId,paymentId:saleId,localOrderId:owner.localOrderId,remoteOrderId:owner.remoteOrderId,providerSubscriptionId:owner.providerSubscriptionId,amountMinor,currency:owner.gross.currency,refundedAt,fullSaleReversal:true,grossAmountMinor:owner.gross.amountMinor};
}
export async function refundEvidence(provider,refundId){
 if(typeof refundId!=='string'||!/^[-_A-Za-z0-9]{1,150}$/.test(refundId))throw businessError('Invalid provider refund reference.',400);
 if(provider==='stripe'){
  const refund=await (await getStripe()).refunds.retrieve(refundId);
  if(refund.status!=='succeeded')return null;
  const intent=await (await getStripe()).paymentIntents.retrieve(typeof refund.payment_intent==='string'?refund.payment_intent:refund.payment_intent?.id);
  const stripe=await getStripe();let providerInvoiceId;
  if(stripe.invoicePayments?.list){const rows=await stripe.invoicePayments.list({payment:{type:'payment_intent',payment_intent:intent.id},limit:2});if(!rows.has_more&&rows.data?.length===1){const ref=rows.data[0].invoice;providerInvoiceId=typeof ref==='string'?ref:ref?.id;}}
  return {localOrderId:intent.metadata?.sa_order_id,providerInvoiceId,provider,environment:paymentEnvironment(provider),id:refund.id,paymentId:typeof refund.payment_intent==='string'?refund.payment_intent:refund.payment_intent?.id,amountMinor:refund.amount,currency:refund.currency.toUpperCase(),refundedAt:new Date(refund.created*1000)};
 }
 const refund=await paypalApi('/v2/payments/refunds/'+encodeURIComponent(refundId));if(refund.status!=='COMPLETED')return null;
 let captureId=refund.supplementary_data?.related_ids?.capture_id;
 if(!captureId){const up=(refund.links||[]).find(l=>l.rel==='up');try{const url=new URL(up?.href);if(['api-m.paypal.com','api-m.sandbox.paypal.com'].includes(url.hostname)&&url.protocol==='https:')captureId=url.pathname.match(/^\/v2\/payments\/captures\/([A-Za-z0-9]+)$/)?.[1];}catch{}}
 if(!captureId)throw businessError('PayPal refund capture reference needs review.',409);
 // Only the fixed PayPal API is queried, never an arbitrary event-supplied URL.
 const capture=await paypalApi('/v2/payments/captures/'+encodeURIComponent(captureId));
 return {localOrderId:capture.custom_id,remoteOrderId:capture.supplementary_data?.related_ids?.order_id,provider:'paypal',environment:paymentEnvironment('paypal'),id:refund.id,paymentId:captureId,amountMinor:toMinor(refund.amount?.value),currency:refund.amount?.currency_code,refundedAt:new Date(refund.create_time)};
}
export async function recordGatewayRefund(evidence){
 if(!evidence)return {ignored:true};const testMode=evidence.environment==='test',key=[evidence.provider,evidence.environment,'refund',evidence.id].join(':');
 if(!await Payment.exists({providerRecordKey:[evidence.provider,evidence.environment,evidence.paymentId].join(':')})){
  if(evidence.provider==='stripe'&&typeof evidence.providerInvoiceId==='string')await reconcileStripeInvoice(evidence.providerInvoiceId);
  if(evidence.provider==='paypal'&&typeof evidence.providerSubscriptionId==='string'){
   const owned=await CheckoutOrder.findOne({provider:'paypal',environment:evidence.environment,autoRenew:true,providerOrderId:evidence.providerSubscriptionId});if(!owned)return {ignored:true};
   try{await reconcilePayPalSubscription(evidence.providerSubscriptionId,{saleId:evidence.paymentId,refundAlreadyVerified:true});}
   catch(error){if(error.status===409)throw businessError('The original subscription payment needs financial reconciliation before its refund. No access or credit was invented.',503);throw error;}
  }
  if(await Payment.exists({providerRecordKey:[evidence.provider,evidence.environment,evidence.paymentId].join(':')}))return recordGatewayRefund({...evidence,providerInvoiceId:undefined});
  const references=[];if(/^[a-f0-9]{24}$/.test(evidence.localOrderId||''))references.push({_id:evidence.localOrderId});if(typeof evidence.remoteOrderId==='string'&&evidence.remoteOrderId)references.push({providerOrderId:evidence.remoteOrderId});
  if(!references.length)return {ignored:true};
  const order=await CheckoutOrder.findOne({provider:evidence.provider,environment:evidence.environment,$or:references});if(!order)return {ignored:true};
  await syncCheckout(order._id,{verificationSource:'provider_webhook'});
 }
 return transaction(async session=>{
  const already=await Refund.findOne({referenceKey:key}).session(session);if(already)return {replayed:true};
  const payment=await Payment.findOne({providerRecordKey:[evidence.provider,evidence.environment,evidence.paymentId].join(':')}).session(session);
  if(!payment){throw businessError('The payment must be reconciled before its refund. The provider will retry this event.',503);}
  if(!Number.isSafeInteger(evidence.amountMinor)||evidence.amountMinor<=0||evidence.currency!==payment.currency||payment.testMode!==testMode||new Date(evidence.refundedAt)<new Date(payment.paidAt)||!Number.isFinite(new Date(evidence.refundedAt).getTime()))throw businessError('Refund evidence did not match the original payment.',409);
  if(evidence.fullSaleReversal&&(evidence.provider!=='paypal'||evidence.grossAmountMinor!==payment.amountMinor))throw businessError('Sale reversal differs from the original collected amount.',409);
  if(evidence.provider==='paypal'&&!evidence.fullSaleReversal&&payment.refundedMinor===payment.amountMinor&&await Refund.exists({payment:payment._id,reference:'sale-reversal-'+evidence.paymentId}).session(session))return {replayed:true,coveredBySaleReversal:true};
  // Serialize access changes with purchases/completions for this actual owner.
  const locked=await User.findOneAndUpdate({_id:payment.user,role:'student'},{$inc:{commerceVersion:1}},{new:true,session});
  if(!locked)throw businessError('Refund customer needs reconciliation.',409);
  const amountMinor=evidence.fullSaleReversal?payment.amountMinor-(payment.refundedMinor||0):evidence.amountMinor;
  if(amountMinor===0&&evidence.fullSaleReversal)return {replayed:true};
  const refunded=(payment.refundedMinor||0)+amountMinor;if(refunded>payment.amountMinor)throw businessError('Refunds exceed the original collected amount.',409);
  const invoice=await Invoice.findById(payment.invoice).session(session);if(!invoice)throw businessError('Refund invoice needs review.',409);
  payment.refundedMinor=refunded;await payment.save({session});invoice.creditedMinor=(invoice.creditedMinor||0)+amountMinor;if(invoice.creditedMinor>=invoice.totalMinor)invoice.accessRevokedAt=new Date();await invoice.save({session});
  const full=refunded===payment.amountMinor;
  await Refund.create([{payment:payment._id,invoice:invoice._id,user:payment.user,amountMinor,currency:evidence.currency,refundedAt:evidence.refundedAt,reference:evidence.id,referenceKey:key,reason:'Successful refund verified directly with '+evidence.provider,source:'provider_webhook',provider:evidence.provider,providerRefundId:evidence.id,testMode,revokeAccess:full,requestKey:key,requestFingerprint:crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}],{session});
  if(full){await Enrollment.updateMany({invoice:invoice._id,status:'active'},{$set:{status:'cancelled',reason:'Full verified provider refund'}},{session});await Subscription.updateMany({invoice:invoice._id,status:'active'},{$set:{status:'cancelled',cancelledAt:new Date(),cancellationReason:'Full verified provider refund'}},{session});}
  await Notification.create([{dedupeKey:key,type:'provider_refund',title:testMode?'Sandbox refund recorded':'Online refund recorded',message:`${evidence.provider} returned ${evidence.currency} ${(amountMinor/100).toFixed(2)}. ${full?'Access linked to this invoice was revoked.':'Partial refund; access retained.'}`,user:payment.user,link:'/admin?section=refunds'}],{session});
  await audit(null,{scope:'business',action:'refund.provider_verified',entityType:'payment',entityId:String(payment._id),targetUser:payment.user,changes:{amountMinor,currency:evidence.currency,provider:evidence.provider,reference:evidence.id,testMode,full}},session);return {recorded:true};
 });
}
