/** Real checkout orchestration with explicit models/provider stubs; no live charges. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {load} from './testLoader.js';
import {harness,objectId} from './inMemoryModels.js';
import * as business from '../src/utils/business.js';
import {gatewayCurrency} from '../src/utils/commerce.js';

const owner='100000000000000000000001',other='100000000000000000000002',oldId='200000000000000000000001',agreementId='300000000000000000000001';
const freshKey='New-purchase-checkout-key-0123456789',oldKey='Old-purchase-checkout-key-0123456789';
const keyHash=(user,key)=>crypto.createHash('sha256').update(user+':'+key).digest('hex');
function fixture({provider='stripe',kind='course',recurring=false,old={},agreement={},noOld=false,closeError,closeState,createError,beforeTransaction}={}){
 const user={_id:owner,role:'student',status:'active',email:'student@example.invalid',country:'US'};
 const original={_id:oldId,user:owner,kind,product:'learning-product',provider,environment:'test',title:'Learning product',currency:'USD',amountMinor:1000,renewalAmountMinor:1000,durationMonths:1,status:'pending',providerOrderId:'original-provider-order',approvalUrl:'https://checkout.stripe.com/c/pay/old',requestKey:keyHash(owner,oldKey),requestFingerprint:'original-request',creationProtocolVersion:1,creationAttemptedAt:new Date(Date.now()-60000),createdAt:new Date(Date.now()-60000),expiresAt:new Date(Date.now()+3600000),autoRenew:recurring,...(recurring?{billingAgreement:agreementId}:{}),...old};
 const mandate={_id:agreementId,user:owner,checkoutOrder:oldId,provider,environment:'test',kind,product:original.product,status:'creating',autoRenew:true,activeKey:[owner,'test',kind,original.product].join(':'),...agreement};
 const h=harness({CheckoutOrder:noOld?[]:[original],BillingAgreement:recurring?[mandate]:[],User:[user],Invoice:[],Payment:[],Subscription:[],Enrollment:[]}),calls=[];
 let hook=beforeTransaction;
 const close=async order=>{calls.push({type:'close',id:String(order._id),provider:order.provider});if(order.provider==='paypal')assert.ok(order.cancelRequestedAt);if(closeError)throw closeError;return {state:closeState||(order.provider==='stripe'?'expired':'cancelled')};};
 const remote=async order=>{calls.push({type:'create',id:String(order._id),provider:order.provider});if(createError)throw createError;return {id:'new-'+order._id,url:order.provider==='stripe'?'https://checkout.stripe.com/c/pay/new':'https://www.sandbox.paypal.com/checkoutnow?token=new'};};
 const deps={crypto,mongoose,...business,objectId,gatewayCurrency,
  CheckoutOrder:h.model('CheckoutOrder'),BillingAgreement:h.model('BillingAgreement'),User:h.model('User'),Invoice:h.model('Invoice'),Payment:h.model('Payment'),
  capabilities:async()=>({transactions:true}),transaction:async fn=>{if(hook){const current=hook;hook=null;await current(h);}return h.transaction(fn);},
  quoteProduct:async({kind,product})=>({product:{title:'Learning product',slug:product,accessType:'one_time'},offer:{key:'month',label:'One month'},quote:{amountMinor:1000,subtotalMinor:1000,discountMinor:0,currency:'USD',durationMonths:1,country:'US'}}),
  gatewayConfiguration:()=>({stripe:{enabled:true,environment:'test'},paypal:{enabled:true,environment:'test'}}),
  renewalCheckoutConflict:async()=>'',assertNoActivePurchase:async()=>{},requireGateway:()=>({environment:'test'}),
  providerCredentialFingerprint:()=> 'synthetic-credential-only',stripeOrderBody:()=>({synthetic:true}),paypalOrderBody:()=>({synthetic:true}),paypalSubscriptionBody:()=>({synthetic:true}),
  createStripeOrder:remote,createPayPalOrder:remote,createPayPalSubscription:remote,
  closeStripeCheckout:close,closePayPalCheckout:close,closePayPalSubscriptionCheckout:close,
  findStripeOrder:async()=>({complete:false}),audit:h.audit
 };
 const api=load('../src/services/onlineCheckout.js',deps,'({startCheckout,quoteCheckout,checkoutStatus,releaseCheckout,preparePendingRepurchase,setFulfill(fn){fulfillOnlineOrder=fn;}})');
 api.setFulfill(async id=>{const order=h.state.data.CheckoutOrder.find(order=>String(order._id)===String(id));order.status='paid';calls.push({type:'settle',id:String(id)});return {...order};});
 const req=(extra={},key=freshKey)=>({user,body:{kind,product:'learning-product',provider:'stripe',optionKey:'month',autoRenew:false,termsAccepted:true,...extra},get:()=>key});
 async function start(extra={},key=freshKey){const request=req(extra,key);const {quote}=await api.quoteCheckout(request);request.body.quoteFingerprint=quote.fingerprint;return api.startCheckout(request);}
 return {...h,api,calls,start,req,old:original,mandate,setHook:value=>{hook=value;}};
}

for(const kind of ['course','section'])for(const provider of ['stripe','paypal'])test(`${kind} fresh purchase closes an earlier unpaid ${provider} checkout before creating another`,async()=>{
 const f=fixture({kind,provider});const result=await f.start();
 assert.equal(result.order.status,'pending');assert.notEqual(String(result.order._id),oldId);
 assert.deepEqual(f.calls.map(call=>call.type),['close','create']);
 assert.equal(f.state.data.CheckoutOrder[0].status,provider==='stripe'?'expired':'cancelled');
 assert.equal(f.state.data.CheckoutOrder.length,2);assert.equal(f.state.data.Invoice.length,0);assert.equal(f.state.data.Payment.length,0);
});
for(const provider of ['stripe','paypal'])test(`${provider} unpaid recurring replacement releases its key but preserves the old pending billing identity`,async()=>{
 const f=fixture({provider,recurring:true});await f.start({autoRenew:true});
 const old=f.state.data.BillingAgreement.find(item=>item._id===agreementId),created=f.state.data.BillingAgreement.find(item=>item._id!==agreementId);
 assert.equal(old.status,'creating');assert.equal(old.autoRenew,false);assert.equal(old.activeKey,undefined);assert.equal(old.checkoutOrder,oldId);assert.equal(old.accessCancelledAt,undefined);
 assert.equal(created.status,'creating');assert.equal(created.activeKey,[owner,'test','course','learning-product'].join(':'));
 assert.equal(f.state.data.CheckoutOrder.length,2);assert.equal(f.state.data.Payment.length,0);
});
test('a stale key on a provider-confirmed closed unpaid agreement is released for the new purchase',async()=>{
 const f=fixture({recurring:true,old:{status:'expired',cancelRequestedAt:new Date()}});await f.start({autoRenew:true});
 assert.equal(f.calls.filter(call=>call.type==='close').length,1);assert.equal(f.state.data.BillingAgreement[0].activeKey,undefined);assert.equal(f.state.data.BillingAgreement[0].status,'creating');
});
test('the original request release remains idempotent and keeps a single replacement key',async()=>{
 const f=fixture({recurring:true});const a=await f.api.releaseCheckout(f.req({},oldKey)),b=await f.api.releaseCheckout(f.req({},oldKey));
 assert.equal(a.released,true);assert.equal(a.replacementKey,b.replacementKey);assert.equal(f.calls.length,2);assert.equal(f.state.data.BillingAgreement[0].status,'creating');
});
for(const changes of [{user:other},{product:'different-product'},{kind:'section'},{environment:'live'},{renewalSetup:true},{status:'paid'},{status:'renewal_ready'}])test('a fresh purchase leaves unrelated or completed checkout unchanged '+JSON.stringify(changes),async()=>{
 const f=fixture({old:changes});const before=structuredClone(f.state.data.CheckoutOrder[0]);await f.start();
 assert.deepEqual(f.state.data.CheckoutOrder[0],before);assert.deepEqual(f.calls.map(call=>call.type),['create']);
});
for(const status of ['active','trialing','paused'])test(`a ${status} mandate is never automatically closed as an abandoned checkout`,async()=>{
 const f=fixture({recurring:true,agreement:{status}});const before=structuredClone(f.state.data.BillingAgreement[0]);
 await assert.rejects(f.start({autoRenew:true}),{status:409,code:'CHECKOUT_RESTART_REQUIRED'});assert.deepEqual(f.calls,[]);assert.deepEqual(f.state.data.BillingAgreement[0],before);assert.equal(f.state.data.CheckoutOrder.length,1);
});
for(const field of ['renewalOperation','accessCancellationRequestedAt','accessCancelledAt','sourceInvoiceId'])test('an unresolved billing action or paid source is not released: '+field,async()=>{
 const f=fixture({recurring:true,agreement:{[field]:field==='renewalOperation'?{id:'operation'}:new Date()}});
 await assert.rejects(f.start(),{code:'CHECKOUT_RESTART_REQUIRED'});assert.deepEqual(f.calls,[]);assert.equal(f.state.data.CheckoutOrder.length,1);
});
test('a provider closure error preserves its status and safe diagnostic fields without creating a new checkout',async()=>{
 const error=Object.assign(new Error('Provider could not confirm closure'),{status:502,paymentProvider:'stripe',providerStatus:503});const f=fixture({closeError:error});
 await assert.rejects(f.start(),failure=>failure.cause===error&&failure.code==='CHECKOUT_RESTART_REQUIRED'&&failure.status===502&&failure.providerStatus===503&&failure.paymentProvider==='stripe');
 assert.equal(f.state.data.CheckoutOrder.length,1);assert.equal(f.calls.some(call=>call.type==='create'),false);assert.equal(f.state.data.Payment.length,0);
});
test('a Stripe resource-missing closure is never treated as unpaid or safely closed',async()=>{
 const error=Object.assign(new Error('No such checkout session'),{type:'StripeInvalidRequestError',statusCode:404,code:'resource_missing',requestId:'req_synthetic_missing'}),f=fixture({closeError:error});
 await assert.rejects(f.start(),failure=>failure.code==='CHECKOUT_RESTART_REQUIRED'&&failure.cause===error&&failure.cause.code==='resource_missing'&&failure.cause.statusCode===404);
 assert.equal(error.code,'resource_missing');assert.equal(f.state.data.CheckoutOrder[0].status,'pending');assert.equal(f.state.data.CheckoutOrder.length,1);assert.equal(f.calls.some(call=>call.type==='create'),false);
});
test('a new provider creation failure keeps the earlier unpaid billing row and both checkout histories',async()=>{
 const f=fixture({recurring:true,createError:Object.assign(new Error('New provider checkout unavailable'),{status:502})});await assert.rejects(f.start({autoRenew:true}),{status:502});
 assert.equal(f.state.data.CheckoutOrder.length,2);assert.equal(f.state.data.CheckoutOrder[0].status,'expired');assert.equal(f.state.data.CheckoutOrder[1].status,'creating');
 assert.equal(f.state.data.BillingAgreement.length,2);assert.equal(f.state.data.BillingAgreement[0].status,'creating');assert.equal(f.state.data.BillingAgreement[0].autoRenew,false);assert.equal(f.state.data.BillingAgreement[0].activeKey,undefined);assert.equal(f.state.data.BillingAgreement[0].accessCancelledAt,undefined);
 assert.equal(f.state.data.Payment.length,0);assert.equal(f.state.data.Invoice.length,0);
});
test('a genuine in-flight operation refuses replacement and preserves its lease',async()=>{
 const f=fixture({old:{operationClaim:'existing',operationClaimUntil:new Date(Date.now()+60000)}});
 await assert.rejects(f.start(),{status:409,code:'CHECKOUT_RESTART_REQUIRED'});assert.deepEqual(f.calls,[]);assert.equal(f.state.data.CheckoutOrder[0].operationClaim,'existing');assert.equal(f.state.data.CheckoutOrder.length,1);
});
test('a missing provider identity outside safe recovery never creates a second payment',async()=>{
 const f=fixture({old:{providerOrderId:undefined,creationCredentialFingerprint:'old-account',creationPayload:{original:true},creationAttemptedAt:new Date(Date.now()-48*3600000)}});
 await assert.rejects(f.start(),{code:'CHECKOUT_RESTART_REQUIRED'});assert.equal(f.calls.some(call=>call.type==='create'),false);assert.equal(f.state.data.CheckoutOrder[0].recoveryRequired,true);
});
test('a stale recurring key with a closed legacy checkout and missing provider identity remains blocked',async()=>{
 const f=fixture({recurring:true,old:{status:'failed',providerOrderId:undefined,creationProtocolVersion:undefined}});
 await assert.rejects(f.start({autoRenew:true}),{code:'CHECKOUT_RESTART_REQUIRED'});assert.equal(f.state.data.BillingAgreement[0].activeKey,f.mandate.activeKey);assert.equal(f.state.data.CheckoutOrder[0].recoveryRequired,true);assert.deepEqual(f.calls,[]);assert.equal(f.state.data.CheckoutOrder.length,1);
});
test('a closed never-sent checkout with an active creation lease cannot release the recurring key',async()=>{
 const f=fixture({recurring:true,old:{status:'cancelled',providerOrderId:undefined,creationAttemptedAt:undefined,creationClaimUntil:new Date(Date.now()+60000)}});
 await assert.rejects(f.start({autoRenew:true}),{code:'CHECKOUT_RESTART_REQUIRED'});assert.equal(f.state.data.BillingAgreement[0].activeKey,f.mandate.activeKey);assert.deepEqual(f.calls,[]);
});
for(const model of ['Invoice','Payment'])test('an already paid '+model+' protects its checkout and mandate even when legacy status is pending',async()=>{
 const f=fixture({recurring:true});f.state.data[model].push({_id:'400000000000000000000001',user:owner,status:'paid',...(model==='Invoice'?{billingAgreement:agreementId}:{checkoutOrder:oldId})});
 await assert.rejects(f.start({autoRenew:true}),{code:'CHECKOUT_RESTART_REQUIRED'});assert.equal(f.state.data.BillingAgreement[0].activeKey,f.mandate.activeKey);assert.equal(f.state.data.BillingAgreement[0].autoRenew,true);assert.equal(f.state.data.CheckoutOrder[0].status,'pending');assert.deepEqual(f.calls,[]);
});
test('a payment that completes while its old session is being closed is settled instead of creating another charge',async()=>{
 const f=fixture({closeState:'paid'});await assert.rejects(f.start(),{code:'ACTIVE_ACCESS_EXISTS'});
 assert.equal(f.state.data.CheckoutOrder[0].status,'paid');assert.deepEqual(f.calls.map(call=>call.type),['close','settle']);assert.equal(f.state.data.CheckoutOrder.length,1);
});
test('a legacy locally closed checkout is still reconciled if Stripe reports it paid',async()=>{
 const f=fixture({recurring:true,old:{status:'failed'},closeState:'paid'});await assert.rejects(f.start({autoRenew:true}),{code:'ACTIVE_ACCESS_EXISTS'});
 assert.deepEqual(f.calls.map(call=>call.type),['close','settle']);assert.equal(f.state.data.CheckoutOrder.length,1);assert.equal(f.state.data.CheckoutOrder[0].status,'paid');
});
test('a legacy locally closed checkout cannot release its key while Stripe reports processing',async()=>{
 const f=fixture({recurring:true,old:{status:'expired'},closeError:Object.assign(new Error('Stripe payment is processing'),{status:409})});
 await assert.rejects(f.start({autoRenew:true}),{code:'CHECKOUT_RESTART_REQUIRED'});assert.equal(f.state.data.CheckoutOrder.length,1);assert.equal(f.state.data.BillingAgreement[0].activeKey,f.mandate.activeKey);assert.deepEqual(f.calls.map(call=>call.type),['close']);
});
test('a competing different-key checkout detected inside the transaction creates no replacement record',async()=>{
 const f=fixture({noOld:true,beforeTransaction:h=>{h.state.data.CheckoutOrder.push({_id:oldId,user:owner,kind:'course',product:'learning-product',environment:'test',status:'creating',requestKey:'different-key',renewalSetup:false});}});
 await assert.rejects(f.start(),{status:409,code:'CHECKOUT_RESTART_REQUIRED'});assert.equal(f.state.data.CheckoutOrder.length,1);assert.equal(f.state.data.CheckoutOrder[0].requestKey,'different-key');assert.deepEqual(f.calls,[]);
});
test('same-key retries return the same new checkout without closing or creating it again',async()=>{
 const f=fixture({noOld:true});const first=await f.start(),again=await f.start();
 assert.equal(String(first.order._id),String(again.order._id));assert.deepEqual(f.calls.map(call=>call.type),['create']);assert.equal(f.state.data.CheckoutOrder.length,1);
});
test('quote fingerprint failure occurs before any previous provider checkout is changed',async()=>{
 const f=fixture();await assert.rejects(f.api.startCheckout(f.req({quoteFingerprint:'incorrect'})),{status:409});assert.deepEqual(f.calls,[]);assert.equal(f.state.data.CheckoutOrder[0].status,'pending');
});
test('a normal return or billing read does not itself invoke the fresh-purchase preparation',async()=>{
 const f=fixture();const result=await f.api.checkoutStatus(f.req({},oldKey));assert.equal(result.found,true);assert.equal(result.order.status,'pending');assert.equal(f.state.data.CheckoutOrder[0].cancelRequestedAt,undefined);assert.deepEqual(f.calls,[]);
});
