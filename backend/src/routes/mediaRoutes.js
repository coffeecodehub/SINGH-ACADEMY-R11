import {effectiveCourseEnrollment} from '../services/courseEntitlements.js';
import {realAccessFilter,activeEnrollmentWindow} from '../utils/commerce.js';
import {Router} from 'express';
import mongoose from 'mongoose';
import {resolveSession} from '../middleware/auth.js';
import {validPortal,configuredOrigins} from '../utils/security.js';
import SiteContent from '../models/SiteContent.js';
import User from '../models/User.js';
import StudentFile from '../models/StudentFile.js';
import PaymentAttachment from '../models/PaymentAttachment.js';
import Course from '../models/Course.js';
import Section from '../models/Section.js';
import PageSection from '../models/PageSection.js';
import VideoReview from '../models/VideoReview.js';
import {effectiveSectionAccess} from '../services/sectionAccess.js';
import TeamMember from '../models/TeamMember.js';
import Event from '../models/Event.js';
import Lesson from '../models/Lesson.js';
import Module from '../models/Module.js';
import Enrollment from '../models/Enrollment.js';
import Subscription from '../models/Subscription.js';
import {normalizeRole} from '../middleware/auth.js';
import {lessonMediaQuery} from '../utils/media.js';
import {httpError,parseByteRange} from '../utils/cmsValidation.js';
import {isPublicImageReference} from '../services/publicImageReferences.js';
import {imageWidth,publicImageVariant} from '../services/imageVariants.js';
import {queueVideoReviewPlayback,videoReviewPlaybackFile} from '../services/videoReviewPlayback.js';
const r=Router();
const reviewPosterFallback='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="#29221c"/><circle cx="480" cy="300" r="48" fill="#f5f0e9"/><path d="M468 275l35 25-35 25z" fill="#9f6b40"/></svg>';
async function optionalUser(req){
 const portal=typeof req.query?.portal==='string'?req.query.portal:'student';
 if(!validPortal(portal))return null;
 const found=await resolveSession(req,portal);
 return found&&!found.session.setupOnly?found.user:null;
}
async function visibleTo(req,id,user){
  if(['client_admin','super_admin'].includes(normalizeRole(user?.role)))return true;
  const publicRefs=await Promise.all([
    Course.exists({published:true,$or:[{thumbnailFileId:id},{'gallery.fileId':id}]}),
    TeamMember.exists({active:true,imageFileId:String(id)}),Event.exists({status:'published',imageFileId:String(id)}),SiteContent.exists({key:'websiteContent','value.images.fileId':String(id)}),
    Section.exists({published:true,archivedAt:null,thumbnailFileId:id}),PageSection.exists({blocks:{$elemMatch:{published:true,$or:[{imageFileId:String(id)},{videoFileId:String(id)},{'gallery':{$elemMatch:{imageFileId:String(id),imageUrl:'/api/media/'+String(id)}}}]}}})
  ]);
  if(publicRefs.some(Boolean))return true;
  const lessons=await Lesson.find({published:{$ne:false},...lessonMediaQuery(id)}).select('module preview').lean();
  if(!lessons.length)return false;
  const modules=await Module.find({_id:{$in:lessons.map(l=>l.module)}}).select('course').lean();
  const courses=await Course.find({_id:{$in:modules.map(m=>m.course)},published:true}).select('slug sectionSlug accessType').lean();
  for(const course of courses){
    const moduleIds=modules.filter(m=>String(m.course)===String(course._id)).map(m=>String(m._id));
    if(lessons.some(l=>l.preview&&moduleIds.includes(String(l.module))))return true;
    if(!user)continue;
    if(course.accessType==='free')return true;
    const now=new Date();
    if(await effectiveCourseEnrollment(user._id,course.slug,null,{now}))return true;
    if(course.sectionSlug&&await effectiveSectionAccess(user._id,course.sectionSlug,null,{now}))return true;
    if(await Subscription.exists({user:user._id,status:'active',...realAccessFilter(),startsAt:{$lte:now},endsAt:{$gt:now}}))return true;
  }
  return false;
}
r.get('/:id',async(req,res,next)=>{
  if(!mongoose.isValidObjectId(req.params.id))throw httpError(400,'Invalid media identifier.');
  const id=new mongoose.Types.ObjectId(req.params.id);let user=null;
  
  const bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'}),files=await bucket.find({_id:id}).toArray();
  if(!files.length)throw httpError(404,'Media not found.');
  const file=files[0];let servingId=id,total=file.length,type=file.contentType||'application/octet-stream';
  if(file.metadata?.purpose==='video-review-playback')throw httpError(404,'Media not found.');
  // Published catalog photos are not learner files. Skip two auth lookups per photo.
  const cmsImage=(!file.metadata?.purpose||['cms','cms-page-section'].includes(file.metadata.purpose))&&/^image\/(jpeg|png|webp|gif)$/.test(type);
  const publicImage=cmsImage&&await isPublicImageReference(id);
  // Dedicated review uploads are public only while an exact published review
  // references them. Paid-course/CMS/private upload purposes never enter here.
  const reviewVideo=file.metadata?.purpose==='video-review'&&/^video\/(mp4|webm|quicktime)$/.test(type);
  const publicReviewVideo=reviewVideo&&await VideoReview.exists({published:true,videoFileId:String(id),videoUrl:'/api/media/'+String(id)});
  if(!publicImage&&!publicReviewVideo)user=await optionalUser(req);
  if(file.metadata?.purpose==='payment-receipt'){
    const owned=user&&await PaymentAttachment.exists({fileId:id,...(user.role==='student'?{user:user._id}:{})});
    if(!owned||!['student','client_admin'].includes(user?.role))throw httpError(user?403:401,'This receipt screenshot is private to its owner and Academy administrator.');
  }else if(file.metadata?.purpose==='student-assessment'){
    const owned=user&&user.role==='student'&&await StudentFile.exists({fileId:id,user:user._id});
    if(!owned&&user?.role!=='client_admin')throw httpError(user?403:401,'This assignment file is private to its student and Academy reviewer.');
  }else if(reviewVideo){
    if(!publicReviewVideo&&!['client_admin','super_admin'].includes(normalizeRole(user?.role)))throw httpError(user?403:401,'This video review is not published.');
  }else if(!publicImage&&!await visibleTo(req,id,user))throw httpError(user?403:401,'Sign in with course access to open this file.');
  const safeName=String(file.filename||'download').replace(/[^a-zA-Z0-9._-]/g,'_'),forceDownload=['1','true','yes'].includes(String(req.query?.download||'').toLowerCase());
  if(reviewVideo&&!forceDownload&&(req.query.preview==='1'||req.query.poster==='1')){
   const kind=req.query.poster==='1'?'poster':'preview',variant=await videoReviewPlaybackFile(mongoose.connection.db,file,kind);
   // Unversioned preview URLs always retain original bytes. The review DTO
   // supplies a prepared rendition ID so every Range request stays on one file,
   // including players mounted before background preparation completed.
   const rendition=kind==='preview'?req.query.rendition:undefined;
   if(kind==='preview'&&rendition!==undefined&&rendition!==String(id)&&(!variant||rendition!==String(variant._id)))throw httpError(404,'Media not found.');
   if(variant&&(kind==='poster'||rendition===String(variant._id))){servingId=variant._id;total=variant.length;type=variant.contentType;}
   else if(!variant){
    queueVideoReviewPlayback(mongoose.connection.db,id);
    if(kind==='poster')return res.set('Content-Type','image/svg+xml').set('X-Content-Type-Options','nosniff').set('Cache-Control','private, no-store').send(reviewPosterFallback);
   }
  }
  // Other existing CMS video callers share ReviewVideo but have no review
  // derivatives. Keep an authorized lightweight poster instead of video bytes.
  if(!reviewVideo&&!forceDownload&&req.query.poster==='1'&&/^video\//.test(type))return res.set('Content-Type','image/svg+xml').set('X-Content-Type-Options','nosniff').set('Cache-Control','private, no-store').send(reviewPosterFallback);
  res.set('Accept-Ranges','bytes');res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','private, no-store');res.set('Content-Type',type);
  if(publicImage&&!forceDownload){
   res.set('Cache-Control','private, max-age=300');res.set('X-SA-Public-Image','1');
   const width=imageWidth(req.query?.w);
   if(width&&!req.headers.range){
    const etag='"sa-photo-'+String(id)+'-'+width+'-v1"';
    // The immutable GridFS ID/width identifies the derivative. Current public
    // authorization above still runs before a conditional cache response.
    if(req.headers['if-none-match']===etag)return res.status(304).set('ETag',etag).end();
    let body=null;try{body=await publicImageVariant(bucket,id,file,width);}catch{console.warn(JSON.stringify({event:'image_variant_fallback',fileId:String(id)}));}
    if(body){res.set('Content-Type','image/webp');res.set('ETag',etag);res.set('Content-Length',String(body.length));return req.method==='HEAD'?res.end():res.send(body);}
   }
  }

  if(forceDownload){
    res.set('Content-Disposition',`attachment; filename="${safeName}"`);
    res.set('Content-Security-Policy',"sandbox; default-src 'none'");
  }else if(type==='application/pdf'){
    res.removeHeader('X-Frame-Options');res.set('Content-Disposition',`inline; filename="${safeName}"`);res.set('Content-Security-Policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self' "+configuredOrigins().join(' '));
  }else if(!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(type)){
    res.set('Content-Disposition',`attachment; filename="${safeName}"`);
    res.set('Content-Security-Policy',"sandbox; default-src 'none'");
  }
  const sendStream=options=>{
    if(req.method==='HEAD')return res.end();
    const input=bucket.openDownloadStream(servingId,options);
    const abort=()=>input.destroy();res.once('close',abort);
    input.once('error',error=>{res.removeListener('close',abort);if(res.headersSent)res.destroy();else next(error);});
    input.once('end',()=>res.removeListener('close',abort));input.pipe(res);return input;
  };
  if(req.headers.range){
    const range=parseByteRange(req.headers.range,total);
    if(!range)return res.status(416).set('Content-Range',`bytes */${total}`).end();
    const {start,end}=range;res.status(206).set('Content-Range',`bytes ${start}-${end}/${total}`).set('Content-Length',String(end-start+1));
    return sendStream({start,end:end+1});
  }
  res.set('Content-Length',String(total));return sendStream();
});
export default r;
