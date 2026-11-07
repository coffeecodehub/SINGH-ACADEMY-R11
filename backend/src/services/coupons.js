import crypto from 'node:crypto';
import Coupon from '../models/Coupon.js';
import Course from '../models/Course.js';
import Section from '../models/Section.js';
import {businessError} from '../utils/business.js';
import {normalizeCountry} from '../utils/countries.js';
import {getMembershipPlans,regionalOffers} from './regionalPricing.js';

export function normalizeCouponCode(value){
 if(typeof value!=='string')throw businessError('Enter a valid coupon code.');
 const code=value.trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9_-]{5,63}$/.test(code))throw businessError('Coupon codes must contain 6–64 letters, numbers, underscores or hyphens.');return code;
}
export const generateCouponCode=()=>crypto.randomBytes(12).toString('hex').toUpperCase();
export function couponStatus(coupon,now=new Date()){
 return coupon.redeemedAt?'redeemed':coupon.active===false?'revoked':new Date(coupon.expiresAt)<=now?'expired':coupon.claimedOrder?'reserved':'available';
}
/** Quote uses account country and stored products only; caller amounts/country are ignored. */
export async function quoteProduct({user,kind,product:slug,optionKey,couponCode,session=null}){
 if(!user?._id)throw businessError('Sign in before requesting a price.',401);
 if(!['course','section','membership'].includes(kind)||typeof slug!=='string'||!slug||slug.length>180)throw businessError('Choose a valid product.');
 const country=normalizeCountry(user.country);let product;
 if(kind==='membership')product=(await getMembershipPlans(country,{session})).find(plan=>plan.key===slug||plan.name===slug);
 else product=await (kind==='section'?Section:Course).findOne({slug,published:true,archivedAt:null}).session(session).lean();
 if(!product)throw businessError('This product is unavailable. Reload the catalog.',404);
 if(kind==='course'&&product.accessType==='free')throw businessError('This course is free. Open it from the catalog.',409);
 const offers=regionalOffers(product,country),offer=optionKey==null||optionKey===''?offers[0]:offers.find(row=>row.key===String(optionKey));
 if(!offer)throw businessError('This price option changed. Reload and choose again.',409);
 const subtotalMinor=offer.amountMinor;let discountMinor=0,coupon=null;
 if(subtotalMinor<=0)throw businessError('A positive administrator-configured price is required for this paid product.',409);
 if(couponCode!==undefined&&couponCode!==null&&couponCode!==''){
  if(kind==='membership')throw businessError('Coupons apply to an individual course or section only.',409);
  const code=normalizeCouponCode(couponCode);
  coupon=await Coupon.findOne({code,kind,productSlug:slug,active:true,expiresAt:{$gt:new Date()},$or:[{claimedOrder:null},{claimedBy:user._id}],redeemedAt:null}).session(session).lean();
  if(!coupon)throw businessError('This coupon is unavailable for the selected product.',409);
  discountMinor=Math.floor(subtotalMinor*coupon.percentOff/100);
 }
 return {product,offer,quote:{kind,product:kind==='membership'?product.key||product.name:product.slug,optionKey:offer.key,subtotalMinor,discountMinor,amountMinor:subtotalMinor-discountMinor,currency:offer.currency,durationMonths:offer.durationMonths,country,...(coupon?{couponId:coupon._id,percentOff:coupon.percentOff,reservedForExistingCheckout:Boolean(coupon.claimedOrder)}:{})}};
}
/** Must share the checkout transaction: exactly one order can hold this coupon. */
export async function claimCoupon({couponId,orderId,userId,session}){
 if(!couponId)return null;
 if(!session)throw businessError('Coupon claims require a checkout transaction.',500);
 const item=await Coupon.findOneAndUpdate({_id:couponId,active:true,expiresAt:{$gt:new Date()},redeemedAt:null,$or:[{claimedOrder:null},{claimedOrder:orderId,claimedBy:userId}]},{$set:{claimedOrder:orderId,claimedBy:userId,claimedAt:new Date()}},{new:true,runValidators:true,session});
 if(!item)throw businessError('This coupon was reserved by another checkout. Reload the price.',409);return item;
}
export async function consumeCoupon({couponId,orderId,session}){
 if(!couponId)return null;
 if(!session)throw businessError('Coupon consumption requires a settlement transaction.',500);
 // Expiry/revocation prevents NEW claims; a provider-settled reserved order keeps its agreed price.
 const item=await Coupon.findOneAndUpdate({_id:couponId,claimedOrder:orderId,redeemedAt:null},{$set:{redeemedAt:new Date(),redeemedOrder:orderId}},{new:true,session});
 if(item)return item;
 const previous=await Coupon.findOne({_id:couponId,redeemedOrder:orderId}).session(session);if(previous)return previous;
 throw businessError('The paid checkout coupon claim needs reconciliation.',409);
}
export async function releaseCoupon({couponId,orderId,session}){
 if(!couponId)return null;
 if(!session)throw businessError('Coupon release requires a checkout transaction.',500);
 return Coupon.findOneAndUpdate({_id:couponId,claimedOrder:orderId,redeemedAt:null},{$set:{claimedOrder:null,claimedBy:null},$unset:{claimedAt:1}},{new:true,session});
}
