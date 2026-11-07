/** PayPal Subscriptions v1, separate from Orders v2. API fields/limits follow
 * paypal/paypal-rest-api-specifications/openapi/billing_subscriptions_v1.json.
 * A subscription approval is a mandate, never evidence of collected money. */
import crypto from 'node:crypto';
import CheckoutOrder from '../models/CheckoutOrder.js';
import {paypalApi,paypalRequestId} from './paymentProviders.js';
import {businessError,toMinor,stableJson} from '../utils/business.js';
import {paymentEnvironment,frontendOrigin,moneyString,approvedRedirect} from '../utils/commerce.js';
const second=1000,day=86400000;
const fail=message=>{throw businessError(message,409);};
const date=value=>{const d=new Date(value);return value!=null&&Number.isFinite(+d)?d:null;};
const ref=value=>typeof value==='string'?value:value?.id;
const cents=value=>toMinor(value?.value,{allowZero:true});
const iso=value=>new Date(value).toISOString();
export function paypalCalendarMonths(value,months){const d=new Date(value),n=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(n,last));return d;}
function cycles(order){
 const frequency={interval_unit:'MONTH',interval_count:order.durationMonths},fixed=amount=>({fixed_price:{currency_code:order.currency,value:moneyString(amount)}}),discount=order.discountMinor>0;
 return [...(discount?[{frequency,tenure_type:'TRIAL',sequence:1,total_cycles:1,pricing_scheme:fixed(order.amountMinor)}]:[]),{frequency,tenure_type:'REGULAR',sequence:discount?2:1,total_cycles:0,pricing_scheme:fixed(order.renewalAmountMinor)}];
}
export function paypalSubscriptionBody(order){
 if(!order.autoRenew||!['course','section'].includes(order.kind)||!Number.isInteger(order.durationMonths)||order.durationMonths<1||order.durationMonths>12||order.amountMinor<=0||order.renewalSetup&&order.discountMinor>0)fail('PayPal automatic renewal supports 1–12 month course/section terms and positive first payments.');
 const root=frontendOrigin();
 return {type:'paypal_subscription',product:{name:('Singh Academy '+order.title).slice(0,127),description:('Academy '+order.kind+' '+order.product+'; checkout '+order._id).slice(0,256),type:'SERVICE',home_url:root},plan:{name:order.title.slice(0,127),description:('Checkout '+order._id+'; '+order.currency+' '+moneyString(order.renewalAmountMinor)+' every '+order.durationMonths+' month(s)').slice(0,127),status:'ACTIVE',billing_cycles:cycles(order),payment_preferences:{auto_bill_outstanding:false,setup_fee:{currency_code:order.currency,value:'0.00'},setup_fee_failure_action:'CANCEL',payment_failure_threshold:1},quantity_supported:false},subscription:{custom_id:String(order._id),quantity:'1',...(order.renewalSetup?{start_time:iso(order.billingStartsAt)}:{}),application_context:{brand_name:'Singh Academy',shipping_preference:'NO_SHIPPING',user_action:'SUBSCRIBE_NOW',return_url:root+'/checkout/return?order='+order._id,cancel_url:root+'/checkout/return?order='+order._id+'&cancelled=1'}}};
}
function canonicalCycles(rows){
 if(!Array.isArray(rows))fail('PayPal billing cycles are missing.');
 return rows.map(row=>({sequence:row.sequence,tenure_type:row.tenure_type,total_cycles:row.total_cycles,frequency:{interval_unit:row.frequency?.interval_unit,interval_count:row.frequency?.interval_count??1},pricing_scheme:{fixed_price:{currency_code:row.pricing_scheme?.fixed_price?.currency_code,value:moneyString(cents(row.pricing_scheme?.fixed_price))}}})).sort((a,b)=>a.sequence-b.sequence);
}
function validatePlan(order,plan,{id=true}={}){
 if(!plan||id&&(plan.id!==order.providerPlanId||plan.status!=='ACTIVE')||plan.product_id!==order.providerProductId||plan.quantity_supported===true||plan.taxes&&Number(plan.taxes.percentage||0)!==0)fail('PayPal plan ownership or status does not match the saved checkout.');
 if(stableJson(canonicalCycles(plan.billing_cycles))!==stableJson(canonicalCycles(cycles(order))))fail('PayPal billing amount, currency or interval changed. Reconcile the agreement.');
 const p=plan.payment_preferences;if(!p||p.auto_bill_outstanding!==false||p.setup_fee?.currency_code!==order.currency||cents(p.setup_fee)!==0||p.payment_failure_threshold!==1||p.setup_fee_failure_action!=='CANCEL')fail('PayPal collection preferences differ from the accepted agreement.');
}
export function validatePayPalSubscription(order,remote,plan){
 if(order.provider!=='paypal'||order.environment!==paymentEnvironment('paypal')||!order.autoRenew||!order.providerProductId||!order.providerPlanId||remote?.id!==order.providerOrderId||remote.custom_id!==String(order._id)||remote.plan_id!==order.providerPlanId||remote.plan_overridden===true||remote.quantity!==undefined&&remote.quantity!=='1')fail('PayPal subscription identity or ownership does not match the saved checkout.');
 validatePlan(order,plan);validatePlan(order,remote.plan,{id:false});
 if(!date(remote.start_time)||order.renewalSetup&&+date(remote.start_time)!==+date(order.billingStartsAt))fail('PayPal first charge date differs from the accepted agreement.');
 return remote;
}
export async function readPayPalSubscription(order){
 if(order.environment!==paymentEnvironment('paypal'))fail('PayPal account environment changed.');
 const remote=await paypalApi('/v1/billing/subscriptions/'+encodeURIComponent(order.providerOrderId)+'?fields=plan'),plan=await paypalApi('/v1/billing/plans/'+encodeURIComponent(order.providerPlanId));
 return validatePayPalSubscription(order,remote,plan);
}
async function persistReference(order,field,id){
 if(typeof id!=='string'||!/^[-A-Za-z0-9]{3,100}$/.test(id))fail('PayPal did not return a valid provisioned reference.');
 const updated=await CheckoutOrder.findOneAndUpdate({_id:order._id,creationClaim:order.creationClaim,[field]:{$exists:false}},{$set:{[field]:id}},{new:true});
 if(!updated){const existing=await CheckoutOrder.findById(order._id);if(existing?.[field]!==id)fail('PayPal provisioning changed while being saved.');}
 order[field]=id;
}
export async function createPayPalSubscription(order){
 if(order.environment!==paymentEnvironment('paypal'))fail('PayPal account environment changed.');
 const payload=order.creationPayload||paypalSubscriptionBody(order);
 if(payload.type!=='paypal_subscription')fail('The saved PayPal creation request has a different type.');
 if(!order.providerProductId){const product=await paypalApi('/v1/catalogs/products',{method:'POST',requestId:paypalRequestId('sub-product',order._id),body:payload.product});await persistReference(order,'providerProductId',product.id);}
 if(!order.providerPlanId){const plan=await paypalApi('/v1/billing/plans',{method:'POST',requestId:paypalRequestId('sub-plan',order._id),body:{...payload.plan,product_id:order.providerProductId}});await persistReference(order,'providerPlanId',plan.id);}
 validatePlan(order,await paypalApi('/v1/billing/plans/'+encodeURIComponent(order.providerPlanId)));
 const data=await paypalApi('/v1/billing/subscriptions',{method:'POST',requestId:paypalRequestId('sub-create',order._id),body:{...payload.subscription,plan_id:order.providerPlanId}}),url=(data.links||[]).find(link=>link.rel==='approve')?.href;
 return {id:data.id,url:url?approvedRedirect(url,'paypal',order.environment):null,state:['CANCELLED','EXPIRED'].includes(data.status)?'cancelled':'pending'};
}
function balance(remote,currency){const value=remote.billing_info?.outstanding_balance;if(!value||value.currency_code!==currency)fail('PayPal billing balance is unavailable.');return cents(value);}
function completedCycles(order,remote){
 const rows=remote.billing_info?.cycle_executions,expected=cycles(order);if(!Array.isArray(rows)||rows.length!==expected.length)fail('PayPal cycle execution evidence is incomplete.');let count=0;
 for(const expectedCycle of expected){const row=rows.find(r=>r.sequence===expectedCycle.sequence&&r.tenure_type===expectedCycle.tenure_type);if(!row||!Number.isInteger(row.cycles_completed)||row.cycles_completed<0||row.total_cycles!==expectedCycle.total_cycles||expectedCycle.tenure_type==='TRIAL'&&row.cycles_completed>1)fail('PayPal cycle execution evidence is ambiguous.');count+=row.cycles_completed;}
 return count;
}
export function paypalPaidPeriod(order,remote,transaction){
 const info=remote.billing_info,last=info?.last_payment,gross=transaction.amount_with_breakdown?.gross_amount,paid=date(transaction.time),lastAt=date(last?.time),anchor=date(remote.start_time),end=date(info?.next_billing_time),n=completedCycles(order,remote);
 if(transaction.status!=='COMPLETED'||typeof transaction.id!=='string'||!paid||!lastAt||Math.abs(+paid-+lastAt)>second||gross?.currency_code!==order.currency||last?.amount?.currency_code!==order.currency||cents(gross)!==cents(last.amount)||balance(remote,order.currency)!==0||info.failed_payments_count!==0||!anchor||!end||n<1)fail('PayPal completed payment is not the unambiguous latest settled billing cycle.');
 const start=paypalCalendarMonths(anchor,(n-1)*order.durationMonths),expectedEnd=paypalCalendarMonths(anchor,n*order.durationMonths),first=n===1,amountMinor=first?order.amountMinor:order.renewalAmountMinor;
 if(+end!==+expectedEnd||paid<new Date(+start-300000)||paid>=end||cents(gross)!==amountMinor||order.renewalSetup&&start<new Date(order.billingStartsAt))fail('PayPal payment period or amount differs from the saved plan schedule.');
 return {start,end,first,amountMinor};
}
export function paypalNextBilling(remote){return date(remote.billing_info?.next_billing_time)||(date(remote.start_time)>new Date()?date(remote.start_time):null);}
/** Subscriptions v1 documents these transaction states. Unknown/new states
 * cannot establish the absence of a collection when closing billing. */
