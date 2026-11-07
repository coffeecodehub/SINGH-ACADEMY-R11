/** Provider/service contract tests with explicit in-memory/HTTP stubs.
 * These do not create real payments or substitute for replica-set integration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {load} from './testLoader.js';
import {harness,objectId} from './inMemoryModels.js';
import * as business from '../src/utils/business.js';
import {paypalClientSecret} from '../src/utils/commerce.js';
import {teamCategories,compareTeam,teamCategoryFilter} from '../src/utils/teamCategories.js';
import {payloadFor} from '../src/utils/cmsValidation.js';
const uid='111111111111111111111111',id='222222222222222222222222',other='333333333333333333333333',key='original-checkout-key-123456';
const base=(provider='stripe')=>({_id:id,user:uid,provider,providerOrderId:provider==='stripe'?'cs_fixture':'PPFIXTURE',
 environment:'test',kind:'course',product:'paid-demo',title:'Course',currency:'USD',amountMinor:14900,status:'pending',
 requestKey:crypto.createHash('sha256').update(uid+':'+key).digest('hex')});
function providerFixture(){
 const state={expires:0,captures:0,reads:0,expireFailure:false};
 const env={STRIPE_SECRET_KEY:'sk_test_fixture',PAYPAL_CLIENT_ID:'ci-only',PAYPAL_CLIENT_SECRET:'ci-only',PAYPAL_MODE:'sandbox'};
 state.stripe={id:'cs_fixture',mode:'payment',livemode:false,client_reference_id:id,metadata:{sa_order_id:id,sa_user_id:uid},status:'open',payment_status:'unpaid',payment_intent:null};
 state.paypal={id:'PPFIXTURE',intent:'CAPTURE',status:'CREATED',purchase_units:[{custom_id:id,amount:{currency_code:'USD',value:'149.00'}}]};
 const stripe={checkout:{sessions:{
  retrieve:async()=>{state.reads++;return structuredClone(state.stripe);},
  expire:async(_id,_params,options)=>{assert.equal(_id,'cs_fixture');assert.equal(options.idempotencyKey,'sa-close-'+id);state.expires++;state.stripe.status='expired';if(state.expireFailure)throw Error('lost expiration response');return structuredClone(state.stripe);}
 }}};
 const api=load('../src/services/paymentProviders.js',{crypto,...business,paypalClientSecret,process:{env},
  paymentEnvironment:()=> 'test',
  fetch:async(url,opts)=>{
   if(url.endsWith('/token'))return Response.json({access_token:'ci-only-token',expires_in:3600});
   if(url.endsWith('/capture')){state.captures++;assert.equal(opts.method,'POST');state.paypal.status='COMPLETED';state.paypal.purchase_units[0].payments={captures:[{id:'CAPTURE',status:'COMPLETED',amount:{currency_code:'USD',value:'149.00'},create_time:new Date().toISOString()}]};}
   return Response.json(structuredClone(state.paypal));
  }},'({closeStripeCheckout,closePayPalCheckout,paypalEvidence,setStripe(value){stripeClient=value;stripeKey=process.env.STRIPE_SECRET_KEY;}})');
 api.setStripe(stripe);return {...api,state};
}
test('Stripe switch expires the exact unpaid Checkout Session and confirms provider closure',async()=>{
 const f=providerFixture();assert.equal((await f.closeStripeCheckout(base())).state,'expired');assert.equal(f.state.expires,1);assert.equal(f.state.reads,2);
});
test('lost Stripe expire response is re-read, not treated as a new purchase',async()=>{
 const f=providerFixture();f.state.expireFailure=true;assert.equal((await f.closeStripeCheckout(base())).state,'expired');assert.equal(f.state.expires,1);
});
for(const status of ['processing','requires_capture','succeeded','requires_confirmation','requires_action'])test(`Stripe ${status} payment intent blocks provider replacement`,async()=>{
 const f=providerFixture();f.state.stripe.payment_intent={status};await assert.rejects(f.closeStripeCheckout(base()),e=>e.status===409);assert.equal(f.state.expires,0);
});
test('Stripe different student metadata cannot be expired',async()=>{
 const f=providerFixture();f.state.stripe.metadata.sa_user_id=other;await assert.rejects(f.closeStripeCheckout(base()),e=>e.status===409);assert.equal(f.state.expires,0);
});
test('paid Stripe session returns collected evidence and is never expired',async()=>{
 const f=providerFixture();Object.assign(f.state.stripe,{payment_status:'paid',status:'complete',currency:'usd',amount_total:14900,payment_intent:{id:'PI',status:'succeeded',amount_received:14900,currency:'usd',latest_charge:{paid:true,created:Math.floor(Date.now()/1000)}}});
 const e=await f.closeStripeCheckout(base());assert.equal(e.state,'paid');assert.equal(e.paymentId,'PI');assert.equal(f.state.expires,0);
});
for(const status of ['CREATED','PAYER_ACTION_REQUIRED','APPROVED'])test(`PayPal ${status} unattempted capture can be abandoned without a capture API call`,async()=>{
 const f=providerFixture();f.state.paypal.status=status;const old={...base('paypal'),cancelRequestedAt:new Date()};
 assert.equal((await f.closePayPalCheckout(old)).state,'cancelled');
 await f.paypalEvidence(old,{capture:true});assert.equal(f.state.captures,0,'late callback must not capture abandoned checkout');
});
test('PayPal abandonment refuses an order without the durable capture denial marker',async()=>{
 const f=providerFixture();await assert.rejects(f.closePayPalCheckout(base('paypal')),e=>e.status===409);assert.equal(f.state.captures,0);
});
test('an uncertain PayPal capture cannot be forgotten when operation lease expires',async()=>{
 const f=providerFixture();f.state.paypal.status='APPROVED';
 await assert.rejects(f.closePayPalCheckout({...base('paypal'),cancelRequestedAt:new Date(),captureAttemptedAt:new Date()}),e=>e.status===409);
 assert.equal(f.state.captures,0);
});
for(const property of ['captures','authorizations'])test(`PayPal existing ${property} blocks replacement`,async()=>{
 const f=providerFixture();f.state.paypal.purchase_units[0].payments={[property]:[{id:'existing'}]};
 await assert.rejects(f.closePayPalCheckout({...base('paypal'),cancelRequestedAt:new Date()}),e=>e.status===409);
});
test('PayPal validates saved amount and owner-bound order before abandoning',async()=>{
 const f=providerFixture();f.state.paypal.purchase_units[0].custom_id=other;
 await assert.rejects(f.closePayPalCheckout({...base('paypal'),cancelRequestedAt:new Date()}),e=>e.status===409);
});
test('PayPal capture persists uncertainty marker before network mutation',async()=>{
 const f=providerFixture();f.state.paypal.status='APPROVED';let before=false;
 await f.paypalEvidence(base('paypal'),{capture:true,onBeforeCapture:async()=>{assert.equal(f.state.captures,0);before=true;}});
 assert.equal(before,true);assert.equal(f.state.captures,1);
});
test('a rejected pre-capture write prevents the PayPal capture request',async()=>{
 const f=providerFixture();f.state.paypal.status='APPROVED';
 await assert.rejects(f.paypalEvidence(base('paypal'),{capture:true,onBeforeCapture:async()=>{throw Error('write refused');}}),/write refused/);assert.equal(f.state.captures,0);
});
function serviceFixture(provider='stripe'){
 const h=harness({CheckoutOrder:[base(provider)],User:[{_id:uid,role:'student',status:'active'}]}),closed=[],captures=[];
 const Model=h.model('CheckoutOrder');
 const api=load('../src/services/onlineCheckout.js',{crypto,...business,objectId,CheckoutOrder:Model,User:h.model('User'),
  closeStripeCheckout:async o=>{closed.push(o._id);return {state:'expired'};},
  closePayPalCheckout:async o=>{assert.ok(o.cancelRequestedAt);closed.push(o._id);return {state:'cancelled'};},
  paypalEvidence:async(o,opts)=>{captures.push(opts.capture);if(opts.capture)await opts.onBeforeCapture();return {state:'pending'};}
 },'({releaseCheckout,syncCheckout})');
 const req=(user=uid)=>({user:{_id:user},headers:{'idempotency-key':key},get:()=>key});
 return {...api,...h,req,closed,captures,Model};
}
for(const provider of ['stripe','paypal'])test(`${provider} release preserves financial records and returns one replay-stable replacement key`,async()=>{
 const f=serviceFixture(provider),first=await f.releaseCheckout(f.req()),again=await f.releaseCheckout(f.req());
 assert.equal(first.released,true);assert.match(first.replacementKey,/^[\w-]{16,128}$/);assert.equal(first.replacementKey,again.replacementKey);
 assert.equal(f.closed.length,1);assert.equal(f.state.data.CheckoutOrder.length,1);
 assert.equal(f.state.transactions,0);assert.equal(f.state.data.Invoice,undefined);assert.equal(f.state.data.Payment,undefined);
 assert.equal(f.state.data.CheckoutOrder[0].operationClaim,undefined);assert.equal(first.order.replacementKey,undefined);
});
test('another student cannot close an order using a known checkout request key',async()=>{
 const f=serviceFixture();await assert.rejects(f.releaseCheckout(f.req(other)),e=>e.status===409);assert.equal(f.closed.length,0);
});
test('active operation lease refuses a competing provider switch',async()=>{
 const f=serviceFixture();Object.assign(f.state.data.CheckoutOrder[0],{operationClaim:'busy',operationClaimUntil:new Date(Date.now()+60000)});
 await assert.rejects(f.releaseCheckout(f.req()),e=>e.status===409);assert.equal(f.closed.length,0);assert.equal(f.state.data.CheckoutOrder[0].operationClaim,'busy');
});
test('a paid order is returned without issuing a replacement key',async()=>{
 const f=serviceFixture();f.state.data.CheckoutOrder[0].status='paid';const r=await f.releaseCheckout(f.req());
 assert.equal(r.released,false);assert.equal(r.replacementKey,undefined);assert.equal(f.closed.length,0);
});
test('PayPal release suppresses a later capture callback while keeping read-only reconciliation',async()=>{
 const f=serviceFixture('paypal');await f.releaseCheckout(f.req());await f.syncCheckout(id,{userId:uid,capture:true});assert.deepEqual(f.captures,[false]);
});
test('a failed PayPal checkout persists capture exclusion before returning a replacement',async()=>{
 const f=serviceFixture('paypal');f.state.data.CheckoutOrder[0].status='failed';
 const released=await f.releaseCheckout(f.req());assert.equal(released.released,true);assert.ok(f.state.data.CheckoutOrder[0].cancelRequestedAt);assert.equal(f.closed.length,1);
 await f.syncCheckout(id,{userId:uid,capture:true});assert.deepEqual(f.captures,[false]);
});
test('normal PayPal confirmation uses the shared operation lease and stores capture uncertainty',async()=>{
 const f=serviceFixture('paypal');await f.syncCheckout(id,{userId:uid,capture:true});assert.deepEqual(f.captures,[true]);
 assert.ok(f.state.data.CheckoutOrder[0].captureAttemptedAt instanceof Date);assert.equal(f.state.data.CheckoutOrder[0].operationClaim,undefined);
});
test('account removal blocks a stale PayPal confirmation before persisting or sending a capture',async()=>{
 const f=serviceFixture('paypal');f.state.data.User[0].removalState='pending';
 await assert.rejects(f.syncCheckout(id,{userId:uid,capture:true}),error=>error.status===409&&/removal/.test(error.message));
 assert.equal(f.state.data.CheckoutOrder[0].captureAttemptedAt,undefined);assert.equal(f.state.data.CheckoutOrder[0].operationClaim,undefined);
});
for(const categories of [['founder','faculty'],['faculty','board','core'],['founder','faculty','board','core']])test(`multiple team categories serialize canonically: ${categories.join(',')}`,()=>{
 const result=payloadFor('team',{name:'Team Member',categories:[...categories].reverse()},{creating:true});
 assert.deepEqual(result.categories,categories);assert.equal(result.category,categories[0]);assert.deepEqual(teamCategories(result),categories);
});
for(const categories of [[],['founder','founder'],['student'],['faculty',null],'founder',{founder:true}])test(`invalid team categories rejected ${JSON.stringify(categories)}`,()=>{
 assert.throws(()=>payloadFor('team',{name:'Member',categories},{creating:true}));
});
test('legacy category reads and unrelated edits preserve old member records',()=>{
 assert.deepEqual(teamCategories({category:'board'}),['board']);assert.deepEqual(teamCategories({category:'founder',categories:[]}),['founder']);
 assert.deepEqual(payloadFor('team',{name:'Updated'},{previous:{category:'board'}}),{name:'Updated'});
});
test('founder priority uses any selected category, not a stale primary label',()=>{
 const members=[{name:'Core',category:'core'},{name:'Founder',category:'board',categories:['faculty','founder']},{name:'Faculty',category:'faculty'}];
 assert.deepEqual([...members].sort(compareTeam).map(x=>x.name),['Founder','Faculty','Core']);
});
test('category query matches canonical arrays plus only legacy fallback records',()=>{
 const query=teamCategoryFilter('faculty');assert.deepEqual(query.$or[0],{categories:'faculty'});
 assert.deepEqual(query.$or[1],{categories:{$exists:false},category:'faculty'});assert.deepEqual(query.$or[2],{categories:{$size:0},category:'faculty'});
});
