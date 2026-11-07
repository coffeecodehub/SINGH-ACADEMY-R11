/** Bounded, owner-bound checkout creation recovery. Real source functions with
 * explicit fake providers and a deterministic in-memory data adapter. */
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {load} from './testLoader.js';import {harness,objectId} from './inMemoryModels.js';
import * as business from '../src/utils/business.js';import * as commerce from '../src/utils/commerce.js';
// Explicit synthetic provider retention contract; the production default is no unknown PayPal replay.
process.env.PAYPAL_CREATE_REPLAY_SECONDS='18000';

const uid='100000000000000000000001',other='100000000000000000000002',id='200000000000000000000001';
const key='Original-student-checkout-key-0123456789';
function fixture({provider='stripe',ageMinutes=40,attempted=true,legacy=false,overrides={},createError,search={complete:false},currentFingerprint='original-test-credential'}={}){
 const attemptedAt=new Date(Date.now()-ageMinutes*60000),body={fixture:true,savedPrice:5000,originalReturn:'https://old.academy.test/return'},calls=[];
 const row={_id:id,user:uid,provider,environment:'test',kind:'course',product:'course',title:'Course',currency:'USD',amountMinor:5000,status:'creating',requestKey:crypto.createHash('sha256').update(uid+':'+key).digest('hex'),createdAt:attemptedAt,expiresAt:new Date(+attemptedAt+3600000),...(!legacy?{creationProtocolVersion:1}:{}),...(attempted?{creationAttemptedAt:attemptedAt,lastCreationAttemptedAt:attemptedAt,creationCredentialFingerprint:'original-test-credential',creationPayload:body}:{}),...overrides};
 const h=harness({CheckoutOrder:[row],User:[{_id:uid,role:'student',status:'active',email:'fixture@invalid.test'}],audits:[]});
 const remote=async order=>{calls.push({type:'create',provider,body:structuredClone(order.creationPayload),order:String(order._id)});if(createError)throw createError;return {id:provider==='stripe'?'cs_original':'pp_original',url:provider==='stripe'?'https://checkout.stripe.com/c/pay/cs_original':'https://www.sandbox.paypal.com/checkoutnow?token=pp_original'};};
 const deps={crypto,...business,...commerce,objectId,CheckoutOrder:h.model('CheckoutOrder'),User:h.model('User'),audit:h.audit,transaction:h.transaction,
 requireGateway:()=>({environment:'test'}),providerCredentialFingerprint:()=>currentFingerprint,
 stripeOrderBody:()=>({fresh:true}),paypalOrderBody:()=>({fresh:true}),
 createStripeOrder:remote,createPayPalOrder:remote,createPayPalSubscription:remote,findStripeOrder:async()=>{calls.push({type:'read-only-search'});return search;},
 stripeEvidence:async()=>({state:'pending'}),paypalEvidence:async()=>({state:'pending'}),
 closeStripeCheckout:async()=>{calls.push({type:'expire-unpaid'});return {state:'expired'};},
 closePayPalCheckout:async order=>{assert.ok(order.cancelRequestedAt);calls.push({type:'block-and-read'});return {state:'cancelled'};}
 };
 const api=load('../src/services/onlineCheckout.js',deps,'({releaseCheckout,checkoutStatus,reconcileCreation,publicOrder,bindRecoveredCheckout})');
 const req={user:h.state.data.User[0],get:n=>n==='Idempotency-Key'?key:null};return {...h,api,req,calls,body};
}
for(const provider of ['stripe','paypal'])test(`${provider}: 40-minute lost response replays original request, closes once, permits one replacement key`,async()=>{
 const f=fixture({provider});const result=await f.api.releaseCheckout(f.req);assert.equal(result.released,true);assert.ok(result.replacementKey);assert.equal(f.calls.filter(x=>x.type==='create').length,1);assert.deepEqual(f.calls[0].body,f.body);assert.equal(f.calls[0].order,id);
 const again=await f.api.releaseCheckout(f.req);assert.equal(again.replacementKey,result.replacementKey);assert.equal(f.calls.filter(x=>x.type==='create').length,1);
});
for(const provider of ['stripe','paypal'])test(`${provider}: durably never-sent order can cancel without touching any provider`,async()=>{
 const f=fixture({provider,attempted:false});const out=await f.api.releaseCheckout(f.req);assert.equal(out.released,true);assert.equal(out.order.status,'cancelled');assert.deepEqual(f.calls,[]);
});
for(const provider of ['stripe','paypal'])test(`${provider}: after retention no creation POST is sent, uncertainty is explicit not a new charge`,async()=>{
 const f=fixture({provider,ageMinutes:1500});await assert.rejects(()=>f.api.releaseCheckout(f.req),{code:'CHECKOUT_RECONCILIATION_REQUIRED'});assert.equal(f.calls.some(x=>x.type==='create'),false);const status=await f.api.checkoutStatus(f.req);assert.equal(status.order.recoveryRequired,true);assert.match(status.order.recoveryMessage,/reconciliation/);assert.equal(status.order.status,'creating');
});
test('legacy missing-ID order cannot be replayed with a reconstructed/changed payload',async()=>{
 const f=fixture({legacy:true,overrides:{creationPayload:undefined,creationCredentialFingerprint:undefined}});await assert.rejects(()=>f.api.releaseCheckout(f.req),{code:'CHECKOUT_RECONCILIATION_REQUIRED'});assert.equal(f.calls.some(x=>x.type==='create'),false);
});
test('reconciliation worker is read-only by default, even within idempotency retention',async()=>{
 const f=fixture();await assert.rejects(()=>f.api.reconcileCreation(id),{code:'CHECKOUT_RECONCILIATION_REQUIRED'});assert.deepEqual(f.calls,[{type:'read-only-search'}]);
});
test('explicit worker recovery reuses original provider request within its bounded retention',async()=>{
 const f=fixture();const out=await f.api.reconcileCreation(id,{allowReplay:true});assert.equal(out.status,'pending');assert.deepEqual(f.calls[0].body,f.body);
});
test('an active creation lease blocks cancel/replacement and no money is initiated',async()=>{
 const f=fixture({attempted:false,overrides:{creationClaimUntil:new Date(Date.now()+60000)}});await assert.rejects(()=>f.api.releaseCheckout(f.req),{status:409});assert.deepEqual(f.calls,[]);assert.equal(f.state.data.CheckoutOrder[0].status,'creating');
});
test('different credential/account cannot replay or infer absence of an older account checkout',async()=>{
 const f=fixture({currentFingerprint:'different-account-key',search:{complete:true,remote:null}});await assert.rejects(()=>f.api.releaseCheckout(f.req),{code:'CHECKOUT_RECONCILIATION_REQUIRED'});assert.deepEqual(f.calls,[]);assert.equal(f.state.data.CheckoutOrder[0].status,'creating');
});
test('exhaustive same-account Stripe discovery after expiration can close a truly absent session',async()=>{
 const f=fixture({ageMinutes:1500,search:{complete:true,remote:null}});const result=await f.api.releaseCheckout(f.req);assert.equal(result.released,true);assert.equal(result.order.status,'expired');assert.deepEqual(f.calls,[{type:'read-only-search'}]);
});
test('a truncated Stripe search is NOT evidence that a pending payment never existed',async()=>{
 const f=fixture({ageMinutes:1500,search:{complete:false}});await assert.rejects(()=>f.api.releaseCheckout(f.req),{code:'CHECKOUT_RECONCILIATION_REQUIRED'});assert.equal(f.state.data.CheckoutOrder[0].status,'creating');
});
test('another student cannot release an old order or receive its new request key',async()=>{
 const f=fixture();await assert.rejects(()=>f.api.releaseCheckout({...f.req,user:{_id:other}}),{status:409});assert.deepEqual(f.calls,[]);
});
test('persisted original payload is not disclosed by checkout status',async()=>{
 const f=fixture();const out=await f.api.checkoutStatus(f.req);assert.equal(JSON.stringify(out).includes('originalReturn'),false);assert.equal(JSON.stringify(out).includes('CredentialFingerprint'),false);
});
test('a failed replay preserves uncertainty and releases only its OWN creation lease',async()=>{
 const f=fixture({createError:Object.assign(Error('Transient provider failure'),{status:502})});await assert.rejects(()=>f.api.releaseCheckout(f.req),/Transient/);const row=f.state.data.CheckoutOrder[0];assert.equal(row.status,'creating');assert.ok(row.creationAttemptedAt);assert.equal(row.creationClaim,undefined);assert.equal(row.replacementKey,undefined);
});
test('read-only discovered Stripe ID is saved before creation claim cleanup',async()=>{
 const f=fixture({ageMinutes:1500,search:{complete:true,remote:{id:'cs_original',url:'https://checkout.stripe.com/c/pay/cs_original'}}});const out=await f.api.releaseCheckout(f.req);assert.equal(out.released,true);assert.equal(f.state.data.CheckoutOrder[0].providerOrderId,'cs_original');assert.equal(f.calls.some(x=>x.type==='create'),false);
});

