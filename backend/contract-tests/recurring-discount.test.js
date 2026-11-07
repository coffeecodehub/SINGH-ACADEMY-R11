/** Actual model validation; no provider account or database. */
import test from 'node:test';import assert from 'node:assert/strict';import mongoose from 'mongoose';
import CheckoutOrder from '../src/models/CheckoutOrder.js';import Invoice from '../src/models/Invoice.js';import BillingAgreement from '../src/models/BillingAgreement.js';
const user=new mongoose.Types.ObjectId(),coupon=new mongoose.Types.ObjectId();
const baseOrder=()=>({user,provider:'stripe',environment:'test',kind:'section',product:'section',title:'Section',amountMinor:0,currency:'USD',expiresAt:new Date(),requestKey:'model-contract',requestFingerprint:'model-contract'});
test('zero charged orders fail model validation; reviewed coupon evidence has a separate provider identity',async()=>{
 assert.ok((await new CheckoutOrder(baseOrder()).validate().catch(e=>e)).errors?.amountMinor);
 const discounted=new CheckoutOrder({...baseOrder(),provider:'discount',discountFull:true,couponId:coupon,subtotalMinor:500,discountMinor:500});await discounted.validate();
});
test('zero invoices require complete full-discount evidence rather than weakening ordinary invoice validation',async()=>{
 const base={user,createdBy:user,kind:'section',sectionSlug:'section',title:'Section',number:'SA-DISCOUNT-CONTRACT',accessStartsAt:new Date(),dueAt:new Date(),totalMinor:0,paidMinor:0,currency:'USD',requestKey:'discount-model',requestFingerprint:'discount-model',status:'paid'};
 await assert.rejects(new Invoice(base).validate(),/totalMinor/);
 await new Invoice({...base,origin:'coupon',discountFull:true,coupon,subtotalMinor:500,discountMinor:500}).validate();
 await assert.rejects(new Invoice({...base,origin:'coupon',discountFull:true,coupon,subtotalMinor:500,discountMinor:499}).validate(),/totalMinor/);
});
test('automatic renewals have bounded provider-supported intervals and preserve accepted terms',async()=>{
 const base={user,checkoutOrder:new mongoose.Types.ObjectId(),provider:'stripe',environment:'test',kind:'section',product:'section',title:'Section',amountMinor:500,currency:'USD',termsAcceptedAt:new Date()};
 await new BillingAgreement({...base,intervalMonths:36}).validate();await assert.rejects(new BillingAgreement({...base,intervalMonths:60}).validate(),/intervalMonths/);await assert.rejects(new BillingAgreement({...base,intervalMonths:1,termsAcceptedAt:undefined}).validate(),/termsAcceptedAt/);
});

test('PayPal agreements enforce the documented maximum of twelve monthly intervals',async()=>{
 const base={user,checkoutOrder:new mongoose.Types.ObjectId(),provider:'paypal',environment:'test',kind:'course',product:'course',title:'Course',amountMinor:1000,currency:'USD',termsAcceptedAt:new Date()};
 await new BillingAgreement({...base,intervalMonths:12}).validate();await assert.rejects(new BillingAgreement({...base,intervalMonths:13}).validate(),/PayPal recurring intervals/);
});
