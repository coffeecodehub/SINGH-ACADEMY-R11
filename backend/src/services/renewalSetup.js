import Course from '../models/Course.js';
import Section from '../models/Section.js';
import Invoice from '../models/Invoice.js';
import Subscription from '../models/Subscription.js';
import BillingAgreement from '../models/BillingAgreement.js';
import CheckoutOrder from '../models/CheckoutOrder.js';
import {loadCourseEntitlements} from './courseEntitlements.js';
import {loadSectionGrants} from './sectionAccess.js';
import {effectiveGrant,invoiceGrantEligible,validAccessDate} from '../utils/courseEntitlements.js';
import {realAccessFilter,gatewayConfiguration} from '../utils/commerce.js';
import {regionalOffers} from './regionalPricing.js';
import {businessError} from '../utils/business.js';
import {invoicePaidAccess} from '../utils/paidAccessDisplay.js';
const day=86400000;
export async function renewalCheckoutConflict(userId,kind,product,{renewalSetup=false,autoRenew=false,environment,session=null}={}){
 if(await BillingAgreement.exists({user:userId,kind,product,accessCancellationRequestedAt:{$exists:true},accessCancelledAt:{$exists:false}}).session(session))return 'Immediate cancellation of this subscription is still being confirmed. Finish that action before a new purchase.';
 if(renewalSetup&&await CheckoutOrder.exists({user:userId,kind,product,renewalSetup:{$ne:true},status:{$in:['creating','pending']}}).session(session))return 'Finish or safely close the existing checkout for this product before setting up automatic renewal.';
 if(!autoRenew&&await BillingAgreement.exists({user:userId,kind,product,environment,renewalSetup:true,status:{$ne:'cancelled'},$or:[{autoRenew:true},{'renewalOperation.autoRenew':true}]}).session(session))return 'Automatic renewal is already scheduled for this product. Disable it in My Billing and wait for provider confirmation before making a one-time purchase.';
 return '';
}
/** One selected original purchase is linked to a deferred agreement. Coverage
 * used for its safe charge date is deliberately not a list of rights to revoke. */
export async function renewalSourceInvoice(userId,kind,product,{sourceInvoiceId,session=null,createdBefore,requireEligible=true,environment}={}){
 if(!['course','section','membership'].includes(kind))throw businessError('Invalid source purchase type.',409);
 if(sourceInvoiceId!==undefined&&(typeof sourceInvoiceId!=='string'||!/^[a-f0-9]{24}$/i.test(sourceInvoiceId)))throw businessError('Invalid original purchase reference.',400);
 const field=kind==='course'?'courseSlug':kind==='section'?'sectionSlug':'planName';
 const rows=await Invoice.find({user:userId,kind,[field]:product,...(sourceInvoiceId?{_id:sourceInvoiceId}:{}),...(createdBefore?{createdAt:{$lte:createdBefore}}:{}),...(environment?{testMode:environment==='test'?true:{$ne:true}}:{})}).session(session).sort({paidAt:-1,_id:-1}).lean();
 const candidates=rows.filter(row=>!requireEligible||invoiceGrantEligible(row));
 if(!candidates.length)throw businessError('The original paid purchase could not be verified for this subscription.',409);
 if(candidates.length!==1)throw businessError('Choose the specific original paid purchase before cancelling or setting up this subscription.',409);
 return candidates[0];
}

/** Derive a future charge date only from the owner's existing access sources.
 * A course can remain covered by its section or a legacy Academy term after its
 * individual invoice ends. Those paid periods must not be charged over again. */
export async function renewalSetupTiming(userId,kind,product,{session=null,now=new Date()}={}){
 if(!['course','section'].includes(kind))throw businessError('Automatic renewal setup requires an individual course or section.',409);
 const grants=[];
 if(kind==='course'){
  grants.push(...(await loadCourseEntitlements(userId,{courseSlug:product,session})).grants);
  const course=await Course.findOne({slug:product,published:true}).select('sectionSlug').session(session).lean();
  if(course?.sectionSlug)grants.push(...await loadSectionGrants(userId,{sectionSlug:course.sectionSlug,session}));
 }else grants.push(...await loadSectionGrants(userId,{sectionSlug:product,session}));
 const memberships=await Subscription.find({user:userId,status:'active',endsAt:{$gt:now},...realAccessFilter()}).select('startsAt endsAt testMode').session(session).lean();
 // Keep scheduled contiguous legacy terms in the union, without bridging a gap.
 grants.push(...memberships.map(term=>({startsAt:new Date(term.startsAt),endsAt:new Date(term.endsAt),testMode:term.testMode===true,active:true})));
 const coverage=effectiveGrant(grants,now);
 if(!coverage){
  if(grants.some(g=>g.active!==false&&validAccessDate(g.startsAt)>now&&(g.noExpiry||validAccessDate(g.endsAt)>validAccessDate(g.startsAt))))return {billingStartsAt:null,futurePaidAccess:true,reason:'A future paid access period is already scheduled after a gap. Set up automatic renewal when that paid period is active to avoid charging over prepaid access.'};
  return {billingStartsAt:null,reason:'Your paid access has ended. Use a regular checkout to renew access now.'};
 }
 if(!coverage.accessExpiresAt)return {billingStartsAt:null,reason:'Your existing access has no scheduled expiry, so automatic renewal is not needed.'};
 const billingStartsAt=new Date(Math.ceil(+new Date(coverage.accessExpiresAt)/1000)*1000),remaining=+billingStartsAt-+now;
 if(grants.some(g=>g.active!==false&&Boolean(g.testMode)===Boolean(coverage.testMode)&&validAccessDate(g.startsAt)>coverage.accessExpiresAt&&(g.noExpiry||validAccessDate(g.endsAt)>validAccessDate(g.startsAt))))return {billingStartsAt,futurePaidAccess:true,reason:'A separate future paid access period is already scheduled after a gap. Set up automatic renewal when that period is active to avoid charging over prepaid access.'};
 if(remaining<2*day)return {billingStartsAt,reason:'Set up automatic renewal at least 48 hours before the paid term ends. Your current paid access remains available; renew through a regular checkout after it ends.'};
 if(remaining>730*day)return {billingStartsAt,reason:'Automatic renewal setup can be scheduled at most 730 days ahead. Set up automatic renewal when your remaining paid access is within that window.'};
 return {billingStartsAt,reason:'',accessStartsAt:coverage.accessStartsAt};
}

