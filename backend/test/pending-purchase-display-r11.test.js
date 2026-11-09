/** Read-only billing presentation: only a later verified purchase clears a closed attempt. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './testLoader.js';

const owner='owner',oldAt=new Date('2026-01-01'),createdAt=new Date('2026-01-02'),paidAt=new Date('2026-01-03');
const methods=deps=>load('../src/services/pendingBillingCheckout.js',deps,'({supersededPendingCheckoutIds,ownedAgreementViews,agreementCheckoutView})');
const {supersededPendingCheckoutIds}=methods({});
function fixture({kind='section',provider='stripe',recurring=false}={}){
 const field=kind==='course'?'courseSlug':'sectionSlug';
 const agreement={_id:'old-agreement',user:owner,checkoutOrder:'old-order',provider:'stripe',environment:'test',kind,product:'selected-product',status:'creating',autoRenew:false};
 const old={_id:'old-order',user:owner,billingAgreement:agreement._id,provider:'stripe',environment:'test',kind,product:agreement.product,status:'expired',providerOrderId:'cs_closed',createdAt:oldAt};
 const order={_id:'new-order',user:owner,provider,environment:'test',kind,product:agreement.product,status:'paid',amountMinor:2500,currency:'USD',invoice:'new-invoice',payment:'new-payment',createdAt,paidAt,...(recurring?{billingAgreement:'new-agreement'}:{})};
 const invoice={_id:order.invoice,user:owner,kind,[field]:order.product,testMode:true,status:'paid',paidAt,fulfillmentAt:paidAt,totalMinor:2500,paidMinor:2500,currency:'USD',origin:recurring?'recurring':'online_checkout',...(recurring?{billingAgreement:order.billingAgreement}:{})};
 const payment={_id:order.payment,user:owner,checkoutOrder:order._id,invoice:invoice._id,kind,[field]:order.product,provider,testMode:true,status:'paid',amountMinor:2500,currency:'USD',paidAt,verifiedAt:paidAt,verificationSource:'provider_webhook',providerPaymentId:'verified-collection',...(recurring?{billingAgreement:order.billingAgreement}:{})};
 return {agreement,old,order,invoice,payment};
}
function hidden(f){return supersededPendingCheckoutIds(owner,[f.agreement],[f.old],f.order?[f.order]:[],f.invoice?[f.invoice]:[],f.payment?[f.payment]:[]);}
for(const kind of ['course','section'])for(const provider of ['stripe','paypal'])for(const recurring of [false,true])test(`${kind} ${provider} ${recurring?'recurring':'one-time'} verified success hides the old closed pending card`,()=>{
 const f=fixture({kind,provider,recurring}),before=JSON.stringify(f);assert.deepEqual([...hidden(f)],['old-agreement']);assert.equal(JSON.stringify(f),before);
});
for(const status of ['creating','pending','failed','cancelled','expired','renewal_ready'])test('new '+status+' attempt never clears the earlier pending card',()=>{
 const f=fixture();f.order.status=status;assert.equal(hidden(f).size,0);
});
test('absence of a new paid purchase retains the pending card',()=>{const f=fixture();f.order=null;f.invoice=null;f.payment=null;assert.equal(hidden(f).size,0);});
for(const [which,change] of [
 ['old',{status:'creating'}],['old',{status:'pending'}],['old',{renewalSetup:true}],['agreement',{renewalSetup:true}],['order',{renewalSetup:true}],
 ['agreement',{activeKey:'still-chargeable'}],['agreement',{autoRenew:true}],['agreement',{status:'active'}],['agreement',{renewalOperation:{action:'end'}}],
 ['agreement',{accessCancellationRequestedAt:paidAt}],['agreement',{accessCancelledAt:paidAt}],['old',{recoveryRequired:true}],['old',{invoice:'unexpected-invoice'}],['old',{payment:'unexpected-payment'}],['old',{paidAt}],
 ['old',{providerOrderId:null,creationProtocolVersion:1,creationAttemptedAt:oldAt}]
])test('open, managed, renewal or uncertain old state stays visible '+which+' '+JSON.stringify(change),()=>{const f=fixture();Object.assign(f[which],change);assert.equal(hidden(f).size,0);});
test('a never-sent creation with its provider-safe local closure can be superseded',()=>{const f=fixture();Object.assign(f.old,{providerOrderId:null,creationProtocolVersion:1,status:'cancelled'});assert.equal(hidden(f).size,1);});
for(const creationClaimUntil of [new Date('2099-01-01'),'invalid'])test('a missing provider identity with an active or invalid creation lease remains visible '+creationClaimUntil,()=>{const f=fixture();Object.assign(f.old,{providerOrderId:null,creationProtocolVersion:1,creationClaimUntil});assert.equal(hidden(f).size,0);});
for(const [which,change] of [
 ['agreement',{user:'other-owner'}],['old',{user:'other-owner'}],['order',{user:'other-owner'}],['invoice',{user:'other-owner'}],['payment',{user:'other-owner'}],
 ['order',{kind:'course'}],['order',{product:'another-product'}],['order',{environment:'live'}],['invoice',{sectionSlug:'another-product'}],['payment',{sectionSlug:'another-product'}],
 ['invoice',{testMode:false}],['payment',{testMode:false}],['invoice',{status:'open'}],['payment',{status:'pending'}],['invoice',{totalMinor:5000}],['invoice',{paidMinor:0}],['payment',{amountMinor:1}],
 ['invoice',{currency:'EUR'}],['payment',{currency:'EUR'}],['payment',{provider:'paypal'}],['payment',{verificationSource:'admin_recorded'}],['payment',{providerPaymentId:''}],
 ['invoice',{_id:'wrong-invoice'}],['payment',{_id:'wrong-payment'}],['payment',{checkoutOrder:'wrong-order'}],['payment',{invoice:'wrong-invoice'}],['invoice',{origin:'manual'}],['invoice',{billingAgreement:'unexpected-agreement'}],['payment',{billingAgreement:'unexpected-agreement'}],['payment',{providerPaymentId:'   '}]
])test('mismatched or unverified purchase evidence retains the card '+which+' '+JSON.stringify(change),()=>{const f=fixture();Object.assign(f[which],change);assert.equal(hidden(f).size,0);});
for(const [which,change] of [
 ['old',{createdAt:null}],['old',{createdAt:'invalid'}],['order',{createdAt:null}],['order',{createdAt:oldAt}],['order',{createdAt:new Date('2025-12-31')}],
 ['order',{paidAt:null}],['order',{paidAt:new Date('2026-01-01T12:00:00Z')}],['invoice',{paidAt:null}],['invoice',{fulfillmentAt:null}],['invoice',{fulfillmentAt:oldAt}],['payment',{paidAt:null}],['payment',{verifiedAt:null}],['payment',{verifiedAt:oldAt}]
])test('missing, earlier or contradictory dates retain the card '+which+' '+JSON.stringify(change),()=>{const f=fixture();Object.assign(f[which],change);assert.equal(hidden(f).size,0);});
test('later collection on an older-created attempt does not clear a subsequent pending attempt',()=>{const f=fixture();f.order.createdAt=new Date('2025-12-30');assert.equal(hidden(f).size,0);});
test('provider second-precision payment time does not override verified server-side purchase chronology',()=>{
 const f=fixture(),second=new Date('2026-01-03T00:00:00Z');f.old.createdAt=new Date(+second+100);f.order.createdAt=new Date(+second+800);f.order.paidAt=f.invoice.paidAt=f.payment.paidAt=second;f.invoice.fulfillmentAt=f.payment.verifiedAt=new Date(+second+900);
 assert.equal(hidden(f).size,1);
});
test('missing invoice or payment never counts as verified provider success',()=>{for(const which of ['invoice','payment']){const f=fixture();f[which]=null;assert.equal(hidden(f).size,0);}});
test('recurring invoice and collection must belong to the new agreement',()=>{for(const which of ['invoice','payment']){const f=fixture({recurring:true});f[which].billingAgreement='another-agreement';assert.equal(hidden(f).size,0);}});
test('a later cancellation or access revocation does not resurrect obsolete financial attempts',()=>{const f=fixture();Object.assign(f.invoice,{accessCancelledAt:paidAt,accessRevokedAt:paidAt,grantSuppressed:true});assert.equal(hidden(f).size,1);});
function discount(){const f=fixture();f.agreement.environment=f.old.environment=f.order.environment='live';Object.assign(f.order,{provider:'discount',amountMinor:0,discountFull:true,couponId:'coupon',subtotalMinor:2500,discountMinor:2500});delete f.order.payment;Object.assign(f.invoice,{testMode:false,totalMinor:0,paidMinor:0,creditedMinor:0,origin:'coupon',grantVersion:1,discountFull:true,coupon:'coupon',subtotalMinor:2500,discountMinor:2500});f.payment=null;return f;}
test('an actual fulfilled full-discount purchase can clear the earlier pending card without inventing a collection',()=>{assert.equal(hidden(discount()).size,1);});
for(const [which,change]of [['order',{couponId:null}],['order',{discountFull:false}],['order',{subtotalMinor:0}],['invoice',{coupon:'wrong'}],['invoice',{origin:'online_checkout'}],['invoice',{grantVersion:0}],['invoice',{discountMinor:2000}]])test('invalid zero-charge evidence retains the card '+JSON.stringify(change),()=>{const f=discount();Object.assign(f[which],change);assert.equal(hidden(f).size,0);});
test('the paid order itself and unrelated active billing controls are never hidden',()=>{
 const f=fixture(),active={...f.agreement,_id:'active-agreement',checkoutOrder:f.order._id,status:'active',autoRenew:true,activeKey:'active'},order={...f.order,billingAgreement:active._id,provider:active.provider};
 assert.deepEqual([...supersededPendingCheckoutIds(owner,[f.agreement,active],[f.old,order],[f.order],[f.invoice],[f.payment])],['old-agreement']);
});
test('owned agreement reads use bounded product-scoped batched evidence and perform no writes',async()=>{
 const f=fixture(),other={...f.agreement,_id:'other-agreement',checkoutOrder:'other-order',product:'unrelated-product',status:'active',autoRenew:true,activeKey:'retained'},otherOrder={...f.old,_id:other.checkoutOrder,billingAgreement:other._id,product:other.product,status:'paid'},queries={agreements:[],orders:[],invoices:[],payments:[]};
 function model(name,results){let n=0;return new Proxy({find(filter){const row={filter};queries[name].push(row);const rows=results[Math.min(n++,results.length-1)],query={sort(value){row.sort=value;return query;},select(value){row.select=value;return query;},limit(value){row.limit=value;return query;},lean:async()=>rows};return query;}},{get(target,key){if(key in target)return target[key];throw Error('Unexpected database write or operation: '+String(key));}});}
 const service=methods({BillingAgreement:model('agreements',[[f.agreement,other],[]]),CheckoutOrder:model('orders',[[f.old,otherOrder],[f.order]]),Invoice:model('invoices',[[f.invoice]]),Payment:model('payments',[[f.payment]]),publicAgreement:a=>({_id:String(a._id),kind:a.kind,product:a.product,status:a.status}),loadAgreementPaidAccess:async()=>new Map()});
 const before=JSON.stringify(f),items=await service.ownedAgreementViews(owner);assert.deepEqual(items.map(item=>item._id),[other._id]);assert.equal(JSON.stringify(f),before);
 assert.equal(queries.agreements.length,2);assert.equal(queries.orders.length,2);assert.equal(queries.invoices.length,1);assert.equal(queries.payments.length,1);
 const paidQuery=queries.orders[1];assert.equal(paidQuery.limit,1000);assert.equal(paidQuery.filter.user,owner);assert.equal(paidQuery.filter.status,'paid');assert.deepEqual(paidQuery.filter.$or,[{kind:'section',product:f.old.product,environment:'test'}]);assert.deepEqual(paidQuery.filter.renewalSetup,{$ne:true});assert.equal(+paidQuery.filter.createdAt.$gt,+oldAt);assert.deepEqual(paidQuery.filter.paidAt,{$exists:true});
 assert.equal(queries.invoices[0].filter.user,owner);assert.deepEqual(queries.invoices[0].filter._id.$in,[f.invoice._id]);assert.equal(queries.payments[0].filter.user,owner);assert.deepEqual(queries.payments[0].filter._id.$in,[f.payment._id]);
});
test('ordinary pending checkout without a verified replacement stays in billing and needs no evidence queries',async()=>{
 const f=fixture();f.old.status='pending';f.agreement.autoRenew=true;f.agreement.activeKey='original';let reads=0;
 const query=rows=>({sort(){return this;},limit(){return this;},lean:async()=>rows});
 const service=methods({BillingAgreement:{find:()=>query(reads++===0?[f.agreement]:[])},CheckoutOrder:{find:()=>query([f.old])},publicAgreement:a=>({_id:a._id,status:a.status}),loadAgreementPaidAccess:async()=>new Map()});
 const items=await service.ownedAgreementViews(owner);assert.equal(items.length,1);assert.equal(items[0].pendingCheckout,true);assert.equal(items[0].canContinueCheckout,true);
});
test('provider-closed preserved pending cards are not labelled as an unconfirmed cancellation',()=>{
 const f=fixture(),{agreementCheckoutView}=methods({publicAgreement:a=>({_id:a._id,status:a.status})});f.old.cancelRequestedAt=oldAt;
 const closed=agreementCheckoutView(f.agreement,f.old);assert.equal(closed.pendingCheckout,true);assert.equal(closed.checkoutCancellationPending,false);assert.equal(closed.canContinueCheckout,false);assert.equal(closed.canCancelPendingCheckout,true);
 f.old.status='pending';const waiting=agreementCheckoutView(f.agreement,f.old);assert.equal(waiting.pendingCheckout,true);assert.equal(waiting.checkoutCancellationPending,true);assert.equal(waiting.canContinueCheckout,false);assert.equal(waiting.canCancelPendingCheckout,true);
});
