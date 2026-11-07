import {Router} from 'express';
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import Section from '../models/Section.js';
import Course from '../models/Course.js';
import {requireAuth,requireRole,resolveSession} from '../middleware/auth.js';
import {httpError,payloadFor} from '../utils/cmsValidation.js';
import {mediaUrl} from '../utils/media.js';
import {searchTerm,escapeRegex} from '../utils/business.js';
import {catalogCache} from '../services/catalogCache.js';
import {publicRegionalProduct} from '../services/regionalPricing.js';
import {effectiveSectionAccess} from '../services/sectionAccess.js';
import {cmsAudit} from '../services/audit.js';
import {rateLimit} from '../middleware/rateLimit.js';
import {uploadAdmission,uploadSingle} from '../services/uploads.js';
import {storePageSectionUpload} from '../services/pageSectionUploads.js';

export function sectionProduct(req,raw){
 const product=req.user?publicRegionalProduct(raw,req.user.country):Object.fromEntries(Object.entries(raw).filter(([key])=>!['price','salePrice','pricing','countryPrices','regionalDefault'].includes(key)));
 return {...product,thumbnail:mediaUrl(req,raw.thumbnailFileId,raw.thumbnail)};
}
const r=Router();
r.use(async(req,res,next)=>{try{if(!req.user&&req.cookies){const auth=await resolveSession(req,'student');if(auth&&!auth.session.setupOnly)req.user=auth.user;}res.set('Cache-Control','private, no-store');next();}catch(error){next(error);}});
r.get('/',async(req,res)=>{
 const sections=await catalogCache.get('sections',()=>Section.find({published:true,archivedAt:null}).sort({order:1,title:1}).lean());
 res.json({success:true,sections:sections.map(section=>sectionProduct(req,section))});
});
r.get('/:slug',async(req,res)=>{
 const summary=await catalogCache.get('section:'+req.params.slug,async()=>{
  const section=await Section.findOne({slug:req.params.slug,published:true,archivedAt:null}).lean();if(!section)return null;
  const courses=await Course.find({sectionSlug:section.slug,published:true}).sort({title:1}).lean();return {section,courses};
 });
 if(!summary)throw httpError(404,'Section not found.');
 const access=req.user?.role==='student'?await effectiveSectionAccess(req.user._id,summary.section.slug):null;
 res.json({success:true,section:sectionProduct(req,summary.section),courses:summary.courses.map(course=>sectionProduct(req,course)),access:access?{active:true,startsAt:access.accessStartsAt,endsAt:access.accessExpiresAt}:null});
});

export const adminSections=Router();
adminSections.use(requireAuth,requireRole('client_admin','super_admin'),cmsAudit);
adminSections.get('/',async(req,res)=>{
 const q=searchTerm(req.query.q),filter={archivedAt:null};if(q)filter.$or=['title','slug'].map(key=>({[key]:{$regex:escapeRegex(q),$options:'i'}}));
 res.set('Cache-Control','private, no-store');res.json({success:true,items:await Section.find(filter).sort({order:1,title:1}).lean()});
});
adminSections.post('/upload',rateLimit('section-cover-upload',20,60000,{authenticated:true}),uploadAdmission,uploadSingle,async(req,res,next)=>{
 if(req.file&&!req.file.mimetype.startsWith('image/')){await fs.unlink(req.file.path).catch(()=>{});return next(httpError(400,'Section covers must be images.'));}
 return storePageSectionUpload(req,res,next);
});
adminSections.post('/',rateLimit('section-create',30,60000,{authenticated:true}),async(req,res)=>res.status(201).json({success:true,item:await Section.create(payloadFor('sections',req.body,{creating:true}))}));
async function sectionRecord(value){if(!mongoose.isValidObjectId(value))throw httpError(400,'Invalid section identifier.');const item=await Section.findById(value);if(!item)throw httpError(404,'Section not found.');return item;}
adminSections.put('/:id',rateLimit('section-edit',60,60000,{authenticated:true}),async(req,res)=>{
 const item=await sectionRecord(req.params.id);if(item.archivedAt)throw httpError(409,'Archived sections cannot be republished.');item.set(payloadFor('sections',req.body,{previous:item}));await item.save();res.json({success:true,item});
});
adminSections.delete('/:id',rateLimit('section-archive',30,60000,{authenticated:true}),async(req,res)=>{
 const item=await sectionRecord(req.params.id);item.published=false;item.archivedAt=item.archivedAt||new Date();await item.save();res.json({success:true,archived:true});
});
export default r;