/** Product-specific setup actions for genuine owned financial records. These
 * links only open a new quote/consent screen; reading billing never charges. */
export async function renewalSetupOptions(user){
 const [invoices,agreements]=await Promise.all([
  Invoice.find({user:user._id,kind:{$in:['course','section']},status:'paid',...realAccessFilter()}).sort({paidAt:-1,_id:-1}).limit(500).lean(),
  BillingAgreement.find({user:user._id,activeKey:{$exists:true}}).select('kind product').lean()
 ]);
 const managed=new Set(agreements.map(a=>a.kind+':'+a.product)),products=new Map();
 for(const invoice of invoices){
  if(!invoiceGrantEligible(invoice))continue;
  const product=invoice.kind==='course'?invoice.courseSlug:invoice.sectionSlug,key=invoice.kind+':'+product;
  if(!product||managed.has(key)||products.has(key))continue;
  products.set(key,invoice);
 }
 const items=[],methods=gatewayConfiguration();
 for(const [key,invoice]of [...products].slice(0,100)){
  const kind=invoice.kind,product=kind==='course'?invoice.courseSlug:invoice.sectionSlug;
  const stored=await(kind==='course'?Course:Section).findOne({slug:product,published:true,archivedAt:null}).lean();
  if(!stored||kind==='course'&&['free','membership'].includes(stored.accessType))continue;
  const offers=regionalOffers(stored,user.country).filter(offer=>offer.amountMinor>0&&offer.durationMonths<=36);
  if(!offers.length)continue;
  const offer=offers.find(row=>row.durationMonths===invoice.durationMonths)||offers[0],timing=await renewalSetupTiming(user._id,kind,product);
  if(!timing.billingStartsAt&&/no scheduled expiry/.test(timing.reason))continue;
  const currentEnd=validAccessDate(timing.billingStartsAt)||validAccessDate(invoice.grantExpiresAt)||validAccessDate(invoice.accessExpiresAt),active=Boolean(timing.billingStartsAt&&timing.billingStartsAt>new Date());
  const query=new URLSearchParams({[kind]:product,option:offer.key,...(active?{renewalSetup:'1',sourceInvoice:String(invoice._id)}:{})});
  const sourceStart=validAccessDate(invoice.grantStartsAt)||validAccessDate(invoice.accessStartsAt),sourceEnd=validAccessDate(invoice.grantExpiresAt)||validAccessDate(invoice.accessExpiresAt),canCancelActivePurchase=Boolean(sourceStart&&(!sourceEnd||sourceEnd>new Date())&&!invoice.accessCancelledAt);
  items.push({key,invoiceId:String(invoice._id),canCancelActivePurchase,accessCancelledAt:invoice.accessCancelledAt||null,paidAccess:invoicePaidAccess(invoice,{owner:user._id,history:invoices}),kind,product,title:stored.title||invoice.title,testMode:invoice.testMode===true,accessExpiresAt:currentEnd,amountMinor:offer.amountMinor,currency:offer.currency,intervalMonths:offer.durationMonths,
   renewalSetup:active,billingStartsAt:active?timing.billingStartsAt:null,amountDueNowMinor:active?0:offer.amountMinor,canSetup:!timing.futurePaidAccess&&(!active||!timing.reason),unavailableReason:active||timing.futurePaidAccess?timing.reason:'',setupUrl:'/checkout?'+query.toString(),provider:'choice',availableProviders:{stripe:methods.stripe.enabled&&offer.durationMonths<=36&&(!active||!timing.reason),paypal:methods.paypal.enabled&&offer.durationMonths<=12&&(!active||!timing.reason)},providerUnavailableReasons:{stripe:'',paypal:offer.durationMonths>12?'PayPal supports recurring terms of 1–12 months.':''}});
 }
 return items;
}
