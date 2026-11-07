import {Router} from 'express';
import mongoose from 'mongoose';
import VideoReview from '../models/VideoReview.js';
import {requireAuth,requireRole} from '../middleware/auth.js';
import {rateLimit} from '../middleware/rateLimit.js';
import {uploadAdmission,uploadSingle} from '../services/uploads.js';
import {storeVideoReviewUpload} from '../services/videoReviewUploads.js';
import {uploadAvailability} from '../utils/uploadAvailability.js';
import {httpError} from '../utils/cmsValidation.js';
import {validateVideoReview,reviewRevision,publicVideoReview,adminVideoReview} from '../utils/videoReviews.js';
import {catalogCache} from '../services/catalogCache.js';
import {videoReviewPreviewRenditions} from '../services/videoReviewPlayback.js';
export async function assertVideoReviewMedia(item){
 if(!item.videoFileId)return;
 const bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'});
 const [file]=await bucket.find({_id:new mongoose.Types.ObjectId(item.videoFileId)}).toArray();
 if(!file||file.metadata?.purpose!=='video-review'||!/^video\/(mp4|webm|quicktime)$/.test(file.contentType||''))throw httpError(400,'Upload the original through Video reviews. Course videos and private files cannot be published here.');
}
function identifier(value){if(!/^[a-f0-9]{24}$/.test(value))throw httpError(400,'Invalid video review identifier.');return value;}
export function createVideoReviewRouters({model=VideoReview,authenticate=requireAuth,checkMedia=assertVideoReviewMedia,limitRequests=rateLimit,cache=model===VideoReview?catalogCache:null,loadRenditions=model===VideoReview?ids=>videoReviewPreviewRenditions(mongoose.connection.db,ids):async()=>new Map()}={}){
 const publicRouter=Router(),adminRouter=Router();
 const serialize=async items=>{const ids=items.flatMap(item=>{const match=item.videoUrl?.match(/^\/api\/media\/([a-f0-9]{24})$/);return match&&item.videoFileId===match[1]?[match[1]]:[];}),renditions=ids.length?await loadRenditions(ids):new Map();return items.map(item=>publicVideoReview(item,renditions.get(item.videoFileId)));};
 publicRouter.get('/',async(req,res)=>{const load=async()=>serialize(await model.find({published:true}).sort({order:1,createdAt:-1,_id:1}).limit(100).lean());const items=cache?await cache.get('public-video-reviews',load,10000):await load();res.set('Cache-Control','private, no-store').json({success:true,items});});
 publicRouter.get('/:id',async(req,res)=>{const item=await model.findOne({_id:identifier(req.params.id),published:true}).lean();if(!item)throw httpError(404,'Video review not found.');res.set('Cache-Control','private, no-store').json({success:true,item:(await serialize([item]))[0]});});
 adminRouter.use(authenticate,requireRole('client_admin','super_admin'));
 adminRouter.get('/upload-status',(req,res)=>res.set('Cache-Control','private, no-store').json({success:true,upload:uploadAvailability()}));
 adminRouter.post('/upload',limitRequests('video-review-upload',20,60000,{authenticated:true}),uploadAdmission,uploadSingle,storeVideoReviewUpload);
 adminRouter.get('/',async(req,res)=>{const items=await model.find({}).sort({order:1,createdAt:-1,_id:1}).limit(200).lean();res.set('Cache-Control','private, no-store').json({success:true,items:items.map(adminVideoReview)});});
 adminRouter.post('/',limitRequests('video-review-save',60,60000,{authenticated:true}),async(req,res)=>{const value=validateVideoReview(req.body);await checkMedia(value);const item=await model.create({...value,revision:1,createdBy:req.user._id,updatedBy:req.user._id});cache?.clear();res.status(201).json({success:true,item:adminVideoReview(item)});});
 adminRouter.patch('/:id',limitRequests('video-review-save',60,60000,{authenticated:true}),async(req,res)=>{
  const id=identifier(req.params.id),revision=reviewRevision(req.body?.revision),value=validateVideoReview(req.body);await checkMedia(value);
  const item=await model.findOneAndUpdate({_id:id,revision},{$set:{...value,updatedBy:req.user._id},$inc:{revision:1}},{new:true,runValidators:true});
  if(!item)throw httpError(409,'This review changed or was deleted. Reload before saving.');cache?.clear();res.json({success:true,item:adminVideoReview(item)});
 });
 adminRouter.delete('/:id',limitRequests('video-review-save',60,60000,{authenticated:true}),async(req,res)=>{const item=await model.findOneAndDelete({_id:identifier(req.params.id),revision:reviewRevision(req.body?.revision)});if(!item)throw httpError(409,'This review changed or was deleted. Reload before deleting.');cache?.clear();res.json({success:true});});
 return {publicRouter,adminRouter};
}
const routers=createVideoReviewRouters();
export const publicVideoReviewRouter=routers.publicRouter;
export const adminVideoReviewRouter=routers.adminRouter;
