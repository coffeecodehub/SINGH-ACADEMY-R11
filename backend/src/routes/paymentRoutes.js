import {ownedAgreementViews,continuePendingCheckout,cancelPendingCheckout} from '../services/pendingBillingCheckout.js';
import BillingAgreement from '../models/BillingAgreement.js';
import {renewalSetupOptions} from '../services/renewalSetup.js';
import {publicAgreement,cancelOwnedAgreement,resumeOwnedAgreement,endDisabledAgreement,cancelAgreementAccessNow,cancelPurchaseAccessNow} from '../services/recurringBilling.js';
import {invoiceGrantEligible,validAccessDate} from '../utils/courseEntitlements.js';
import {catalogAccessSnapshot} from '../services/catalogEntitlements.js';
import {hasCourseAccess} from '../services/learningAccess.js';
import {Router} from 'express';
import mongoose from 'mongoose';
import PaymentAttachment from '../models/PaymentAttachment.js';
import {prepareReceiptUpload} from '../services/paymentAttachments.js';
import {uploadAdmission,receiptUploadSingle,storeUpload} from '../services/uploads.js';
import {createReceiptPdf} from '../services/receiptPdf.js';
import crypto from 'node:crypto';
import PurchaseRequest from '../models/PurchaseRequest.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Refund from '../models/Refund.js';
import Enrollment from '../models/Enrollment.js';
import Subscription from '../models/Subscription.js';
import Course from '../models/Course.js';
import SiteContent from '../models/SiteContent.js';
import Notification from '../models/Notification.js';
import {requireAuth,requireRole} from '../middleware/auth.js';
import {rateLimit} from '../middleware/rateLimit.js';
import {text,toMinor,invoiceBalance,invoiceState,businessError,pagination} from '../utils/business.js';
import {subscriptionDisplay} from '../utils/subscriptionDisplay.js';
import {invoicePaidAccess,legacyPaidAccess} from '../utils/paidAccessDisplay.js';
import CheckoutOrder from '../models/CheckoutOrder.js';
import {objectId} from '../services/businessRead.js';
import {catalog,startCheckout,syncCheckout,publicOrder,checkoutStatus,releaseCheckout,quoteCheckout} from '../services/onlineCheckout.js';
import {gatewayConfiguration,realAccessFilter,activeEnrollmentWindow} from '../utils/commerce.js';
const r=Router();
const isMembership=value=>typeof value==='string'&&value.trim()==='membership';
const retiredMembership=()=>businessError('New Academy-wide memberships are no longer sold. Choose an Academy section or individual course. Existing paid access and billing agreements remain available in My Billing.',410);
// Hosted checkout: card/account data never passes through this website.
r.get('/methods',(req,res)=>res.json({success:true,methods:gatewayConfiguration()}));
r.get('/catalog',requireAuth,requireRole('student'),async(req,res)=>{if(isMembership(req.query.kind))throw retiredMembership();res.json({success:true,purchase:await catalog(text(req.query.kind,'Purchase type',20,1),text(req.query.product,'Product',200,1),req.user)});});
r.post('/quote',requireAuth,requireRole('student'),rateLimit('checkout-quote',60,60000,{authenticated:true}),async(req,res)=>{if(isMembership(req.body?.kind))throw retiredMembership();const {quote}=await quoteCheckout(req);res.json({success:true,quote});});
r.get('/mine/agreements',requireAuth,requireRole('student'),async(req,res)=>{const items=await ownedAgreementViews(req.user._id);res.set('Cache-Control','private, no-store');res.json({success:true,items,setupItems:await renewalSetupOptions(req.user)});});
r.post('/mine/agreements/:id/continue',requireAuth,requireRole('student'),rateLimit('pending-checkout-continue',20,60000,{authenticated:true}),async(req,res)=>res.json({success:true,...await continuePendingCheckout(req.user._id,req.params.id)}));
r.post('/mine/agreements/:id/cancel-pending',requireAuth,requireRole('student'),rateLimit('pending-checkout-cancel',20,60000,{authenticated:true}),async(req,res)=>res.json({success:true,...await cancelPendingCheckout(req.user._id,req.params.id,req.body||{})}));
r.post('/mine/agreements/:id/cancel',requireAuth,requireRole('student'),rateLimit('renewal-cancel',20,60000,{authenticated:true}),async(req,res)=>res.json({success:true,item:await cancelOwnedAgreement(req.user._id,req.params.id),message:'Future renewal cancelled. Already paid access remains until its end date; no refund was requested.'}));
r.post('/mine/agreements/:id/resume',requireAuth,requireRole('student'),rateLimit('renewal-resume',20,60000,{authenticated:true}),async(req,res)=>res.json({success:true,item:await resumeOwnedAgreement(req.user._id,req.params.id,req.body||{}),message:'The payment provider confirmed automatic renewal at your accepted recurring price.'}));
r.post('/mine/agreements/:id/end',requireAuth,requireRole('student'),rateLimit('renewal-end',20,60000,{authenticated:true}),async(req,res)=>res.json({success:true,item:await endDisabledAgreement(req.user._id,req.params.id),message:'PayPal confirmed the disabled agreement has ended. Your paid access remains unchanged.'}));
r.post('/mine/agreements/:id/cancel-now',requireAuth,requireRole('student'),rateLimit('subscription-cancel-now',20,60000,{authenticated:true}),async(req,res)=>res.json({success:true,item:await cancelAgreementAccessNow(req.user._id,req.params.id,req.body||{}),immediateRevocation:true,noRefund:true}));
r.post('/mine/purchases/:id/cancel-now',requireAuth,requireRole('student'),rateLimit('purchase-cancel-now',20,60000,{authenticated:true}),async(req,res)=>res.json({success:true,item:await cancelPurchaseAccessNow(req.user._id,req.params.id,req.body||{}),immediateRevocation:true,noRefund:true}));
r.get('/checkout-status',requireAuth,requireRole('student'),rateLimit('checkout-status',60,60000,{authenticated:true}),async(req,res)=>res.json({success:true,...await checkoutStatus(req)}));
r.post('/checkout/release',requireAuth,requireRole('student'),rateLimit('checkout-release',20,60000,{authenticated:true}),async(req,res)=>res.json({success:true,...await releaseCheckout(req)}));
r.post('/checkout',requireAuth,requireRole('student'),rateLimit('checkout-create',20,60000,{authenticated:true}),async(req,res)=>{if(isMembership(req.body?.kind)&&!(await checkoutStatus(req)).found)throw retiredMembership();res.json({success:true,...await startCheckout(req)});});
r.get('/orders/:id',requireAuth,requireRole('student'),async(req,res)=>{const order=await CheckoutOrder.findOne({_id:objectId(req.params.id),user:req.user._id});if(!order)throw businessError('Checkout not found.',404);res.json({success:true,order:publicOrder(order)});});
r.post('/orders/:id/confirm',requireAuth,requireRole('student'),rateLimit('checkout-confirm',30,60000,{authenticated:true}),async(req,res)=>res.json({success:true,order:await syncCheckout(req.params.id,{userId:req.user._id,capture:true})}));
r.post('/verify',(req,res)=>res.status(404).json({success:false,message:'Payment verification endpoint is not enabled.'}));
// Owned access metadata only: catalog cards never load lesson/progress records.
r.get('/membership-status',requireAuth,requireRole('student'),async(req,res)=>{
 const access=await catalogAccessSnapshot(req.user._id);
 res.set('Cache-Control','private, no-store');res.json({success:true,...access});
});
r.get('/access/:courseSlug',requireAuth,requireRole('student'),async(req,res)=>{
 const slug=text(req.params.courseSlug,'Course',180,1);
 const course=await Course.findOne({slug,published:true}).select('accessType').lean();
 const access=course?await hasCourseAccess(req.user._id,slug):null;
 res.set('Cache-Control','private, no-store');res.json({success:true,hasAccess:Boolean(access),enrollment:access?.type==='course'?access.enrollment:null,accessType:access?.type||null});
});
r.post('/requests',requireAuth,requireRole('student'),(req,res)=>res.status(410).json({success:false,message:'Select your course or plan and use Stripe or PayPal checkout. Manual enrollment requests are no longer used.'}));
r.get('/mine/plans',requireAuth,requireRole('student'),async(req,res)=>{
 const {page,pageSize,skip}=pagination(req.query),filter={user:req.user._id};
 const [items,total,site]=await Promise.all([Subscription.find(filter).select('plan status startsAt endsAt dueAt durationMonths priceMinor currency invoice createdAt cancelledAt accessCancelledAt billingAgreement testMode').populate('invoice','number user paidAt totalMinor paidMinor creditedMinor currency accessStartsAt accessExpiresAt accessCancelledAt accessRevokedAt status fulfillmentAt kind planName testMode grantVersion grantStartsAt grantExpiresAt grantNoExpiry noScheduledExpiry grantSuppressed origin discountFull coupon subtotalMinor discountMinor').sort({createdAt:-1,_id:-1}).skip(skip).limit(pageSize).lean(),Subscription.countDocuments(filter),SiteContent.findOne({key:'membershipPlans'}).select('value').lean()]);
 const activePlans=new Set((Array.isArray(site?.value)?site.value:[]).filter(p=>p.active!==false).map(p=>p.name));
 const now=new Date(),renewals=await Invoice.find({user:req.user._id,renewalOf:{$in:items.map(t=>t._id)},status:'open'}).select('renewalOf number dueAt totalMinor paidMinor creditedMinor currency').lean();
 const scheduled=await Subscription.find({user:req.user._id,status:'active',startsAt:{$gt:now}}).select('startsAt endsAt testMode').lean();
 res.json({success:true,items:items.map(term=>{const renewal=renewals.find(i=>String(i.renewalOf)===String(term._id));return {...term,...subscriptionDisplay(term,now),paidAccess:legacyPaidAccess(term,req.user._id,{now}),accessCancelledAt:term.accessCancelledAt||term.invoice?.accessCancelledAt||null,canCancelActivePurchase:Boolean(term.invoice&&!term.billingAgreement&&invoiceGrantEligible(term.invoice)&&new Date(term.endsAt)>now),entryDate:term.createdAt,subscriptionDate:term.invoice?.paidAt||null,nextPaymentDueAt:renewal?.dueAt||null,renewalInvoice:renewal?{number:renewal.number,dueAt:renewal.dueAt,balanceMinor:invoiceBalance(renewal),currency:renewal.currency}:null,hasScheduledRenewal:scheduled.some(s=>String(s._id)!==String(term._id)&&Boolean(s.testMode)===Boolean(term.testMode)&&new Date(s.startsAt)<=new Date(term.endsAt)&&new Date(s.endsAt)>new Date(term.endsAt)),canResubscribe:activePlans.has(term.plan),renewalUrl:activePlans.has(term.plan)?'/checkout?plan='+encodeURIComponent(term.plan):'/academy'};}),total,page,pageSize});
});
r.get('/mine/:kind',requireAuth,requireRole('student'),async(req,res)=>{
 const {page,pageSize,skip}=pagination(req.query),kind=req.params.kind;
 const definitions={requests:[PurchaseRequest,'kind product title status message quotedAmountMinor currency createdAt invoice'],invoices:[Invoice,'number kind title currency totalMinor paidMinor creditedMinor dueAt status paidAt accessStartsAt accessExpiresAt noScheduledExpiry durationMonths accessDays fulfillmentAt courseSlug sectionSlug planName createdAt testMode origin discountFull coupon subtotalMinor discountMinor grantVersion grantStartsAt grantExpiresAt grantNoExpiry grantSuppressed accessRevokedAt accessCancelledAt billingAgreement'],payments:[Payment,'invoice amountMinor amount currency paidAt status provider providerPaymentId reference refundedMinor createdAt testMode'],refunds:[Refund,'invoice amountMinor currency refundedAt createdAt testMode source']};
 const chosen=definitions[kind];if(!chosen)throw businessError('Unknown billing section.',404);
 const [Model,fields]=chosen,filter={user:req.user._id};
 if(kind==='invoices'&&req.query.invoice)filter._id=objectId(req.query.invoice);
 const [items,total]=await Promise.all([Model.find(filter).select(fields).sort({createdAt:-1,_id:-1}).skip(skip).limit(pageSize).lean(),Model.countDocuments(filter)]);
 let result=items;
 if(kind==='invoices'){
  const ids=items.map(i=>i._id),owned={user:req.user._id,invoice:{$in:ids}};
  const [terms,orders,access]=await Promise.all([Subscription.find(owned).select('invoice startsAt endsAt').lean(),CheckoutOrder.find({...owned,status:'paid'}).select('invoice accessStartsAt accessExpiresAt').lean(),Enrollment.find(owned).select('invoice accessStartsAt accessExpiresAt').lean()]);
  result=items.map(i=>{const order=orders.find(x=>String(x.invoice)===String(i._id)),term=terms.find(x=>String(x.invoice)===String(i._id)),enrollment=access.find(x=>String(x.invoice)===String(i._id));
   // Checkout snapshots are historical; the linked term/access is used only when there is no saved invoice/order end.
   const source=order||term||enrollment,end=i.accessExpiresAt??(order?order.accessExpiresAt:term?term.endsAt:enrollment?.accessExpiresAt);
   return {...i,paidAccess:invoicePaidAccess(i,{owner:req.user._id,history:items}),accessStartsAt:i.accessStartsAt||(order?.accessStartsAt||term?.startsAt||enrollment?.accessStartsAt),accessExpiresAt:end,
    accessCancelledAt:i.accessCancelledAt||null,canCancelActivePurchase:Boolean(!i.billingAgreement&&invoiceGrantEligible(i)&&validAccessDate(i.grantStartsAt||i.accessStartsAt)&&((validAccessDate(i.grantExpiresAt||end)&&new Date(i.grantExpiresAt||end)>new Date())||i.noScheduledExpiry||i.grantNoExpiry)),noScheduledExpiry:i.noScheduledExpiry===true||(i.kind==='course'&&!!source&&end===null),balanceMinor:invoiceBalance(i),effectiveStatus:invoiceState(i)};});
 }
 if(kind==='payments'){
  const [attachments,invoices]=await Promise.all([PaymentAttachment.find({user:req.user._id,payment:{$in:items.map(p=>p._id)}}).select('payment fileId name createdAt').lean(),Invoice.find({user:req.user._id,_id:{$in:items.map(p=>p.invoice).filter(Boolean)}}).select('number title').lean()]);
  result=items.map(p=>({...p,invoice:invoices.find(i=>String(i._id)===String(p.invoice))||p.invoice,attachments:attachments.filter(a=>String(a.payment)===String(p._id))}));
 }
 res.json({success:true,items:result,total,page,pageSize});
});
r.post('/mine/payments/:id/attachments',requireAuth,requireRole('student'),rateLimit('receipt-upload',15,60000,{authenticated:true}),prepareReceiptUpload,uploadAdmission,receiptUploadSingle,storeUpload);
r.delete('/mine/payments/:id/attachments/:attachmentId',requireAuth,requireRole('student'),rateLimit('receipt-remove',20,60000,{authenticated:true}),async(req,res)=>{
 const attachment=await PaymentAttachment.findOneAndDelete({_id:objectId(req.params.attachmentId),payment:objectId(req.params.id),user:req.user._id});if(!attachment)throw businessError('Receipt screenshot not found.',404);
 await new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'}).delete(attachment.fileId).catch(()=>{});res.json({success:true});
});
r.get('/mine/payments/:id/receipt',requireAuth,requireRole('student'),async(req,res)=>{
 const payment=await Payment.findOne({_id:objectId(req.params.id),user:req.user._id,status:'paid'}).lean();if(!payment)throw businessError('Receipt not found.',404);
 const invoice=payment.invoice?await Invoice.findOne({_id:payment.invoice,user:req.user._id}).select('number title').lean():null;
 const pdf=createReceiptPdf(payment,invoice,req.user);res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Singh-Academy-Receipt-${payment._id}.pdf"`,'Cache-Control':'private, no-store'});res.send(pdf);
});
export default r;
