import {Router} from 'express';
import mongoose from 'mongoose';
import Coupon from '../models/Coupon.js';
import Course from '../models/Course.js';
import Section from '../models/Section.js';
import {requireAuth,requireRole} from '../middleware/auth.js';
import {cmsAudit} from '../services/audit.js';
import {normalizeCouponCode,generateCouponCode,couponStatus} from '../services/coupons.js';
import {httpError} from '../utils/cmsValidation.js';
import {pagination,searchTerm,escapeRegex} from '../utils/business.js';
import {rateLimit} from '../middleware/rateLimit.js';
const r=Router();
r.use(requireAuth,requireRole('client_admin','super_admin'),cmsAudit);
r.get('/',async(req,res)=>{
 const {page,pageSize,skip}=pagination(req.query),q=searchTerm(req.query.q),filter=q?{$or:['code','productSlug'].map(key=>({[key]:{$regex:escapeRegex(q),$options:'i'}}))}:{};
 const now=new Date(),status=req.query.status;
 if(status&&status!=='all'){
  if(!['available','reserved','redeemed','revoked','expired'].includes(status))throw httpError(400,'Invalid coupon status.');
  if(status==='redeemed')filter.redeemedAt={$ne:null};
  else{filter.redeemedAt=null;if(status==='revoked')filter.active=false;else{filter.active=true;filter.expiresAt=status==='expired'?{$lte:now}:{$gt:now};if(status!=='expired')filter.claimedOrder=status==='reserved'?{$ne:null}:null;}}
 }
 const [items,total]=await Promise.all([Coupon.find(filter).sort({createdAt:-1,_id:-1}).skip(skip).limit(pageSize).lean(),Coupon.countDocuments(filter)]);
 res.set('Cache-Control','private, no-store');res.json({success:true,items:items.map(item=>({...item,status:couponStatus(item)})),total,page,pageSize});
});
r.post('/',rateLimit('coupon-create',30,60000,{authenticated:true}),async(req,res)=>{
 const {kind,productSlug}=req.body||{},percentOff=Number(req.body?.percentOff),expiresAt=new Date(req.body?.expiresAt);
 if(!['course','section'].includes(kind)||typeof productSlug!=='string'||!productSlug||productSlug.length>150)throw httpError(400,'Choose a course or section for this coupon.');
 if(!Number.isInteger(percentOff)||percentOff<1||percentOff>100)throw httpError(400,'Discount must be a whole percentage from 1 to 100.');
 if(!req.body.expiresAt||!Number.isFinite(+expiresAt)||expiresAt<=new Date())throw httpError(400,'Choose a future coupon expiry.');
 if(!await (kind==='section'?Section:Course).exists({slug:productSlug,archivedAt:null}))throw httpError(400,'The selected product does not exist.');
 const code=req.body.code?normalizeCouponCode(req.body.code):generateCouponCode();
 try{const item=await Coupon.create({code,kind,productSlug,percentOff,expiresAt,active:true,createdBy:req.user._id});res.status(201).json({success:true,item:{...item.toObject(),status:couponStatus(item)}});}catch(error){if(error.code===11000)throw httpError(409,'This coupon code already exists. Choose a different code.');throw error;}
});
r.put('/:id',rateLimit('coupon-revoke',60,60000,{authenticated:true}),async(req,res)=>{
 if(!mongoose.isValidObjectId(req.params.id))throw httpError(400,'Invalid coupon identifier.');
 if(req.body?.active!==false)throw httpError(400,'Existing coupons can only be revoked. Create a new code for another offer.');
 const item=await Coupon.findByIdAndUpdate(req.params.id,{$set:{active:false}},{new:true,runValidators:true});if(!item)throw httpError(404,'Coupon not found.');res.json({success:true,item:{...item.toObject(),status:couponStatus(item)}});
});
export default r;
