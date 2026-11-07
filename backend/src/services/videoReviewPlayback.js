import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pipeline} from 'node:stream/promises';
import mongoose from 'mongoose';
const execute=promisify(execFile),pending=new Map(),attempts=new Map();
let capability=null,running=false;
const bucketFor=db=>new mongoose.mongo.GridFSBucket(db,{bucketName:'academyMedia',timeoutMS:60000});
/** Optional host capability, never an environment/key change or a scanner bypass. */
export async function videoPlaybackCapability(){
 if(!capability)capability=execute('ffmpeg',['-version'],{timeout:5000,maxBuffer:65536,windowsHide:true}).then(()=>true,()=>false);
 return capability;
}
async function createPlayback(db,id){
 const bucket=bucketFor(db),files=db.collection('academyMedia.files'),original=await files.findOne({_id:id},{timeoutMS:10000});
 if(original?.metadata?.purpose!=='video-review'||original.metadata.playback?.version===1)return;
 if(!await videoPlaybackCapability())return;
 const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'sa-review-playback-')),created=[];
 try{
  const input=path.join(dir,'original'),preview=path.join(dir,'preview.mp4'),poster=path.join(dir,'poster.jpg');
  await pipeline(bucket.openDownloadStream(id),fs.createWriteStream(input));
  // Only a short web preview is transcoded; the scanned full original stays exact.
  await execute('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-max_alloc','67108864','-protocol_whitelist','file,pipe','-threads','1','-i',input,'-t','20','-map','0:v:0','-an','-vf','scale=trunc(min(960\\,iw)/2)*2:-2','-c:v','libx264','-preset','veryfast','-crf','27','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-y',preview],{timeout:90000,maxBuffer:65536,windowsHide:true});
  await execute('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-max_alloc','67108864','-protocol_whitelist','file,pipe','-threads','1','-i',preview,'-frames:v','1','-q:v','3','-threads','1','-y',poster],{timeout:15000,maxBuffer:65536,windowsHide:true});
  const playback={version:1,createdAt:new Date()};
  for(const [kind,file,contentType]of [['preview',preview,'video/mp4'],['poster',poster,'image/jpeg']]){
   const stream=bucket.openUploadStream('review-'+kind+'.'+(kind==='preview'?'mp4':'jpg'),{contentType,metadata:{purpose:'video-review-playback',parentFileId:String(id),kind,version:1}});created.push(stream.id);
   await pipeline(fs.createReadStream(file),stream);playback[kind+'FileId']=String(stream.id);
  }
  const committed=await files.updateOne({_id:id,'metadata.purpose':'video-review','metadata.playback.version':{$ne:1}},{$set:{'metadata.playback':playback}},{timeoutMS:10000});
  if(!committed.modifiedCount)throw new Error('original_changed');
  created.length=0;
 }catch(error){
  console.warn(JSON.stringify({event:'review_playback_fallback',fileId:String(id),reason:error?.code==='ENOENT'?'ffmpeg_unavailable':'processing_failed'}));
 }finally{
  // Includes incomplete chunks when a child process/storage operation fails.
  for(const child of created)await bucket.delete(child).catch(async()=>{await db.collection('academyMedia.chunks').deleteMany({files_id:child},{timeoutMS:10000}).catch(()=>{});});
  await fs.promises.rm(dir,{recursive:true,force:true}).catch(()=>{});
 }
}
async function drain(){
 if(running)return;running=true;
 try{while(pending.size){const [key,job]=pending.entries().next().value;try{await createPlayback(job.db,job.id);}catch{console.warn(JSON.stringify({event:'review_playback_fallback',fileId:key,reason:'storage_unavailable'}));}finally{pending.delete(key);}}}finally{running=false;}
}
/** Bounded one-worker queue; uploads return 201 before optional transcoding. */
export function queueVideoReviewPlayback(db,id){
 const key=String(id);if(!db||pending.has(key)||pending.size>=8||Date.now()-(attempts.get(key)||0)<60*60*1000)return false;
 if(attempts.size>=500)attempts.delete(attempts.keys().next().value);attempts.set(key,Date.now());
 pending.set(key,{db,id});void drain();return true;
}
export async function awaitVideoReviewPlayback(){while(running)await new Promise(resolve=>setTimeout(resolve,20));}
/** Derivatives are looked up only after the original's current access check. */
export async function videoReviewPlaybackFile(db,original,kind){
 const reference=original.metadata?.playback?.[kind+'FileId'];if(!mongoose.isValidObjectId(reference))return null;
 return db.collection('academyMedia.files').findOne({_id:new mongoose.Types.ObjectId(reference),'metadata.purpose':'video-review-playback','metadata.parentFileId':String(original._id),'metadata.kind':kind},{timeoutMS:10000});
}
/** One bounded projection for the review list, never one lookup per card. */
export async function videoReviewPreviewRenditions(db,ids){
 const selected=[...new Set(ids)].filter(id=>/^[a-f0-9]{24}$/.test(id)).slice(0,100);
 if(!selected.length)return new Map();
 const files=await db.collection('academyMedia.files').find({_id:{$in:selected.map(id=>new mongoose.Types.ObjectId(id))},'metadata.purpose':'video-review'}, {projection:{_id:1,'metadata.playback.previewFileId':1},timeoutMS:10000}).toArray();
 return new Map(files.map(file=>{const preview=file.metadata?.playback?.previewFileId;return [String(file._id),/^[a-f0-9]{24}$/.test(preview||'')?preview:String(file._id)];}));
}
