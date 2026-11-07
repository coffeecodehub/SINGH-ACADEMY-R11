import test from 'node:test';
import assert from 'node:assert/strict';
import {paidAccessDisplay,invoicePaidAccess,agreementPaidAccess,legacyPaidAccess} from '../src/utils/paidAccessDisplay.js';
import {load,query} from './testLoader.js';
const now=new Date('2026-10-04T12:00:00Z'),start='2026-10-03T20:30:00Z',end='2027-10-03T20:30:00Z';
const invoice=(extra={})=>({_id:'invoice-a',user:'owner',kind:'course',courseSlug:'course-a',billingAgreement:'agreement-a',status:'paid',totalMinor:1000,paidMinor:1000,creditedMinor:0,fulfillmentAt:start,paidAt:start,grantVersion:1,grantStartsAt:start,grantExpiresAt:end,accessStartsAt:start,accessExpiresAt:end,testMode:false,...extra});
const agreement=(extra={})=>({_id:'agreement-a',user:'owner',checkoutOrder:'order-a',provider:'stripe',environment:'live',kind:'course',product:'course-a',status:'active',currentPeriodEnd:'2035-01-01',...extra});
const order=(extra={})=>({_id:'order-a',user:'owner',billingAgreement:'agreement-a',provider:'stripe',environment:'live',kind:'course',product:'course-a',status:'paid',invoice:'invoice-a',...extra});
const view=(a=agreement(),o=order(),rows=[invoice()],at=now)=>agreementPaidAccess('owner',a,o,rows,{now:at});

