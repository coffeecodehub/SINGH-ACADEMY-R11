import {Router} from 'express';
import mongoose from 'mongoose';
import PageSection from '../models/PageSection.js';
import {requireAuth,requireRole} from '../middleware/auth.js';
import {rateLimit} from '../middleware/rateLimit.js';
import {httpError} from '../utils/cmsValidation.js';
import {pageKey,validatePageSections,publishedPageSections} from '../utils/pageSections.js';
import {uploadAdmission,uploadSingle} from '../services/uploads.js';
import {storePageSectionUpload} from '../services/pageSectionUploads.js';
import {uploadAvailability} from '../utils/uploadAvailability.js';
import {catalogCache} from '../services/catalogCache.js';
export async function assertPageSectionMedia(blocks){
 const ids=[...new Set(blocks.flatMap(block=>[block.imageFileId,block.videoFileId,...(block.gallery||[]).flatMap(image=>[image.imageFileId,image.originalFileId])]).filter(Boolean))];if(!ids.length)return;
 const bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'});
 const files=await bucket.find({_id:{$in:ids.map(id=>new mongoose.Types.ObjectId(id))}}).toArray();
 for(const id of ids){const file=files.find(item=>String(item._id)===id);if(!file||!['cms','cms-page-section'].includes(file.metadata?.purpose))throw httpError(400,'Page media must come from the website media uploader. Private learner files cannot be published.');}
 for(const block of blocks){for(const item of block.gallery||[])for(const id of [item.imageFileId,item.originalFileId].filter(Boolean)){const file=files.find(file=>String(file._id)===id);if(!/^image\/(jpeg|png|webp|gif)$/.test(file?.contentType||''))throw httpError(400,'Gallery media must be an uploaded image.');}const image=files.find(file=>String(file._id)===block.imageFileId),video=files.find(file=>String(file._id)===block.videoFileId);if(image&&!/^image\/(jpeg|png|webp|gif)$/.test(image.contentType||'')||video&&!/^video\/(mp4|webm|quicktime)$/.test(video.contentType||''))throw httpError(400,'The uploaded media type does not match this page section.');}
}
export function createPageSectionRouters({model=PageSection,authenticate=requireAuth,checkMedia=assertPageSectionMedia,limitRequests=rateLimit,cache=model===PageSection?catalogCache:null}={}){
 const publicRouter=Router(),adminRouter=Router();
 publicRouter.get('/:page',async(req,res)=>{const key=pageKey(req.params.page),load=async()=>publishedPageSections(await model.findById(key).select('blocks').lean()),blocks=cache?await cache.get('page-sections:'+key,load,10000):await load();res.set('Cache-Control','private, no-store').json({success:true,pageKey:key,blocks});});
 adminRouter.use(authenticate,requireRole('super_admin'));
 adminRouter.get('/upload-status',(req,res)=>res.set('Cache-Control','private, no-store').json({success:true,upload:uploadAvailability()}));
 adminRouter.post('/upload',limitRequests('page-section-upload',30,60000,{authenticated:true}),uploadAdmission,uploadSingle,storePageSectionUpload);
 adminRouter.get('/:page',async(req,res)=>{const key=pageKey(req.params.page),doc=await model.findById(key).lean();res.set('Cache-Control','private, no-store').json({success:true,pageKey:key,revision:doc?.revision||0,blocks:doc?.blocks||[]});});
 adminRouter.put('/:page',limitRequests('page-section-save',60,60000,{authenticated:true}),async(req,res)=>{
  const key=pageKey(req.params.page),body=validatePageSections(req.body);await checkMedia(body.blocks);let doc;
  try{doc=await model.findOneAndUpdate({_id:key,revision:body.revision},{$set:{pageKey:key,blocks:body.blocks,updatedBy:req.user._id},$inc:{revision:1}},{new:true,runValidators:true});if(!doc&&body.revision===0)doc=await model.create({_id:key,pageKey:key,blocks:body.blocks,updatedBy:req.user._id,revision:1});}
  catch(error){if(error.code===11000)throw httpError(409,'Another editor saved this page. Reload before saving your changes.');throw error;}
  if(!doc)throw httpError(409,'Another editor saved this page. Reload before saving your changes.');
  cache?.clear();
  res.json({success:true,pageKey:key,revision:doc.revision,blocks:doc.blocks});
 });
 return {publicRouter,adminRouter};
}
const routers=createPageSectionRouters();
export const publicPageSectionRouter=routers.publicRouter;
export const adminPageSectionRouter=routers.adminRouter;
