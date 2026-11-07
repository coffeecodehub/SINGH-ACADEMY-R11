/** Actual refund/resolver source with explicit in-memory model and PayPal API
 * doubles. These cases prove control flow, not MongoDB concurrency or delivery. */
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {load} from './testLoader.js';import {harness} from './inMemoryModels.js';
import * as business from '../src/utils/business.js';import * as entitlements from '../src/utils/courseEntitlements.js';
const uid='100000000000000000000001',oid='200000000000000000000001',pid='300000000000000000000001',iid='400000000000000000000001',otherInvoice='400000000000000000000002';
const saleId='SALE-OWNED',subId='I-SUB-OWNED',planId='P-PLAN-OWNED',merchant='MERCHANT-OWNED';
const paidAt=new Date(Date.now()-86400000),returnedAt=new Date(Date.now()-3600000),end=new Date(Date.now()+29*86400000);
function fixture({missingPayment=false,reconcile}={}){
 const collection={_id:pid,user:uid,checkoutOrder:oid,invoice:iid,provider:'paypal',providerRecordKey:'paypal:test:'+saleId,providerPaymentId:saleId,status:'paid',amountMinor:1000,refundedMinor:0,currency:'USD',testMode:true,paidAt,verifiedAt:paidAt,verificationSource:'provider_api'};
 const invoice=(id,slug)=>({_id:id,user:uid,kind:'section',sectionSlug:slug,status:'paid',origin:'recurring',fulfillmentAt:paidAt,paidAt,totalMinor:1000,paidMinor:1000,creditedMinor:0,currency:'USD',testMode:true,grantVersion:1,grantStartsAt:paidAt,grantExpiresAt:end});
 const h=harness({User:[{_id:uid,role:'student'}],CheckoutOrder:[{_id:oid,user:uid,provider:'paypal',environment:'test',autoRenew:true,providerOrderId:subId,providerPlanId:planId}],Payment:missingPayment?[]:[collection],Invoice:[invoice(iid,'paid-section'),invoice(otherInvoice,'other-section')],Refund:[],Enrollment:[{_id:'course-row',user:uid,invoice:otherInvoice,status:'active'}],Subscription:[{_id:'global-row',user:uid,invoice:otherInvoice,status:'active'}],SectionAccess:[{_id:'grant-one',user:uid,sectionSlug:'paid-section',invoice:iid,startsAt:paidAt,endsAt:end,status:'active',testMode:true},{_id:'grant-two',user:uid,sectionSlug:'other-section',invoice:otherInvoice,startsAt:paidAt,endsAt:end,status:'active',testMode:true}],Notification:[]});
 const state={sale:{id:saleId,billing_agreement_id:subId,state:'partially_refunded',amount:{total:'10.00',currency:'USD'},create_time:paidAt.toISOString(),update_time:returnedAt.toISOString(),payee:{merchant_id:merchant}},refund:{id:'REFUND-ONE',state:'completed',sale_id:saleId,amount:{total:'2.00',currency:'USD'},create_time:returnedAt.toISOString(),links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v1/payments/sale/'+saleId}]},subscription:{id:subId,custom_id:oid,plan_id:planId},calls:[],reconciliations:[]};
 const deps={crypto,...business,transaction:h.transaction,audit:h.audit,paymentEnvironment:()=> 'test',process:{env:{PAYPAL_MERCHANT_ID:merchant}},syncCheckout:async()=>{throw Error('Unexpected Orders reconciliation');},reconcileStripeInvoice:async()=>{throw Error('Unexpected Stripe reconciliation');},reconcilePayPalSubscription:async(id,options)=>{state.reconciliations.push({id,options});if(reconcile)return reconcile(h,collection);throw business.businessError('Historical sale is not safely attributable',409);},paypalApi:async(path,options)=>{state.calls.push({path,options});if(path==='/v1/payments/refund/REFUND-ONE')return structuredClone(state.refund);if(path==='/v1/payments/sale/'+saleId)return structuredClone(state.sale);if(path==='/v1/billing/subscriptions/'+subId+'?fields=plan')return structuredClone(state.subscription);throw Error('Unexpected provider path '+path);}};
 for(const name of ['User','CheckoutOrder','Payment','Invoice','Refund','Enrollment','Subscription','Notification'])deps[name]=h.model(name);
 const api=load('../src/services/gatewayRefunds.js',deps,'({paypalSaleRefundEvidence,paypalSaleReversalEvidence,recordGatewayRefund})');
 const sections=load('../src/services/sectionAccess.js',{SectionAccess:h.model('SectionAccess'),Invoice:h.model('Invoice'),realAccessFilter:()=>({}),...entitlements,...business},'({loadSectionGrants})');
 return {...h,provider:state,api,sections,collection};
}
test('sale-era refund uses fixed API paths and binds the saved subscription and owned collection',async()=>{
 const f=fixture(),proof=await f.api.paypalSaleRefundEvidence('REFUND-ONE');assert.equal(proof.paymentId,saleId);assert.equal(proof.amountMinor,200);assert.equal(proof.currency,'USD');assert.equal(proof.providerSubscriptionId,subId);assert.equal(proof.localOrderId,oid);assert.deepEqual(f.provider.calls.map(c=>c.path),['/v1/payments/refund/REFUND-ONE','/v1/payments/sale/'+saleId,'/v1/billing/subscriptions/'+subId+'?fields=plan']);assert.equal(f.provider.calls.some(c=>c.options?.method),false);
});
test('partial sale refund preserves its section grant and replay does not credit twice',async()=>{
 const f=fixture(),proof=await f.api.paypalSaleRefundEvidence('REFUND-ONE');assert.equal((await f.sections.loadSectionGrants(uid,{sectionSlug:'paid-section',environment:'test'})).length,1);await f.api.recordGatewayRefund(proof);assert.equal(f.state.data.Payment[0].refundedMinor,200);assert.equal(f.state.data.Invoice[0].creditedMinor,200);assert.equal((await f.sections.loadSectionGrants(uid,{sectionSlug:'paid-section',environment:'test'})).length,1);assert.equal((await f.api.recordGatewayRefund(proof)).replayed,true);assert.equal(f.state.data.Refund.length,1);
});
test('full canonical sale reversal revokes only its invoice contribution and keeps global/unrelated access',async()=>{
 const f=fixture();f.provider.sale.state='reversed';const proof=await f.api.paypalSaleReversalEvidence(saleId);assert.equal(proof.fullSaleReversal,true);assert.equal(proof.grossAmountMinor,1000);await f.api.recordGatewayRefund(proof);assert.equal(f.state.data.Payment[0].refundedMinor,1000);assert.equal(f.state.data.Invoice[0].creditedMinor,1000);assert.ok(f.state.data.Invoice[0].accessRevokedAt);assert.equal((await f.sections.loadSectionGrants(uid,{sectionSlug:'paid-section',environment:'test'})).length,0);assert.equal((await f.sections.loadSectionGrants(uid,{sectionSlug:'other-section',environment:'test'})).length,1);assert.equal(f.state.data.Subscription[0].status,'active');assert.equal(f.state.data.Enrollment[0].status,'active');assert.equal((await f.api.recordGatewayRefund(proof)).replayed,true);assert.equal(f.state.data.Refund.length,1);assert.equal(await f.api.paypalSaleReversalEvidence(saleId),null);
});
test('a partial refund arriving after reversal evidence was read changes the credited remainder atomically',async()=>{
 const f=fixture();f.provider.sale.state='reversed';const reversal=await f.api.paypalSaleReversalEvidence(saleId),partial=await f.api.paypalSaleRefundEvidence('REFUND-ONE');assert.equal(reversal.amountMinor,1000);await f.api.recordGatewayRefund(partial);await f.api.recordGatewayRefund(reversal);assert.deepEqual(f.state.data.Refund.map(r=>r.amountMinor),[200,800]);assert.equal(f.state.data.Payment[0].refundedMinor,1000);assert.equal(f.state.data.Invoice[0].creditedMinor,1000);assert.equal(f.state.data.Refund.reduce((sum,r)=>sum+r.amountMinor,0),1000);
});
test('a delayed individual refund already covered by a full sale reversal cannot create a second credit',async()=>{
 const f=fixture();f.provider.sale.state='reversed';await f.api.recordGatewayRefund(await f.api.paypalSaleReversalEvidence(saleId));const result=await f.api.recordGatewayRefund(await f.api.paypalSaleRefundEvidence('REFUND-ONE'));assert.equal(result.coveredBySaleReversal,true);assert.equal(f.state.data.Refund.length,1);assert.equal(f.state.data.Invoice[0].creditedMinor,1000);
});
test('an unresolved original recurring collection requests reconciliation and remains retryable without a fake paid grant',async()=>{
 const f=fixture({missingPayment:true}),proof=await f.api.paypalSaleRefundEvidence('REFUND-ONE');await assert.rejects(()=>f.api.recordGatewayRefund(proof),{status:503});assert.deepEqual(f.provider.reconciliations,[{id:subId,options:{saleId,refundAlreadyVerified:true}}]);assert.equal(f.state.data.Payment.length,0);assert.equal(f.state.data.Refund.length,0);assert.equal(f.state.data.Invoice[0].creditedMinor,0);assert.equal(f.state.data.Invoice[0].accessRevokedAt,undefined);
});
test('the actual recurring reconciliation guard cannot grant an already-refunded missing collection',async()=>{
 let providerReads=0;
 const f=fixture({missingPayment:true,reconcile:async h=>{
  const actual=load('../src/services/recurringBilling.js',{crypto,...business,paymentEnvironment:()=> 'test',CheckoutOrder:h.model('CheckoutOrder'),Invoice:h.model('Invoice'),paypalSubscriptionEvidence:async()=>{providerReads++;throw Error('Settlement must not run');}},'reconcilePayPalSubscription');
  return actual(subId,{saleId,refundAlreadyVerified:true});
 }}),proof=await f.api.paypalSaleRefundEvidence('REFUND-ONE');
 await assert.rejects(()=>f.api.recordGatewayRefund(proof),{status:503});assert.equal(providerReads,0);assert.equal(f.provider.reconciliations[0].options.refundAlreadyVerified,true);assert.equal(f.state.data.Payment.length,0);assert.equal(f.state.data.Refund.length,0);assert.equal(f.state.data.Invoice[0].creditedMinor,0);assert.equal(f.state.data.Invoice[0].accessRevokedAt,undefined);
});
for(const [name,change,status]of [
 ['different refund ID',f=>{f.provider.refund.id='OTHER';},409],
 ['pending refund',f=>{f.provider.refund.state='pending';},503],
 ['wrong refund currency',f=>{f.provider.refund.amount.currency='EUR';},409],
 ['refund exceeds sale',f=>{f.provider.refund.amount.total='11.00';},409],
 ['refund before sale',f=>{f.provider.refund.create_time=new Date(+paidAt-1000).toISOString();},409],
 ['invalid refund date',f=>{f.provider.refund.create_time='not-a-date';},409],
 ['different sale API ID',f=>{f.provider.sale.id='OTHER';},409],
 ['different subscription API ID',f=>{f.provider.subscription.id='I-OTHER';},409],
 ['different saved plan',f=>{f.provider.subscription.plan_id='P-OTHER';},409],
 ['different owner',f=>{f.state.data.Payment[0].user='100000000000000000000002';},409],
 ['unverified collection',f=>{f.state.data.Payment[0].verifiedAt=undefined;},409],
 ['unsupported verification source',f=>{f.state.data.Payment[0].verificationSource='admin_recorded';},409],
 ['different collection amount',f=>{f.state.data.Payment[0].amountMinor=1001;},409],
 ['different payment environment',f=>{f.state.data.Payment[0].testMode=false;},409],
 ['different merchant',f=>{f.provider.sale.payee.merchant_id='OTHER';},409],
 ['different custom checkout',f=>{f.provider.subscription.custom_id='200000000000000000000002';},409]
])test('subscription refund rejects '+name+' before financial writes',async()=>{
 const f=fixture();change(f);await assert.rejects(()=>f.api.paypalSaleRefundEvidence('REFUND-ONE'),{status});assert.equal(f.state.data.Refund.length,0);assert.equal(f.state.data.Invoice[0].creditedMinor,0);
});
for(const href of ['http://api-m.sandbox.paypal.com/v1/payments/sale/'+saleId,'https://evil.invalid/v1/payments/sale/'+saleId,'https://api-m.paypal.com/v1/payments/sale/'+saleId,'https://user@api-m.sandbox.paypal.com/v1/payments/sale/'+saleId,'https://api-m.sandbox.paypal.com/v1/payments/sale/'+saleId+'?x=1','https://api-m.sandbox.paypal.com/v2/payments/captures/'+saleId])test('sale refund never follows an untrusted or wrong API link: '+href,async()=>{
 const f=fixture();f.provider.refund.links[0].href=href;await assert.rejects(()=>f.api.paypalSaleRefundEvidence('REFUND-ONE'),{status:409});assert.deepEqual(f.provider.calls.map(c=>c.path),['/v1/payments/refund/REFUND-ONE']);
});
test('sale refund rejects disagreement between declared sale ID and canonical up-link',async()=>{const f=fixture();f.provider.refund.links[0].href='https://api-m.sandbox.paypal.com/v1/payments/sale/OTHER';await assert.rejects(()=>f.api.paypalSaleRefundEvidence('REFUND-ONE'),{status:409});assert.equal(f.provider.calls.length,1);});
test('a canonical sale_id can bind a refund without following any link',async()=>{const f=fixture();f.provider.refund.links=[];assert.equal((await f.api.paypalSaleRefundEvidence('REFUND-ONE')).paymentId,saleId);});
test('an unconfirmed sale reversal stays retryable and cannot revoke access',async()=>{const f=fixture();await assert.rejects(()=>f.api.paypalSaleReversalEvidence(saleId),{status:503});assert.equal(f.state.data.Refund.length,0);assert.equal(f.state.data.Invoice[0].accessRevokedAt,undefined);});
test('reversal gross must match immutable original collection even if a caller changes an evidence amount',async()=>{const f=fixture();f.provider.sale.state='reversed';const proof=await f.api.paypalSaleReversalEvidence(saleId);proof.grossAmountMinor=1001;await assert.rejects(()=>f.api.recordGatewayRefund(proof),{status:409});assert.equal(f.state.data.Refund.length,0);});
test('refund audit failure rolls back the credit and access revocation in the control-flow transaction',async()=>{const f=fixture();f.provider.sale.state='reversed';const proof=await f.api.paypalSaleReversalEvidence(saleId);f.state.auditFail=true;await assert.rejects(()=>f.api.recordGatewayRefund(proof),/Audit storage/);assert.equal(f.state.data.Payment[0].refundedMinor,0);assert.equal(f.state.data.Invoice[0].creditedMinor,0);assert.equal(f.state.data.Invoice[0].accessRevokedAt,undefined);assert.equal(f.state.data.Refund.length,0);});
for(const id of ['../sale','bad?x=1','','https://evil.invalid'])test('invalid sale references are refused before any API read: '+id,async()=>{const f=fixture();await assert.rejects(()=>f.api.paypalSaleRefundEvidence(id),{status:400});await assert.rejects(()=>f.api.paypalSaleReversalEvidence(id),{status:400});assert.equal(f.provider.calls.length,0);});