test('PayPal missing-ID replay is disabled unless the operator has confirmed retention for the merchant API',async()=>{
 const old=process.env.PAYPAL_CREATE_REPLAY_SECONDS;delete process.env.PAYPAL_CREATE_REPLAY_SECONDS;
 try{const f=fixture({provider:'paypal'});await assert.rejects(()=>f.api.releaseCheckout(f.req),{code:'CHECKOUT_RECONCILIATION_REQUIRED'});assert.deepEqual(f.calls,[]);assert.equal(f.state.data.CheckoutOrder[0].status,'creating');}
 finally{process.env.PAYPAL_CREATE_REPLAY_SECONDS=old;}
});
function discoveryFixture(pages){
 const calls=[];const api=load('../src/services/paymentProviders.js',{crypto,...business,...commerce},'({findStripeOrder,setStripe(value){stripeClient=value;stripeKey=process.env.STRIPE_SECRET_KEY;}})');
 const old=process.env.STRIPE_SECRET_KEY;process.env.STRIPE_SECRET_KEY='sk_test_SYNTHETIC_NO_PROVIDER_ACCESS';
 api.setStripe({checkout:{sessions:{list:async query=>{calls.push(query);return pages[Math.min(calls.length-1,pages.length-1)];}}}});
 return {api,calls,restore(){if(old===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=old;},order:{_id:id,user:uid,environment:'test',createdAt:new Date(Date.now()-60000)}};
}
test('Stripe read-only discovery never uses local-clock filters to infer provider absence',async()=>{
 const f=discoveryFixture([{data:[{id:'cs_known',created:1,client_reference_id:id,metadata:{sa_order_id:id,sa_user_id:uid},livemode:false}],has_more:false}]);
 try{const result=await f.api.findStripeOrder(f.order);assert.equal(result.complete,true);assert.equal(result.remote.id,'cs_known');assert.deepEqual(f.calls,[{limit:100}]);}finally{f.restore();}
});
test('Stripe account discovery caps pagination and treats an incomplete account history as unknown',async()=>{
 const f=discoveryFixture([{data:[{id:'cs_unrelated'}],has_more:true}]);try{const result=await f.api.findStripeOrder(f.order);assert.equal(result.complete,false);assert.equal(f.calls.length,5);assert.equal(f.calls[1].starting_after,'cs_unrelated');}finally{f.restore();}
});
test('Stripe discovery refuses two matching remote sessions rather than choosing an arbitrary charge',async()=>{
 const row={created:1,client_reference_id:id,metadata:{sa_order_id:id,sa_user_id:uid},livemode:false};
 const f=discoveryFixture([{data:[{...row,id:'cs_one'},{...row,id:'cs_two'}],has_more:false}]);try{await assert.rejects(()=>f.api.findStripeOrder(f.order),/Multiple provider sessions/);}finally{f.restore();}
});

test('PayPal subscriptions retain their documented 72-hour create replay separately from Orders v2',async()=>{
 const f=fixture({provider:'paypal',ageMinutes:48*60,overrides:{autoRenew:true}});const result=await f.api.reconcileCreation(id,{allowReplay:true});assert.equal(result.status,'pending');assert.equal(f.calls.filter(c=>c.type==='create').length,1);assert.deepEqual(f.calls[0].body,f.body);
});
test('PayPal subscription creation after retention refuses an uncertain second subscription',async()=>{
 const f=fixture({provider:'paypal',ageMinutes:73*60,overrides:{autoRenew:true}});await assert.rejects(()=>f.api.reconcileCreation(id,{allowReplay:true}),{code:'CHECKOUT_RECONCILIATION_REQUIRED'});assert.equal(f.calls.some(c=>c.type==='create'),false);assert.equal(f.state.data.CheckoutOrder[0].recoveryRequired,true);
});
