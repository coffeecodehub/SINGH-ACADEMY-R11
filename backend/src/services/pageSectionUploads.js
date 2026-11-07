import {adminVideoStorageOptions} from '../utils/adminVideoStorage.js';
import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import mongoose from 'mongoose';
import sharp from 'sharp';
import {scanFile} from './uploadScan.js';
import {validateSignature} from '../utils/fileSignature.js';
import {httpError} from '../utils/cmsValidation.js';
import {uploadStorageTimeout,uploadStorageFailure,removeIncompleteAdminUpload} from '../utils/uploadStorage.js';
// This explicit super-admin CMS path stores the scanned original bytes. It never resizes or re-encodes the source.
export async function storePageSectionUpload(req,res,next){
 req.uploadProcessing=true;const abort=new AbortController();let stream,stored=false;
 const disconnected=()=>{if(!res.writableEnded)abort.abort();};res.once('close',disconnected);
 try{
  const file=req.file;if(!file||!file.size)throw httpError(400,'Choose a non-empty image or video.');
  const bytes=await fs.promises.open(file.path,'r');let head,tail;
  try{head=Buffer.alloc(Math.min(file.size,65536));tail=Buffer.alloc(Math.min(file.size,131072));await bytes.read(head,0,head.length,0);await bytes.read(tail,0,tail.length,Math.max(0,file.size-tail.length));}finally{await bytes.close();}
  const mime=validateSignature(head,tail,file.mimetype);
  if(!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(mime))throw httpError(400,'Page sections support JPG, PNG, WebP, GIF, MP4, WebM and MOV.');
  let width,height;
  if(mime.startsWith('image/')){
   const metadata=await sharp(file.path,{limitInputPixels:false,failOn:'warning',animated:false}).metadata();
   width=metadata.width;height=metadata.height;
   if(!width||!height)throw httpError(400,'Choose a valid image with readable dimensions.');
  }
  const scan=await scanFile(file.path,{signal:abort.signal,mime,adminMedia:req.adminMediaUpload===true,request:req});
  if(abort.signal.aborted)throw httpError(499,'Upload cancelled.');
  const name=String(file.originalname||'page-media').replace(/[\x00-\x1f\x7f]/g,'').slice(0,150);
  const bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia',timeoutMS:uploadStorageTimeout(file.size)});
  stream=bucket.openUploadStream(name,{...adminVideoStorageOptions(req.adminMediaUpload,mime),contentType:mime,metadata:{purpose:'cms-page-section',uploadedBy:String(req.user._id),uploadedAt:new Date(),scan,signatureChecked:true,originalPixelsPreserved:true,width,height,originalSize:file.size}});
  await pipeline(fs.createReadStream(file.path),stream,{signal:abort.signal});stored=true;
  res.status(201).json({success:true,url:`/api/media/${stream.id}`,fileId:String(stream.id),name,mime,size:file.size,width,height,originalPixelsPreserved:true});
 }catch(error){
  if(stream&&!stored)await stream.abort().catch(()=>{});
  if(stream&&!stored)await removeIncompleteAdminUpload(mongoose.connection.db,stream.id).catch(()=>{});
  if(stream&&stored)await new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'}).delete(stream.id).catch(()=>{});
  if(!abort.signal.aborted&&!res.destroyed)next(error.status?error:uploadStorageFailure(error)?Object.assign(httpError(503,'The media storage service timed out. Check the upload service before retrying.'),{code:'UPLOAD_STORAGE_TIMEOUT'}):httpError(400,'The original file could not be verified. Choose a valid supported image or video.'));
 }finally{res.removeListener('close',disconnected);if(req.file?.path)await fs.promises.unlink(req.file.path).catch(()=>{});req.uploadProcessing=false;req.releaseUploadSlot?.();}
}
