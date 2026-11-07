import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './testLoader.js';
import {harness} from './inMemoryModels.js';
import {businessError} from '../src/utils/business.js';
import {stripeEvents,paypalEvents,paypalAliases,missingEvents,paypalRepairPlan} from '../src/utils/paymentWebhookPolicy.js';

function fixture(){
 const h=harness({CheckoutOrder:[{_id:'1'.repeat(24),status:'paid'}],Payment:[{_id:'2'.repeat(24),amountMinor:1000,refundedMinor:0,status:'paid'}],Invoice:[{_id:'3'.repeat(24),paidMinor:1000,creditedMinor:0,status:'paid'}],Enrollment:[{_id:'4'.repeat(24),status:'active'}],Subscription:[{_id:'5'.repeat(24),status:'active'}],Refund:[],GatewayEvent:[],Notification:[]}),calls=[];
 const call=name=>async(...args)=>{calls.push({name,args});return null;};
 const api=load('../src/services/gatewayWebhooks.js',{
  CheckoutOrder:h.model('CheckoutOrder'),GatewayEvent:h.model('GatewayEvent'),Notification:h.model('Notification'),businessError,paymentEnvironment:()=> 'test',
  syncCheckout:call('syncCheckout'),refundEvidence:call('refundEvidence'),paypalSaleRefundEvidence:call('paypalSaleRefundEvidence'),recordGatewayRefund:call('recordGatewayRefund'),
  paypalSaleReversalEvidence:async id=>{calls.push({name:'paypalSaleReversalEvidence',args:[id]});return {provider:'paypal',id,fullSaleReversal:true};},
  reconcileStripeInvoice:call('reconcileStripeInvoice'),refreshStripeAgreement:call('refreshStripeAgreement'),reconcilePayPalSubscription:call('reconcilePayPalSubscription'),refreshPayPalAgreement:call('refreshPayPalAgreement')
 },'({applyGatewayEvent})');
 return {...h,api,calls};
}
const refundEvents=[['stripe','charge.refunded'],['stripe','refund.created'],['stripe','refund.updated'],['stripe','refund.failed'],['paypal','PAYMENT.CAPTURE.REFUNDED'],['paypal','PAYMENT.SALE.REFUNDED']];
for(const [provider,type]of refundEvents)test(provider+' '+type+' is deduplicated without provider, accounting or access effects',async()=>{
 const f=fixture(),before=structuredClone(f.state.data),event=provider==='stripe'?{id:'evt_ignored_'+type,type,livemode:false,data:{object:{id:'refund-fixture'}}}:{id:'WH-ignored-'+type,event_type:type,resource:{id:'refund-fixture'}};
 assert.equal((await f.api.applyGatewayEvent(provider,event)).handled,false);
 assert.equal(f.calls.length,0);assert.equal(f.state.data.GatewayEvent.length,1);
 for(const name of ['CheckoutOrder','Payment','Invoice','Enrollment','Subscription','Refund','Notification'])assert.deepEqual(f.state.data[name],before[name],name+' must remain unchanged');
 assert.equal((await f.api.applyGatewayEvent(provider,event)).replayed,true);assert.equal(f.state.data.GatewayEvent.length,1);assert.equal(f.calls.length,0);
});
test('an ignored Stripe refund still rejects an event from the wrong environment before recording it',async()=>{
 const f=fixture();await assert.rejects(()=>f.api.applyGatewayEvent('stripe',{id:'evt_wrong',type:'refund.created',livemode:true,data:{object:{id:'re_wrong'}}}),{status:400});assert.equal(f.calls.length,0);assert.equal(f.state.data.GatewayEvent.length,0);
});
test('paid invoice reconciliation and involuntary PayPal reversal protection remain active',async()=>{
 const f=fixture();assert.equal((await f.api.applyGatewayEvent('stripe',{id:'evt_invoice',type:'invoice.paid',livemode:false,data:{object:{id:'in_fixture'}}})).handled,true);
 assert.equal((await f.api.applyGatewayEvent('paypal',{id:'WH-reversal',event_type:'PAYMENT.SALE.REVERSED',resource:{id:'SALE-fixture'}})).handled,true);
 assert.deepEqual(f.calls.map(call=>call.name),['reconcileStripeInvoice','paypalSaleReversalEvidence','recordGatewayRefund']);assert.equal(f.calls[2].args[0].fullSaleReversal,true);
});
test('readiness requires payment/failure/access events and no explicit refund subscriptions',()=>{
 assert.equal(stripeEvents.length,10);assert.equal(paypalEvents.length,17);
 assert.equal(stripeEvents.some(event=>event==='charge.refunded'||event.startsWith('refund.')),false);
 assert.equal(paypalEvents.some(event=>event.endsWith('.REFUNDED')),false);
 for(const type of ['CHECKOUT.PAYMENT-APPROVAL.REVERSED','PAYMENT.CAPTURE.REVERSED','PAYMENT.SALE.REVERSED'])assert.ok(paypalEvents.includes(type));
 assert.deepEqual(missingEvents([...paypalEvents].map(event=>event==='PAYMENT.CAPTURE.DENIED'?'PAYMENT.CAPTURE.DECLINED':event),paypalEvents,paypalAliases),[]);
});
test('old extra refund subscriptions do not fail readiness or get silently changed by an additive repair plan',()=>{
 const existing=[...paypalEvents,'PAYMENT.CAPTURE.REFUNDED','PAYMENT.SALE.REFUNDED'];
 assert.deepEqual(missingEvents(existing,paypalEvents,paypalAliases),[]);
 const plan=paypalRepairPlan({event_types:existing.map(name=>({name}))},{event_types:paypalEvents.map(name=>({name}))});
 assert.deepEqual(plan.missing,[]);assert.deepEqual(plan.added,[]);assert.deepEqual(plan.events.map(event=>event.name),existing);
});
