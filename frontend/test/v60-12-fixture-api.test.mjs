/** Actual HTTP checks for the TEST fixture itself. Not the production Express API,
 * database, payment provider or inbox. Only loopback ephemeral sockets are used. */
import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';
import {createUiFixtureApi,CONTROL_HEADER,CONTROL_VALUE} from '../../scripts/ui-fixture-api.mjs';
async function fixture(t){
 const api=createUiFixtureApi();api.listen(0,'127.0.0.1');await once(api,'listening');
 t.after(()=>new Promise(resolve=>{api.closeAllConnections();api.close(resolve);}));
 const base='http://127.0.0.1:'+api.address().port;
 const call=async(path,{body,cookie='',key,control=false,method=body?'POST':'GET'}={})=>{
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie,...(key?{'Idempotency-Key':key}:{}),...(control?{[CONTROL_HEADER]:CONTROL_VALUE}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return{status:response.status,data:await response.json(),cookies:response.headers.getSetCookie()};
 };
 const login=async(email='learner@example.invalid')=>{const r=await call('/api/auth/login',{body:{email,password:'TestPassword123!'}});assert.equal(r.status,200);return r.cookies.find(x=>x.startsWith('sa_student_v45=')).split(';')[0];};
 return{call,login,config:body=>call('/__fixture/config',{control:true,body}),state:async()=> (await call('/__fixture/state',{control:true})).data};
}
const purchase={kind:'course',product:'paid-demo',optionKey:'annual',provider:'stripe'},key='fixture-order-key-123456789';
test('fixture controls require the fixed local test header and ordinary API needs authentication',async t=>{const f=await fixture(t);assert.equal((await f.call('/__fixture/reset',{body:{}})).status,403);assert.equal((await f.call('/api/payments/checkout',{body:purchase,key})).status,401);assert.equal((await f.call('/api/payments/mine/invoices')).status,401);});
test('fixture login/logout uses root cookie and subsequent requests cannot revive the revoked token',async t=>{const f=await fixture(t),cookie=await f.login();assert.equal((await f.call('/api/auth/session',{cookie})).data.user.role,'student');const out=await f.call('/api/auth/logout',{cookie,body:{}});assert.ok(out.cookies.some(c=>c.startsWith('sa_student_v45=; Path=/api;')));assert.equal((await f.call('/api/auth/session',{cookie})).data.user,null);});
for(const provider of ['stripe','paypal'])for(const kind of ['course','section'])test(`fixture ${provider}/${kind}: replay one key, approval once, owned invoice and grant`,async t=>{
 const f=await fixture(t),cookie=await f.login(),body={...purchase,provider,kind,product:kind==='section'?'academy-section':'paid-demo'};
 const first=await f.call('/api/payments/checkout',{cookie,body,key}),second=await f.call('/api/payments/checkout',{cookie,body,key});assert.equal(first.status,200);assert.equal(first.data.order._id,second.data.order._id);
 const id=first.data.order._id;await f.call('/api/payments/orders/'+id+'/confirm',{cookie,body:{}});assert.equal((await f.state()).payments.length,0);
 await f.call('/__fixture/approve',{control:true,body:{id}});
 for(let i=0;i<3;i++)assert.equal((await f.call('/api/payments/orders/'+id+'/confirm',{cookie,body:{}})).data.order.status,'paid');
 const state=await f.state();assert.equal(state.orders.length,1);assert.equal(state.payments.length,1);assert.equal(state.invoices.length,1);assert.equal(state.notices.length,1);assert.equal(state.sectionTerms.length,kind==='section'?1:0);assert.equal(state.terms.length,0);assert.equal(state.invoices[0].user,'1'.repeat(24));
});
test('lost checkout HTTP reply retains its original key/order without granting access',async t=>{const f=await fixture(t),cookie=await f.login();await f.config({createMode:'lost'});const r=await f.call('/api/payments/checkout',{cookie,body:purchase,key});assert.equal(r.status,504);const read=await f.call('/api/payments/checkout-status',{cookie,key});assert.equal(read.data.order.status,'pending');assert.equal((await f.state()).payments.length,0);});
test('fixture refuses free-course purchase; enrollment does not create payment/invoice',async t=>{const f=await fixture(t),cookie=await f.login();assert.equal((await f.call('/api/payments/checkout',{cookie,body:{...purchase,product:'free-demo'},key})).status,409);assert.equal((await f.call('/api/courses/free-demo/enroll',{cookie,body:{}})).status,200);assert.equal((await f.state()).invoices.length,0);assert.equal((await f.call('/api/courses/enrolled/mine',{cookie})).data.courses[0].slug,'free-demo');});
test('fixture authorization binds order status, confirmation, invoice and recovery key to the owner',async t=>{const f=await fixture(t),a=await f.login(),b=await f.login('other@example.invalid');const r=await f.call('/api/payments/checkout',{cookie:a,body:purchase,key}),id=r.data.order._id;await f.call('/__fixture/settle',{control:true,body:{id}});assert.equal((await f.call('/api/payments/orders/'+id,{cookie:b})).status,404);assert.equal((await f.call('/api/payments/orders/'+id+'/confirm',{cookie:b,body:{}})).status,404);assert.equal((await f.call('/api/payments/mine/invoices',{cookie:b})).data.items.length,0);assert.equal((await f.call('/api/payments/checkout-status',{cookie:b,key})).data.found,false);});
test('closed fixture order never settles even when approval is attempted',async t=>{const f=await fixture(t),cookie=await f.login();await f.config({createMode:'expired'});await f.call('/api/payments/checkout',{cookie,key,body:purchase});const state=await f.state(),id=state.orders[0]._id;await f.call('/__fixture/settle',{control:true,body:{id}});assert.equal((await f.state()).payments.length,0);assert.equal((await f.state()).orders[0].status,'expired');});
test('fixture ignores browser price and rejects a changed product/provider under the same key',async t=>{const f=await fixture(t),cookie=await f.login();const r=await f.call('/api/payments/checkout',{cookie,key,body:{...purchase,amountMinor:1}});assert.equal(r.data.order.amountMinor,14900);assert.equal((await f.call('/api/payments/checkout',{cookie,key,body:{...purchase,provider:'paypal'}})).status,409);assert.equal((await f.call('/api/payments/checkout',{cookie,key:'other-key-123456789012',body:{...purchase,product:'not-listed'}})).status,400);});

for(const provider of ['stripe','paypal'])for(const kind of ['course','section'])
test(`fixture release ${provider}/${kind}: stable replacement, stale callback denied, one final owned invoice`,async t=>{
 const f=await fixture(t),cookie=await f.login(),body={...purchase,provider,kind,product:kind==='course'?'paid-demo':'academy-section'};
 const first=await f.call('/api/payments/checkout',{cookie,key,body}),id=first.data.order._id;
 const foreign=await f.login('other@example.invalid');
 assert.equal((await f.call('/api/payments/checkout/release',{cookie:foreign,key,body:{}})).status,409);
 const release=await f.call('/api/payments/checkout/release',{cookie,key,body:{}});
 assert.equal(release.status,200);assert.equal(release.data.released,true);
 assert.equal(release.data.replacementKey,(await f.call('/api/payments/checkout/release',{cookie,key,body:{}})).data.replacementKey);
 assert.equal((await f.call('/api/payments/checkout-status',{cookie,key})).data.url,null);
 await f.call('/__fixture/approve',{control:true,body:{id}});
 await f.call('/api/payments/orders/'+id+'/confirm',{cookie,body:{}});
 assert.equal((await f.state()).payments.length,0);
 const second=await f.call('/api/payments/checkout',{cookie,key:release.data.replacementKey,body:{...body,provider:provider==='stripe'?'paypal':'stripe'}});
 assert.equal(second.status,200);await f.call('/__fixture/approve',{control:true,body:{id:second.data.order._id}});
 await f.call('/api/payments/orders/'+second.data.order._id+'/confirm',{cookie,body:{}});
 const state=await f.state();assert.equal(state.payments.length,1);assert.equal(state.invoices.length,1);assert.equal(state.orders.length,2);
});
test('fixture unknown creating checkout cannot issue a replacement; paid checkout routes to its receipt',async t=>{
 const f=await fixture(t),cookie=await f.login();await f.config({createMode:'creating'});
 await f.call('/api/payments/checkout',{cookie,key,body:purchase});
 const denied=await f.call('/api/payments/checkout/release',{cookie,key,body:{}});assert.equal(denied.status,409);assert.equal(denied.data.replacementKey,undefined);
 await f.config({createMode:'normal'});
 const created=await f.call('/api/payments/checkout',{cookie,key:'new-paid-key-1234567890',body:purchase});
 await f.call('/__fixture/settle',{control:true,body:{id:created.data.order._id}});
 const paid=await f.call('/api/payments/checkout/release',{cookie,key:'new-paid-key-1234567890',body:{}});
 assert.equal(paid.data.released,false);assert.equal(paid.data.order.status,'paid');assert.equal(paid.data.replacementKey,undefined);
});
test('retired membership cannot create a new catalog, quote or checkout in the fixture',async t=>{
 const f=await fixture(t),cookie=await f.login(),body={...purchase,kind:'membership',product:'Annual'};
 assert.equal((await f.call('/api/payments/catalog?kind=membership&product=Annual',{cookie})).status,410);
 for(const path of ['/api/payments/quote','/api/payments/checkout'])assert.equal((await f.call(path,{cookie,body,key})).status,410);
 const state=await f.state();assert.equal(state.orders.length,0);assert.equal(state.payments.length,0);assert.equal(state.terms.length,0);
});
test('historical membership order, paid entitlement and invoice remain owned and readable',async t=>{
 const f=await fixture(t),cookie=await f.login(),seed=await f.call('/__fixture/legacy-membership',{control:true,body:{}}),id=seed.data.order._id;
 assert.equal((await f.call('/api/payments/orders/'+id,{cookie})).data.order.kind,'membership');
 assert.equal((await f.call('/api/payments/membership-status',{cookie})).data.membershipActive,true);
 assert.equal((await f.call('/api/payments/mine/plans',{cookie})).data.items.length,1);
 await f.call('/api/payments/orders/'+id+'/confirm',{cookie,body:{}});const state=await f.state();assert.equal(state.invoices.length,1);assert.equal(state.payments.length,1);
 const foreign=await f.login('other@example.invalid');assert.equal((await f.call('/api/payments/orders/'+id,{cookie:foreign})).status,404);assert.equal((await f.call('/api/payments/mine/invoices',{cookie:foreign})).data.items.length,0);
});
test('an existing pending historical membership key resumes without creating a new order or grant',async t=>{
 const f=await fixture(t),cookie=await f.login(),seed=await f.call('/__fixture/legacy-membership',{control:true,body:{paid:false}}),legacy=seed.data;
 const found=await f.call('/api/payments/checkout-status',{cookie,key:legacy.key});assert.equal(found.data.order._id,legacy.order._id);assert.equal(found.data.order.status,'pending');
 const replay=await f.call('/api/payments/checkout',{cookie,key:legacy.key,body:{kind:'membership',product:legacy.order.product,provider:'stripe',optionKey:'annual'}});assert.equal(replay.status,200);assert.equal(replay.data.order._id,legacy.order._id);
 const state=await f.state();assert.equal(state.orders.length,1);assert.equal(state.payments.length,0);assert.equal(state.terms.length,0);
});
test('section settlement grants only its section courses and creates no global membership',async t=>{
 const f=await fixture(t),cookie=await f.login(),created=await f.call('/api/payments/checkout',{cookie,key,body:{...purchase,kind:'section',product:'academy-section'}});
 await f.call('/__fixture/settle',{control:true,body:{id:created.data.order._id}});
 const courses=(await f.call('/api/courses/enrolled/mine',{cookie})).data.courses;assert.deepEqual(courses.map(course=>course.slug),['section-course-demo']);assert.equal(courses[0].sectionAccess,true);
 assert.equal((await f.call('/api/payments/membership-status',{cookie})).data.membershipActive,false);const state=await f.state();assert.equal(state.sectionTerms.length,1);assert.equal(state.terms.length,0);assert.equal(state.invoices[0].totalMinor,29900);
});
test('renewal fixture requires ownership and fresh consent, preserving the paid period on disable/resume',async t=>{
 const f=await fixture(t),cookie=await f.login();await f.config({agreementState:'active'});
 const first=(await f.call('/api/payments/mine/agreements',{cookie})).data.items[0],path='/api/payments/mine/agreements/'+first._id;
 const disabled=await f.call(path+'/cancel',{cookie,body:{}});assert.equal(disabled.data.item.autoRenew,false);assert.equal(disabled.data.item.canEnableRenewal,true);assert.equal(disabled.data.item.currentPeriodEnd,first.currentPeriodEnd);
 assert.equal((await f.call(path+'/resume',{cookie,body:{}})).status,409);
 const foreign=await f.login('other@example.invalid');assert.equal((await f.call(path+'/resume',{cookie:foreign,body:{termsAccepted:true,consentFingerprint:first.renewalConsentFingerprint}})).status,404);
 const body={termsAccepted:true,consentFingerprint:disabled.data.item.renewalConsentFingerprint};for(let i=0;i<2;i++){const resumed=await f.call(path+'/resume',{cookie,body});assert.equal(resumed.status,200);assert.equal(resumed.data.item.autoRenew,true);assert.equal(resumed.data.item.currentPeriodEnd,first.currentPeriodEnd);}
 const state=await f.state();assert.equal(state.orders.length,0);assert.equal(state.payments.length,0);
 await f.config({agreementState:'ended'});assert.equal((await f.call(path+'/resume',{cookie,body})).status,409);
});


for(const kind of ['course','section'])test('fixture access metadata and course entry share owned '+kind+' coverage and expiry without writes',async t=>{
 const f=await fixture(t),cookie=await f.login(),foreign=await f.login('other@example.invalid');
 const empty=(await f.call('/api/payments/membership-status',{cookie})).data;assert.deepEqual(empty.courseAccesses,[]);assert.deepEqual(empty.sectionAccesses,[]);assert.equal(empty.membershipActive,false);assert.ok(Number.isFinite(Date.parse(empty.serverNow)));
 const created=await f.call('/api/payments/checkout',{cookie,key:'read-access-'+kind+'-123456789',body:{...purchase,kind,product:kind==='course'?'paid-demo':'academy-section'}});assert.equal(created.status,200);const id=created.data.order._id;await f.call('/__fixture/settle',{control:true,body:{id}});
 const before=await f.state(),snapshot=(await f.call('/api/payments/membership-status',{cookie})).data;
 assert.equal(snapshot.courseAccesses.length,kind==='course'?1:0);assert.equal(snapshot.sectionAccesses.length,kind==='section'?1:0);assert.equal(snapshot.membershipActive,false);
 const slug=kind==='course'?'paid-demo':'section-course-demo';assert.equal((await f.call('/api/payments/access/'+slug,{cookie})).data.hasAccess,true);assert.equal((await f.call('/api/payments/access/'+(kind==='course'?'section-course-demo':'paid-demo'),{cookie})).data.hasAccess,false);
 assert.equal((await f.call('/api/payments/access/'+slug,{cookie:foreign})).data.hasAccess,false);const foreignSnapshot=(await f.call('/api/payments/membership-status',{cookie:foreign})).data;assert.deepEqual(foreignSnapshot.courseAccesses,[]);assert.deepEqual(foreignSnapshot.sectionAccesses,[]);
 const after=await f.state();for(const field of ['orders','invoices','payments','terms','sectionTerms','agreements','notices'])assert.deepEqual(after[field],before[field]);
 await f.call('/__fixture/expire-paid-access',{control:true,body:{id}});const expired=(await f.call('/api/payments/membership-status',{cookie})).data;assert.deepEqual(expired.courseAccesses,[]);assert.deepEqual(expired.sectionAccesses,[]);assert.equal((await f.call('/api/payments/access/'+slug,{cookie})).data.hasAccess,false);assert.equal((await f.state()).orders[0].status,'paid');
});
test('fixture historical membership and free-course entry remain supported without fabricating purchases',async t=>{
 const f=await fixture(t),cookie=await f.login();assert.equal((await f.call('/api/payments/access/free-demo',{cookie})).data.hasAccess,true);assert.equal((await f.state()).payments.length,0);
 await f.call('/__fixture/legacy-membership',{control:true,body:{}});const before=await f.state();for(const slug of ['paid-demo','section-course-demo'])assert.equal((await f.call('/api/payments/access/'+slug,{cookie})).data.hasAccess,true);
 const snapshot=(await f.call('/api/payments/membership-status',{cookie})).data;assert.equal(snapshot.membershipActive,true);assert.deepEqual(snapshot.courseAccesses,[]);assert.deepEqual(snapshot.sectionAccesses,[]);
 const after=await f.state();for(const field of ['orders','invoices','payments','terms','sectionTerms','agreements','notices'])assert.deepEqual(after[field],before[field]);
 assert.equal((await f.call('/api/payments/catalog?kind=course&product=section-course-demo',{cookie})).data.purchase.sectionSlug,'academy-section');
});
