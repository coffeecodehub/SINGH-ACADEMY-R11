/** Real isolated MongoDB reads. No provider credentials, network transport or application listener. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';
test('owned billing DTOs display fulfilled invoice periods without modifying financial records',{timeout:30000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 const mongoose=(await import('mongoose')).default;
 const Invoice=(await import('../src/models/Invoice.js')).default,CheckoutOrder=(await import('../src/models/CheckoutOrder.js')).default,BillingAgreement=(await import('../src/models/BillingAgreement.js')).default;
 const {ownedAgreementViews}=await import('../src/services/pendingBillingCheckout.js');
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:10000});
 t.after(async()=>{try{await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 const owner=new mongoose.Types.ObjectId(),other=new mongoose.Types.ObjectId(),day=86400000,start=new Date(Date.now()-5*day),end=new Date(Date.now()+25*day);
 async function seed(user,extra={}){
  const product='display-'+crypto.randomUUID(),order=await CheckoutOrder.create({user,provider:'stripe',environment:'test',kind:'course',product,title:'Synthetic display purchase',currency:'USD',amountMinor:1000,durationMonths:1,status:'paid',expiresAt:end,requestKey:crypto.randomUUID(),requestFingerprint:'display',...extra.order});
  const agreement=await BillingAgreement.create({user,checkoutOrder:order._id,provider:'stripe',environment:'test',kind:'course',product,title:order.title,currency:'USD',amountMinor:1000,intervalMonths:1,status:'paused',autoRenew:false,currentPeriodStart:start,currentPeriodEnd:new Date(Date.now()+365*day),termsAcceptedAt:start,...extra.agreement});
  const invoice=extra.noInvoice?null:await Invoice.create({user,createdBy:user,number:'SA-DISPLAY-'+crypto.randomUUID(),kind:'course',courseSlug:product,title:order.title,origin:'recurring',billingAgreement:agreement._id,currency:'USD',totalMinor:1000,paidMinor:1000,creditedMinor:0,status:'paid',testMode:true,paidAt:start,dueAt:start,accessStartsAt:start,accessExpiresAt:end,grantVersion:1,grantStartsAt:start,grantExpiresAt:end,fulfillmentAt:start,requestKey:crypto.randomUUID(),requestFingerprint:'display',...extra.invoice});
  order.billingAgreement=agreement._id;if(invoice)order.invoice=invoice._id;await order.save();return {order,agreement,invoice};
 }
 const paid=await seed(owner),deferred=await seed(owner,{order:{status:'renewal_ready',renewalSetup:true},agreement:{status:'trialing',renewalSetup:true}}),pending=await seed(owner,{order:{status:'pending'},agreement:{status:'creating'},noInvoice:true}),trial=await seed(owner,{order:{status:'renewal_ready',renewalSetup:true},agreement:{status:'trialing',renewalSetup:true},noInvoice:true});
 await seed(other);
 // Link the original paid purchase, not the first future charge, to a deferred mandate.
 deferred.invoice.billingAgreement=undefined;await deferred.invoice.save();deferred.agreement.sourceInvoiceId=deferred.invoice._id;await deferred.agreement.save();
 const models=[Invoice,CheckoutOrder,BillingAgreement],before=await Promise.all(models.map(model=>model.find({}).sort({_id:1}).lean()));
 const rows=await ownedAgreementViews(owner),byId=new Map(rows.map(row=>[String(row._id),row]));assert.equal(rows.length,4);
 assert.equal(byId.get(String(paid.agreement._id)).paidAccess.endsAt,end.toISOString());assert.equal(byId.get(String(paid.agreement._id)).paidAccess.status,'active');
 assert.equal(byId.get(String(deferred.agreement._id)).paidAccess.endsAt,end.toISOString());
 assert.equal(byId.get(String(pending.agreement._id)).paidAccess.status,'pending');assert.equal(byId.get(String(pending.agreement._id)).paidAccess.remainingDays,null);
 assert.equal(byId.get(String(trial.agreement._id)).paidAccess.status,'unknown');assert.equal(byId.get(String(trial.agreement._id)).paidAccess.endsAt,null);
 await ownedAgreementViews(owner);
 assert.deepEqual(await Promise.all(models.map(model=>model.find({}).sort({_id:1}).lean())),before);
});