export function paypalCollectionState(status){return ['DECLINED','FAILED'].includes(status)?'clear':['COMPLETED','PARTIALLY_REFUNDED','REFUNDED'].includes(status)?'collected':'uncertain';}
export function assertPayPalResume(agreement,remote){
 const expected=date(agreement.providerNextBillingAt||agreement.currentPeriodEnd||agreement.billingStartsAt),next=paypalNextBilling(remote),info=remote.billing_info;
 if(!['SUSPENDED','ACTIVE'].includes(remote.status)||!expected||!next||+expected!==+next||next<=new Date()||balance(remote,agreement.currency)!==0||info.failed_payments_count!==0)fail('PayPal cannot safely resume this schedule. A changed, overdue or outstanding agreement requires a new consented checkout.');
 if(agreement.renewalSetup&&date(agreement.billingStartsAt)>new Date()&&+date(remote.start_time)!==+date(agreement.billingStartsAt))fail('PayPal first charge date changed.');
 return next;
}
export async function paypalSubscriptionEvidence(order,{saleId}={}){
 const remote=await readPayPalSubscription(order),info=remote.billing_info;
 const terminal=['CANCELLED','EXPIRED'].includes(remote.status);
 if(terminal&&!info?.last_payment)return {state:'cancelled',remote};
 if(!terminal&&!['ACTIVE','SUSPENDED'].includes(remote.status))return {state:'pending',remote};
 const count=completedCycles(order,remote),start=date(remote.start_time),next=paypalNextBilling(remote);
 if(order.renewalSetup&&count===0&&!info?.last_payment&&balance(remote,order.currency)===0&&info.failed_payments_count===0&&remote.status==='ACTIVE'&&typeof remote.subscriber?.payer_id==='string'&&start>new Date()&&next&&+next===+start)return {state:'renewal_ready',provider:'paypal',environment:order.environment,providerOrderId:remote.id,orderId:String(order._id),futureAmountMinor:order.amountMinor,currency:order.currency,providerSubscriptionId:remote.id,providerCustomerId:remote.subscriber?.payer_id,providerInvoiceId:null,billingStartsAt:start,periodStartsAt:new Date(),providerStatus:'active',cancelAtPeriodEnd:false,remote};
 const lastAt=date(info?.last_payment?.time);if(!lastAt)return {state:'pending',remote};
 const query=new URLSearchParams({start_time:iso(+lastAt-day),end_time:iso(Math.min(+lastAt+day,Date.now()+1000))}),result=await paypalApi('/v1/billing/subscriptions/'+encodeURIComponent(remote.id)+'/transactions?'+query);
 if(!Array.isArray(result.transactions)||result.total_pages>1||result.total_items!==undefined&&result.total_items!==result.transactions.length||(result.links||[]).some(link=>link.rel==='next'))fail('PayPal transaction history is incomplete; settlement needs reconciliation.');
 const candidates=result.transactions.filter(row=>Math.abs(+new Date(row.time)-+lastAt)<=second&&row.status==='COMPLETED'),transaction=saleId?result.transactions.find(row=>row.id===saleId):candidates.length===1?candidates[0]:null;
 if(candidates.length!==1||!transaction||transaction.id!==candidates[0].id)fail('PayPal completed transaction is missing or ambiguous.');const period=paypalPaidPeriod(order,remote,transaction);
 // Keep the billing key until the service has checked all terminal financial
 // evidence. A final status does not erase a collected-but-undelivered sale.
 return {state:'paid',provider:'paypal',environment:order.environment,providerOrderId:remote.id,orderId:String(order._id),amountMinor:period.amountMinor,currency:order.currency,paymentId:transaction.id,paidAt:new Date(transaction.time),providerSubscriptionId:remote.id,providerCustomerId:remote.subscriber?.payer_id,providerInvoiceId:transaction.id,billingReason:period.first?'subscription_create':'subscription_cycle',periodStartsAt:period.start,periodEndsAt:period.end,providerStatus:terminal||remote.status==='SUSPENDED'?'paused':'active',cancelAtPeriodEnd:false,providerNextBillingAt:period.end,remote};
}
async function assertNoPayPalCollections(order,remote){
 const begins=[date(order.createdAt),date(remote.create_time),date(remote.start_time)].filter(Boolean),start=new Date(Math.min(Date.now()-day,...begins.map(Number))),query=new URLSearchParams({start_time:iso(start),end_time:iso(Date.now()+1000)}),result=await paypalApi('/v1/billing/subscriptions/'+encodeURIComponent(remote.id)+'/transactions?'+query);
 if(!Array.isArray(result.transactions)||result.total_pages>1||result.total_items!==undefined&&result.total_items!==result.transactions.length||(result.links||[]).some(link=>link.rel==='next')||result.transactions.some(row=>paypalCollectionState(row.status)!=='clear'))fail('PayPal subscription collections are present or uncertain. Reconcile this original checkout before a replacement.');
}
export async function closePayPalSubscriptionCheckout(order){
 const evidence=await paypalSubscriptionEvidence(order);if(['paid','renewal_ready'].includes(evidence.state))return evidence;
 const remote=evidence.remote;
 // PayPal only guarantees cancellation for ACTIVE/SUSPENDED subscriptions. An
 // unapproved URL remains unresolved until provider truth proves it cannot bill.
 if(!['ACTIVE','SUSPENDED','CANCELLED','EXPIRED'].includes(remote.status))throw businessError('This PayPal subscription approval is still open. It cannot be replaced until PayPal confirms cancellation or expiry.',409);
 await assertNoPayPalCollections(order,remote);
 if(['CANCELLED','EXPIRED'].includes(remote.status))return {state:'cancelled'};
 await paypalApi('/v1/billing/subscriptions/'+encodeURIComponent(remote.id)+'/cancel',{method:'POST',body:{reason:'Owner closed the unpaid Academy checkout.'}});
 const after=await readPayPalSubscription(order);if(!['CANCELLED','EXPIRED'].includes(after.status))fail('PayPal has not confirmed subscription closure.');await assertNoPayPalCollections(order,after);
 return {state:'cancelled'};
}