for(const status of ['active','paused','past_due','unpaid','cancelled','trialing'])test('confirmed invoice dates survive provider status '+status+' and renewal off',()=>{
 const out=view(agreement({status,autoRenew:false,cancelAtPeriodEnd:true}));
 assert.equal(out.status,'active');assert.equal(out.endsAt,new Date(end).toISOString());assert.equal(out.remainingDays,364);assert.equal(out.durationDays,365);
});
test('provider trial/deferred first billing without a paid source never invents expiry',()=>{
 const out=view(agreement({status:'trialing',renewalSetup:true,billingStartsAt:'2035-01-01'}),order({status:'renewal_ready',renewalSetup:true}),[]);
 assert.equal(out.confirmed,false);assert.equal(out.status,'unknown');assert.equal(out.endsAt,null);assert.equal(out.remainingDays,null);
});
test('deferred renewal displays only the linked original fulfilled purchase before the first charge',()=>{
 const out=view(agreement({status:'trialing',renewalSetup:true,sourceInvoiceId:'original'}),order({status:'renewal_ready',renewalSetup:true}),[invoice({_id:'original',billingAgreement:undefined,grantExpiresAt:'2026-11-01',accessExpiresAt:'2026-11-01'})]);
 assert.equal(out.confirmed,true);assert.equal(out.endsAt,'2026-11-01T00:00:00.000Z');assert.notEqual(out.endsAt,'2035-01-01T00:00:00.000Z');
});
for(const status of ['creating','pending'])test('unconfirmed '+status+' checkout has no paid countdown',()=>{
 const out=view(agreement(),order({status}));assert.equal(out.status,'pending');assert.equal(out.remainingDays,null);assert.equal(out.endsAt,null);
});
for(const patch of [{user:'other'},{courseSlug:'other-course'},{testMode:true},{status:'open'},{paidMinor:999},{fulfillmentAt:null},{grantExpiresAt:null}])test('unowned/unconfirmed/incomplete invoice cannot supply display dates '+JSON.stringify(patch),()=>{
 const out=view(agreement(),order(),[invoice(patch)]);assert.equal(out.confirmed,false);assert.equal(out.endsAt,null);assert.equal(out.remainingDays,null);
});
for(const patch of [{user:'other'},{provider:'paypal'},{environment:'test'},{product:'other-course'},{billingAgreement:'other-agreement'}])test('mismatched checkout links do not expose another paid interval '+JSON.stringify(patch),()=>assert.equal(view(agreement(),order(patch)).confirmed,false));
test('same-owner unrelated product purchase cannot be substituted for deferred source',()=>{
 const out=view(agreement({renewalSetup:true,sourceInvoiceId:'original'}),order({renewalSetup:true,status:'renewal_ready'}),[invoice({_id:'original',billingAgreement:null,courseSlug:'unrelated'})]);assert.equal(out.confirmed,false);
});
test('confirmed immediate cancellation displays zero without restoring its suppressed invoice grant',()=>{
 const out=view(agreement({accessCancelledAt:'2026-10-04T10:00Z'}),order(),[invoice({accessCancelledAt:'2026-10-04T10:00Z',accessRevokedAt:'2026-10-04T10:00Z',grantSuppressed:true})]);
 assert.equal(out.status,'cancelled');assert.equal(out.remainingDays,0);assert.equal(out.cancelledAt,'2026-10-04T10:00:00.000Z');assert.equal(out.endsAt,new Date(end).toISOString());
});
test('explicit lifetime is distinct from missing finite historical expiry',()=>{
 const lifetime=invoicePaidAccess(invoice({grantNoExpiry:true,grantExpiresAt:null,accessExpiresAt:null}),{owner:'owner',now});
 assert.equal(lifetime.status,'lifetime');assert.equal(lifetime.noExpiry,true);assert.equal(lifetime.remainingDays,null);
 const unknown=invoicePaidAccess(invoice({grantExpiresAt:null,accessExpiresAt:null}),{owner:'owner',now});assert.equal(unknown.status,'unknown');assert.equal(unknown.noExpiry,false);
});
test('the circle uses UTC calendar days without ending exact paid access at midnight',()=>{
 const grant={startsAt:start,endsAt:end};
 const before=paidAccessDisplay(grant,{now:new Date('2026-10-03T23:59:59Z')}),after=paidAccessDisplay(grant,{now:new Date('2026-10-04T00:00:00Z')});assert.equal(before.remainingDays,365);assert.equal(after.remainingDays,364);
 const finalDay=paidAccessDisplay(grant,{now:new Date('2027-10-03T00:00:00Z')});assert.equal(finalDay.status,'active');assert.equal(finalDay.remainingDays,0);
 assert.equal(paidAccessDisplay(grant,{now:new Date(end)}).status,'expired');
});
test('paid future term and leap-year duration use actual confirmed endpoints',()=>{
 const grant={startsAt:'2027-10-03T20:30Z',endsAt:'2028-10-03T20:30Z'},out=paidAccessDisplay(grant,{now});assert.equal(out.status,'scheduled');assert.equal(out.durationDays,366);assert.equal(out.remainingDays,366);
});
test('only already-paid contiguous renewal periods extend the displayed end; an unpaid gap is not bridged',()=>{
 const first=invoice({grantExpiresAt:'2026-11-01',accessExpiresAt:'2026-11-01'}),next=invoice({_id:'invoice-b',grantStartsAt:'2026-11-01',grantExpiresAt:'2026-12-01',accessStartsAt:'2026-11-01',accessExpiresAt:'2026-12-01'});
 assert.equal(view(agreement(),order(),[first,next]).endsAt,'2026-12-01T00:00:00.000Z');
 assert.equal(view(agreement(),order(),[first,{...next,grantStartsAt:'2026-11-02',accessStartsAt:'2026-11-02'}]).endsAt,'2026-11-01T00:00:00.000Z');
});
test('legacy plan evidence is owner/product/environment checked and never mutates the record',()=>{
 const term={plan:'Annual',status:'active',testMode:false,invoice:invoice({kind:'membership',planName:'Annual'})},before=structuredClone(term);
 assert.equal(legacyPaidAccess(term,'owner',{now}).remainingDays,364);assert.equal(legacyPaidAccess(term,'other',{now}).confirmed,false);assert.deepEqual(term,before);
});
test('agreement enrichment uses one owner-scoped read and has no mutation dependency',async()=>{
 const calls=[],read=load('../src/services/billingAccessDisplay.js',{Invoice:{find(filter){calls.push(filter);return query([invoice(),invoice({_id:'foreign',user:'other'})]);}},agreementPaidAccess},'loadAgreementPaidAccess');
 const snapshots=await read('owner',[agreement()],[order()],{now});assert.equal(calls.length,1);assert.equal(calls[0].user,'owner');assert.deepEqual(calls[0].$or[0],{billingAgreement:{$in:['agreement-a']}});assert.equal(snapshots.get('agreement-a').remainingDays,364);
});
