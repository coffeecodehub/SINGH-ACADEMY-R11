/** Actual PayPal subscription helpers with synthetic, injected provider reads.
 * No PayPal account, credential, network request or database is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {load} from './testLoader.js';
import {businessError,toMinor,stableJson} from '../src/utils/business.js';
import {paymentEnvironment,frontendOrigin,moneyString,approvedRedirect} from '../src/utils/commerce.js';

const env={PAYPAL_MODE:'sandbox',FRONTEND_URL:'https://singhacademy.com',NODE_ENV:'production',DEPLOYMENT_STAGE:'review'};
const start='2026-01-01T00:00:00.000Z',paidAt='2026-01-01T00:00:01.000Z',end='2026-02-01T00:00:00.000Z';
const reject=fn=>assert.throws(fn,error=>Number(error.status)>=400);
function fixture({discount=true,now='2026-01-01T00:01:00.000Z'}={}){
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return Date.parse(now);}}
 const calls=[];let api;
 const helpers=load('../src/services/paypalSubscriptions.js',{
  crypto,CheckoutOrder:{},paypalApi:async(path,options)=>{calls.push({path,options});return api(path,options);},paypalRequestId:()=>{throw Error('No mutation belongs in evidence tests');},
  businessError,toMinor,stableJson,paymentEnvironment:provider=>paymentEnvironment(provider,env),frontendOrigin:()=>frontendOrigin(env),moneyString,approvedRedirect,Date:Clock
 },'({paypalSubscriptionBody,validatePayPalSubscription,paypalPaidPeriod,assertPayPalResume,paypalSubscriptionEvidence,closePayPalSubscriptionCheckout})');
 const order={_id:'a'.repeat(24),user:'b'.repeat(24),provider:'paypal',environment:'test',autoRenew:true,kind:'course',product:'owned-course',title:'Synthetic course',currency:'USD',durationMonths:1,amountMinor:discount?500:1000,renewalAmountMinor:1000,discountMinor:discount?500:0,providerOrderId:'I-SYNTHETIC123',providerPlanId:'P-'+'A'.repeat(24),providerProductId:'PROD-'+'B'.repeat(17)};
 const body=helpers.paypalSubscriptionBody(order),plan={...structuredClone(body.plan),id:order.providerPlanId,product_id:order.providerProductId};
 const remote={id:order.providerOrderId,custom_id:order._id,plan_id:order.providerPlanId,quantity:'1',plan_overridden:false,start_time:start,status:'ACTIVE',plan:structuredClone(plan),billing_info:{outstanding_balance:{currency_code:'USD',value:'0.00'},failed_payments_count:0,cycle_executions:body.plan.billing_cycles.map((cycle,index)=>({sequence:cycle.sequence,tenure_type:cycle.tenure_type,total_cycles:cycle.total_cycles,cycles_completed:index===0?1:0})),last_payment:{amount:{currency_code:'USD',value:discount?'5.00':'10.00'},time:paidAt},next_billing_time:end}};
 const transaction={id:'SALE-SYNTHETIC-1',status:'COMPLETED',amount_with_breakdown:{gross_amount:{currency_code:'USD',value:discount?'5.00':'10.00'},net_amount:{currency_code:'USD',value:'4.50'}},time:paidAt};
 let history={transactions:[transaction],total_items:1,total_pages:1,links:[]};
 api=async path=>{
  if(path==='/v1/billing/subscriptions/'+order.providerOrderId+'?fields=plan')return remote;
  if(path==='/v1/billing/plans/'+order.providerPlanId)return plan;
  if(path.startsWith('/v1/billing/subscriptions/'+order.providerOrderId+'/transactions?'))return history;
  throw Error('Unexpected synthetic provider request '+path);
 };
 const agreement={provider:'paypal',providerSubscriptionId:order.providerOrderId,currency:'USD',providerNextBillingAt:end,currentPeriodEnd:end};
 return {helpers,order,body,plan,remote,transaction,agreement,calls,setHistory:value=>{history=value;}};
}

test('PayPal recurring request uses the configured HTTPS domain and a no-arrears plan',()=>{
 const f=fixture();assert.equal(f.body.subscription.application_context.return_url,'https://singhacademy.com/checkout/return?order='+f.order._id);
 assert.equal(f.body.subscription.application_context.shipping_preference,'NO_SHIPPING');
 assert.equal(f.body.plan.payment_preferences.auto_bill_outstanding,false);assert.equal(f.body.plan.payment_preferences.setup_fee.value,'0.00');
 assert.equal(f.body.plan.billing_cycles[0].pricing_scheme.fixed_price.value,'5.00');assert.equal(f.body.plan.billing_cycles[0].total_cycles,1);
 assert.equal(f.body.plan.billing_cycles[1].pricing_scheme.fixed_price.value,'10.00');assert.equal(f.body.plan.billing_cycles[1].total_cycles,0);
});
for(const months of [1,9,12])test('PayPal supports an exact '+months+' month configured term',()=>{
 const f=fixture(),body=f.helpers.paypalSubscriptionBody({...f.order,durationMonths:months});
 assert.equal(body.plan.billing_cycles.at(-1).frequency.interval_count,months);
});
for(const months of [0,13,36,1.5])test('PayPal refuses unsupported month count '+months,()=>{
 const f=fixture();reject(()=>f.helpers.paypalSubscriptionBody({...f.order,durationMonths:months}));
});
test('a saved PayPal order and both effective/base plan snapshots validate',()=>{
 const f=fixture();assert.equal(f.helpers.validatePayPalSubscription(f.order,f.remote,f.plan),f.remote);
});
for(const [label,mutate]of [
 ['another local order',f=>{f.remote.custom_id='c'.repeat(24);}],
 ['another subscription',f=>{f.remote.id='I-ANOTHER';}],
 ['another provider plan',f=>{f.remote.plan_id='P-'+'C'.repeat(24);}],
 ['another product',f=>{f.plan.product_id='PROD-'+'C'.repeat(17);}],
 ['wrong environment',f=>{f.order.environment='live';}],
 ['subscription override',f=>{f.remote.plan_overridden=true;}],
 ['multiple quantities',f=>{f.remote.quantity='2';}],
 ['base plan price change',f=>{f.plan.billing_cycles[1].pricing_scheme.fixed_price.value='11.00';}],
 ['effective plan price change',f=>{f.remote.plan.billing_cycles[1].pricing_scheme.fixed_price.value='11.00';}],
 ['effective currency change',f=>{f.remote.plan.billing_cycles[1].pricing_scheme.fixed_price.currency_code='EUR';}],
 ['effective interval change',f=>{f.remote.plan.billing_cycles[1].frequency.interval_count=2;}],
 ['extra billing cycle',f=>{f.remote.plan.billing_cycles.push(structuredClone(f.remote.plan.billing_cycles[1]));}],
 ['setup fee',f=>{f.remote.plan.payment_preferences.setup_fee.value='1.00';}],
 ['automatic arrears collection',f=>{f.remote.plan.payment_preferences.auto_bill_outstanding=true;}],
 ['tax surcharge',f=>{f.remote.plan.taxes={percentage:'10'};}],
 ['missing effective plan',f=>{delete f.remote.plan;}]
])test('subscription validation refuses '+label,()=>{
 const f=fixture();mutate(f);reject(()=>f.helpers.validatePayPalSubscription(f.order,f.remote,f.plan));
});
test('deferred setup accepts only its exact saved first-charge date',()=>{
 const f=fixture({discount:false});f.order.renewalSetup=true;f.order.billingStartsAt=start;
 assert.equal(f.helpers.validatePayPalSubscription(f.order,f.remote,f.plan),f.remote);
 f.remote.start_time='2026-01-02T00:00:00Z';reject(()=>f.helpers.validatePayPalSubscription(f.order,f.remote,f.plan));
});
test('verified first discounted collection buys one scheduled term using gross rather than net',()=>{
 const f=fixture(),period=f.helpers.paypalPaidPeriod(f.order,f.remote,f.transaction);
 assert.equal(period.start.toISOString(),start);assert.equal(period.end.toISOString(),end);assert.equal(period.first,true);assert.equal(period.amountMinor,500);
});
test('the following cycle charges the undiscounted saved renewal price once',()=>{
 const f=fixture();f.remote.start_time='2025-12-01T00:00:00Z';f.remote.billing_info.cycle_executions[1].cycles_completed=1;
 f.remote.billing_info.last_payment.amount.value='10.00';f.transaction.amount_with_breakdown.gross_amount.value='10.00';
 const period=f.helpers.paypalPaidPeriod(f.order,f.remote,f.transaction);assert.equal(period.first,false);assert.equal(period.amountMinor,1000);assert.equal(period.start.toISOString(),start);assert.equal(period.end.toISOString(),end);
});
for(const [label,delay]of [['30 minutes',30*60000],['one day',86400000]])test('a verified latest collection delayed '+label+' retains the original provider period',()=>{
 const collected=new Date(Date.parse(start)+delay).toISOString(),f=fixture({now:new Date(Date.parse(collected)+60000).toISOString()});
 f.transaction.time=collected;f.remote.billing_info.last_payment.time=collected;
 const period=f.helpers.paypalPaidPeriod(f.order,f.remote,f.transaction);
 assert.equal(period.start.toISOString(),start);assert.equal(period.end.toISOString(),end);assert.equal(period.amountMinor,500);
});
for(const status of ['PENDING','DECLINED','FAILED','REFUNDED','PARTIALLY_REFUNDED'])test('transaction '+status+' cannot authorize a new paid term',()=>{
 const f=fixture();f.transaction.status=status;reject(()=>f.helpers.paypalPaidPeriod(f.order,f.remote,f.transaction));
});
for(const [label,mutate]of [
 ['old sale attached to a newer cycle',f=>{f.transaction.time='2025-12-01T00:00:01Z';}],
 ['collection from before the current cycle',f=>{f.transaction.time='2025-12-31T00:00:00Z';f.remote.billing_info.last_payment.time=f.transaction.time;}],
 ['different provider next date',f=>{f.remote.billing_info.next_billing_time='2026-02-02T00:00:00Z';}],
 ['no completed cycle',f=>{f.remote.billing_info.cycle_executions[0].cycles_completed=0;}],
 ['missing cycle details',f=>{delete f.remote.billing_info.cycle_executions;}],
 ['repeated introductory cycle',f=>{f.remote.billing_info.cycle_executions[0].cycles_completed=2;}],
 ['outstanding money',f=>{f.remote.billing_info.outstanding_balance.value='1.00';}],
 ['failed payments',f=>{f.remote.billing_info.failed_payments_count=1;}],
 ['wrong gross amount',f=>{f.transaction.amount_with_breakdown.gross_amount.value='10.00';}],
 ['wrong currency',f=>{f.transaction.amount_with_breakdown.gross_amount.currency_code='EUR';}]
])test('paid-period attribution refuses '+label,()=>{
 const f=fixture();mutate(f);reject(()=>f.helpers.paypalPaidPeriod(f.order,f.remote,f.transaction));
});
test('an inconsistent outstanding-balance currency is not evidence of zero USD debt',()=>{
 const f=fixture();f.remote.billing_info.outstanding_balance.currency_code='EUR';
 reject(()=>f.helpers.paypalPaidPeriod(f.order,f.remote,f.transaction));reject(()=>f.helpers.assertPayPalResume(f.agreement,f.remote));
});
test('safe matching suspended and already-active schedules can be resumed idempotently',()=>{
 const f=fixture();for(const status of ['SUSPENDED','ACTIVE']){f.remote.status=status;assert.equal(f.helpers.assertPayPalResume(f.agreement,f.remote).toISOString(),end);}
});
for(const [label,mutate]of [
 ['cancelled agreement',f=>{f.remote.status='CANCELLED';}],
 ['unapproved mandate',f=>{f.remote.status='APPROVAL_PENDING';}],
 ['past next-charge date',f=>{f.agreement.providerNextBillingAt='2025-12-01T00:00:00Z';f.remote.billing_info.next_billing_time=f.agreement.providerNextBillingAt;}],
 ['earlier next-charge date',f=>{f.remote.billing_info.next_billing_time='2026-01-20T00:00:00Z';}],
 ['later next-charge date',f=>{f.remote.billing_info.next_billing_time='2026-03-01T00:00:00Z';}],
 ['missing next-charge date',f=>{delete f.remote.billing_info.next_billing_time;}],
 ['arrears',f=>{f.remote.billing_info.outstanding_balance.value='10.00';}],
 ['payment failure',f=>{f.remote.billing_info.failed_payments_count=1;}]
])test('resume validation refuses '+label,()=>{
 const f=fixture();mutate(f);reject(()=>f.helpers.assertPayPalResume(f.agreement,f.remote));
});
test('evidence uses only authenticated owned subscription, effective plan and transaction reads',async()=>{
 const f=fixture(),evidence=await f.helpers.paypalSubscriptionEvidence(f.order,{saleId:f.transaction.id});
 assert.equal(evidence.state,'paid');assert.equal(evidence.paymentId,f.transaction.id);assert.equal(evidence.orderId,f.order._id);assert.equal(evidence.amountMinor,500);
 assert.equal(f.calls.length,3);assert.ok(f.calls.every(call=>call.options===undefined));assert.match(f.calls[0].path,/\?fields=plan$/);
 assert.match(f.calls[2].path,new RegExp('^/v1/billing/subscriptions/'+f.order.providerOrderId+'/transactions\\?'));
});
test('ACTIVE without a collected transaction remains pending and grants nothing',async()=>{
 const f=fixture();delete f.remote.billing_info.last_payment;f.remote.billing_info.cycle_executions[0].cycles_completed=0;
 assert.equal((await f.helpers.paypalSubscriptionEvidence(f.order)).state,'pending');assert.equal(f.calls.length,2);
});
test('approved future setup confirms only its mandate without returning a paid transaction',async()=>{
 const f=fixture({discount:false});f.order.renewalSetup=true;f.order.billingStartsAt=end;f.remote.start_time=end;f.remote.subscriber={payer_id:'PAYER-SYNTHETIC'};
 delete f.remote.billing_info.last_payment;f.remote.billing_info.cycle_executions[0].cycles_completed=0;
 const evidence=await f.helpers.paypalSubscriptionEvidence(f.order);
 assert.equal(evidence.state,'renewal_ready');assert.equal(evidence.futureAmountMinor,1000);assert.equal(evidence.billingStartsAt.toISOString(),end);
 assert.equal(evidence.paymentId,undefined);assert.equal(evidence.paidAt,undefined);assert.equal(f.calls.length,2);assert.ok(f.calls.every(call=>call.options===undefined));
});
test('future approval without a confirmed payer remains pending',async()=>{
 const f=fixture({discount:false});f.order.renewalSetup=true;f.order.billingStartsAt=end;f.remote.start_time=end;
 delete f.remote.billing_info.last_payment;f.remote.billing_info.cycle_executions[0].cycles_completed=0;
 assert.equal((await f.helpers.paypalSubscriptionEvidence(f.order)).state,'pending');assert.equal(f.calls.length,2);
});
for(const patch of [{total_pages:2},{total_items:2},{links:[{rel:'next',href:'https://api-m.sandbox.paypal.com/next'}]}])test('incomplete transaction history cannot settle: '+JSON.stringify(patch),async()=>{
 const f=fixture();f.setHistory({transactions:[f.transaction],total_items:1,total_pages:1,links:[],...patch});
 await assert.rejects(()=>f.helpers.paypalSubscriptionEvidence(f.order,{saleId:f.transaction.id}));
});
test('a requested sale ID cannot bypass ambiguous latest-payment attribution',async()=>{
 const f=fixture(),second={...structuredClone(f.transaction),id:'SALE-SYNTHETIC-2'};
 f.setHistory({transactions:[f.transaction,second],total_items:2,total_pages:1,links:[]});
 await assert.rejects(()=>f.helpers.paypalSubscriptionEvidence(f.order,{saleId:f.transaction.id}));
});
for(const status of ['APPROVAL_PENDING','APPROVED'])test(status+' browser cancellation never sends cancellation or fabricates closure',async()=>{
 const f=fixture();f.remote.status=status;
 await assert.rejects(()=>f.helpers.closePayPalSubscriptionCheckout(f.order),{status:409});assert.equal(f.calls.length,2);assert.ok(f.calls.every(call=>call.options===undefined));
});
