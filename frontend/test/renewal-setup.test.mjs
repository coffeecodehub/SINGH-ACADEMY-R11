/** Browser retry identity only. A saved setup attempt never proves payment or access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule} from './compile.mjs';

const safety=compileModule('../lib/checkoutSafety.ts');
const owner='a'.repeat(24),orderId='b'.repeat(24);
const normal={owner,kind:'course',product:'paid-course',optionKey:'annual',renewalOf:'',provider:'stripe',key:'ordinary-checkout-0001',autoRenew:true};
const setup={...normal,key:'renewal-setup-key-0001',renewalSetup:true};
const scope=attempt=>safety.checkoutScope(attempt.owner,attempt.kind,attempt.product,attempt.renewalOf,attempt.renewalSetup);
const plain=value=>JSON.parse(JSON.stringify(value));
function storage(){
 const values=new Map();
 return {get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}

test('ordinary checkout keeps its exact pre-setup storage scope and legacy identity',()=>{
 const original='sa-checkout-active:'+JSON.stringify([owner,'course','paid-course','']);
 assert.equal(safety.checkoutScope(owner,'course','paid-course'),original);
 assert.equal(scope(normal),original);assert.equal(scope({...normal,renewalSetup:false}),original);
 assert.equal(safety.checkoutLegacyKey(normal),safety.checkoutLegacyKey({...normal,renewalSetup:false}));
 assert.notEqual(scope(setup),original);assert.notEqual(safety.checkoutLegacyKey(setup),safety.checkoutLegacyKey(normal));
});

for(const provider of ['stripe','paypal'])for(const kind of ['course','section'])test(provider+' '+kind+' deferred setup round-trips only the accepted retry identity',()=>{
 const saved=storage(),attempt={...setup,kind,provider,orderId,releaseRequested:true,couponCode:''};
 assert.equal(safety.saveCheckoutAttempt(saved,attempt),true);
 assert.deepEqual(plain(safety.readCheckoutAttempt(saved,scope(attempt))),attempt);
});

test('ordinary and deferred attempts for the same owner and product coexist without reusing keys',()=>{
 const saved=storage();safety.saveCheckoutAttempt(saved,normal);safety.saveCheckoutAttempt(saved,setup);
 assert.equal(saved.length,2);
 assert.equal(safety.readCheckoutAttempt(saved,scope(normal)).key,normal.key);
 assert.equal(safety.readCheckoutAttempt(saved,scope(setup)).key,setup.key);
});

test('copying an ordinary record into a setup scope or vice versa cannot restore it',()=>{
 const saved=storage();saved.setItem(scope(normal),JSON.stringify(setup));saved.setItem(scope(setup),JSON.stringify(normal));
 assert.equal(safety.readCheckoutAttempt(saved,scope(normal)),null);
 assert.equal(safety.readCheckoutAttempt(saved,scope(setup)),null);
});

for(const renewalSetup of [null,'true','false',1,0,{},[]])test('non-boolean deferred flag is rejected: '+JSON.stringify(renewalSetup),()=>{
 const saved=storage(),raw=JSON.stringify({...setup,renewalSetup});
 for(const key of [scope(normal),scope(setup)]){saved.setItem(key,raw);assert.equal(safety.readCheckoutAttempt(saved,key),null);}
});

for(const patch of [{autoRenew:false},{autoRenew:undefined},{provider:'bank'},{kind:'membership'},{couponCode:'DISCOUNT25'}])test('invalid deferred setup combination cannot be restored: '+JSON.stringify(patch),()=>{
 const saved=storage(),attempt={...setup,...patch};saved.setItem(scope(attempt),JSON.stringify(attempt));
 assert.equal(safety.readCheckoutAttempt(saved,scope(attempt)),null);
});

test('setup identity remains bound to owner, product, purchase type and renewal reference',()=>{
 const saved=storage();safety.saveCheckoutAttempt(saved,setup);
 for(const patch of [{owner:'c'.repeat(24)},{product:'another-course'},{kind:'section'},{renewalOf:'d'.repeat(24)}]){
  const foreignScope=scope({...setup,...patch});saved.setItem(foreignScope,JSON.stringify(setup));
  assert.equal(safety.readCheckoutAttempt(saved,foreignScope),null);
 }
 assert.equal(safety.readCheckoutAttempt(saved,scope(setup)).key,setup.key);
});

test('false or omitted setup flag restores legacy ordinary attempts without changing their keys',()=>{
 for(const attempt of [normal,{...normal,renewalSetup:false}]){
  const saved=storage();safety.saveCheckoutAttempt(saved,attempt);const restored=safety.readCheckoutAttempt(saved,scope(normal));
  assert.deepEqual(plain(restored),normal);assert.equal(restored.renewalSetup,undefined);
 }
});

test('untrusted saved setup data cannot become payment, credential or access evidence',()=>{
 const saved=storage();saved.setItem(scope(setup),JSON.stringify({...setup,paid:true,hasAccess:true,amountMinor:0,password:'synthetic-untrusted',country:'PK',billingStartsAt:'2099-01-01'}));
 assert.deepEqual(plain(safety.readCheckoutAttempt(saved,scope(setup))),setup);
});

test('forgetting deferred setup removes its own current and legacy records but preserves ordinary checkout',()=>{
 const saved=storage();for(const attempt of [normal,setup]){safety.saveCheckoutAttempt(saved,attempt);saved.setItem('sa-checkout:'+safety.checkoutLegacyKey(attempt),attempt.key);}
 safety.forgetCheckoutAttempt(saved,setup);
 assert.equal(saved.getItem(scope(setup)),null);assert.equal(saved.getItem('sa-checkout:'+safety.checkoutLegacyKey(setup)),null);
 assert.equal(safety.readCheckoutAttempt(saved,scope(normal)).key,normal.key);
 assert.equal(saved.getItem('sa-checkout:'+safety.checkoutLegacyKey(normal)),normal.key);
});

test('forgetting ordinary checkout preserves a deferred setup for the same product',()=>{
 const saved=storage();safety.saveCheckoutAttempt(saved,normal);safety.saveCheckoutAttempt(saved,setup);safety.forgetCheckoutAttempt(saved,normal);
 assert.equal(saved.getItem(scope(normal)),null);assert.equal(safety.readCheckoutAttempt(saved,scope(setup)).key,setup.key);
});

test('confirmed terminal cleanup removes only matching owned setup/order identities',()=>{
 const saved=storage(),done={...setup,orderId},ordinary={...normal,orderId:'c'.repeat(24)},anotherOwner={...setup,owner:'d'.repeat(24),orderId};
 for(const attempt of [done,ordinary,anotherOwner])safety.saveCheckoutAttempt(saved,attempt);
 safety.clearSettledCheckout(saved,owner,orderId);
 assert.equal(saved.getItem(scope(done)),null);assert.ok(safety.readCheckoutAttempt(saved,scope(ordinary)));assert.ok(safety.readCheckoutAttempt(saved,scope(anotherOwner)));
});

test('blocked storage never fabricates or throws away confirmed setup state',()=>{
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 assert.equal(safety.saveCheckoutAttempt(blocked,setup),false);assert.equal(safety.readCheckoutAttempt(blocked,scope(setup)),null);
 assert.doesNotThrow(()=>safety.forgetCheckoutAttempt(blocked,setup));
});

const confirmed={_id:orderId,status:'renewal_ready',renewalSetup:true,provider:'stripe',amountDueNowMinor:0,amountMinor:4900,billingStartsAt:'2030-07-01T00:00:00.000Z'};
test('a complete server-confirmed setup is recognized separately from paid access',()=>{
 for(const provider of ['stripe','paypal'])assert.equal(safety.confirmedRenewalSetup({...confirmed,provider}),true);
 assert.equal(confirmed.status,'renewal_ready');assert.equal(confirmed.paidAt,undefined);
 assert.equal(safety.confirmedRenewalSetup({...confirmed,status:'paid'}),false);
});
for(const value of [null,undefined,{},false,'renewal_ready'])test('incomplete setup confirmation is not accepted: '+String(value),()=>{
 assert.equal(safety.confirmedRenewalSetup(value),false);
});
for(const patch of [
 {status:'pending'},{status:'creating'},{status:'paid'},{status:'cancelled'},
 {renewalSetup:false},{renewalSetup:undefined},{renewalSetup:'true'},
 {provider:'bank'},{provider:'discount'},{provider:undefined},
 {_id:undefined},{_id:''},{_id:'b'.repeat(23)},{_id:'g'.repeat(24)},
 {amountDueNowMinor:undefined},{amountDueNowMinor:'0'},{amountDueNowMinor:1},
 {amountMinor:0},{amountMinor:-1},{amountMinor:0.5},{amountMinor:'4900'},{amountMinor:Number.MAX_SAFE_INTEGER+1},
 {billingStartsAt:undefined},{billingStartsAt:null},{billingStartsAt:''},{billingStartsAt:'not-a-date'},{billingStartsAt:new Date('2030-07-01')}
])test('setup success rejects '+Object.entries(patch).map(([field,value])=>field+'='+String(value)).join(', '),()=>{
 assert.equal(safety.confirmedRenewalSetup({...confirmed,...patch}),false);
});
