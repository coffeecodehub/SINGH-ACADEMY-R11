import {adminVideoStorageOptions} from '../utils/adminVideoStorage.js';
import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import mongoose from 'mongoose';
import {scanFile} from './uploadScan.js';
import {validateSignature} from '../utils/fileSignature.js';
import {httpError} from '../utils/cmsValidation.js';
import {uploadStorageTimeout,uploadStorageFailure,removeIncompleteAdminUpload} from '../utils/uploadStorage.js';
import {queueVideoReviewPlayback} from './videoReviewPlayback.js';
/** Scanned original video bytes, in a purpose separate from paid-course media. */
export async function storeVideoReviewUpload(req,res,next){
 req.uploadProcessing=true;const abort=new AbortController();let stream,stored=false,phase='signature';const began=Date.now();
 const disconnected=()=>{if(!res.writableEnded)abort.abort();};res.once('close',disconnected);
 try{
  const file=req.file;if(!file?.size)throw httpError(400,'Choose a non-empty MP4, WebM or MOV video.');
  const handle=await fs.promises.open(file.path,'r');let head,tail;
  try{head=Buffer.alloc(Math.min(file.size,65536));tail=Buffer.alloc(Math.min(file.size,131072));await handle.read(head,0,head.length,0);await handle.read(tail,0,tail.length,Math.max(0,file.size-tail.length));}finally{await handle.close();}
  const mime=validateSignature(head,tail,file.mimetype);
  if(!/^video\/(mp4|webm|quicktime)$/.test(mime))throw httpError(400,'Video reviews support MP4, WebM and MOV files.');
  phase='scan';const scan=await scanFile(file.path,{signal:abort.signal,mime,adminMedia:req.adminMediaUpload===true,request:req});if(abort.signal.aborted)throw httpError(499,'Upload cancelled.');
  const name=String(file.originalname||'video-review').replace(/[\x00-\x1f\x7f]/g,'').slice(0,150);
  phase='storage';const bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia',timeoutMS:uploadStorageTimeout(file.size)});
  stream=bucket.openUploadStream(name,{...adminVideoStorageOptions(req.adminMediaUpload,mime),contentType:mime,metadata:{purpose:'video-review',uploadedBy:String(req.user._id),uploadedAt:new Date(),scan,signatureChecked:true,originalBytesPreserved:true,originalSize:file.size}});
  await pipeline(fs.createReadStream(file.path),stream,{signal:abort.signal});stored=true;
  res.status(201).json({success:true,url:'/api/media/'+stream.id,fileId:String(stream.id),name,mime,size:file.size,originalBytesPreserved:true});
  console.info(JSON.stringify({event:'review_upload_complete',fileId:String(stream.id),bytes:file.size,durationMs:Date.now()-began}));
  queueVideoReviewPlayback(mongoose.connection.db,stream.id);
 }catch(error){
  if(stream&&!stored)await stream.abort().catch(()=>{});
  if(stream&&!stored)await removeIncompleteAdminUpload(mongoose.connection.db,stream.id).catch(()=>{});
  if(stream&&stored)await new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'}).delete(stream.id).catch(()=>{});
  console.warn(JSON.stringify({event:'review_upload_failed',phase,durationMs:Date.now()-began,code:error.code||error.name||'UPLOAD_FAILED'}));
  if(!abort.signal.aborted&&!res.destroyed){const failure=error.status?error:uploadStorageFailure(error)?Object.assign(httpError(503,'The video storage service timed out. Your original was not committed; please retry when the service is available.'),{code:'UPLOAD_STORAGE_TIMEOUT'}):httpError(400,'The original video could not be verified. Choose a supported video.');next(failure);}
 }finally{res.removeListener('close',disconnected);if(req.file?.path)await fs.promises.unlink(req.file.path).catch(()=>{});req.uploadProcessing=false;req.releaseUploadSlot?.();}
}
