import {pipeline} from 'node:stream/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createContentCache} from './catalogCache.js';
import {createImageWorkQueue} from './imageWorkQueue.js';
const BUFFERED_SOURCE_BYTES=10*1024*1024;
export function imageWidth(raw){return /^(240|480|720|1080|1600)$/.test(String(raw||''))?Number(raw):0;}
async function resize(original,width){
 const {default:sharp}=await import('sharp');
 return sharp(original,{limitInputPixels:25000000,animated:false}).rotate().resize({width,withoutEnlargement:true}).webp({quality:78,effort:3}).toBuffer();
}
async function resizeStream(source,width){
 // Sharp's Readable input internally collects encoded chunks. Use a private
 // temporary file for large originals instead so it can read from disk and the
 // Node process never accumulates a second full original in memory.
 const directory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'singh-image-'));
 try{
  const file=path.join(directory,'original');
  await pipeline(source,fs.createWriteStream(file,{flags:'wx',mode:0o600}),{signal:AbortSignal.timeout(30000)});
  const {default:sharp}=await import('sharp');
  return await sharp(file,{limitInputPixels:25000000,animated:false}).rotate().resize({width,withoutEnlargement:true}).webp({quality:78,effort:3}).toBuffer();
 }finally{await fs.promises.rm(directory,{recursive:true,force:true});}
}
/** Factory allows queue/cache tests without substituting the application route
 * or importing a fake production image library. */
export function createPublicImageVariantService({transform=resize,transformStream=resizeStream,clock=Date.now}={}){
 const variants=createContentCache({limit:80,maxBytes:24*1024*1024,clock});
 const sources=createContentCache({limit:12,maxBytes:16*1024*1024,clock});
 const jobs=createImageWorkQueue();
 return async function variant(bucket,id,file,width){
  // Current publication/ownership is still checked by mediaRoutes before this
  // cache. Never admit private receipt, assessment, review video or remote input.
  if(!imageWidth(width)||!Number.isSafeInteger(file.length)||file.length<=0||
    (file.metadata?.purpose&&!['cms','cms-page-section'].includes(file.metadata.purpose))||!/^image\/(jpeg|png|webp|gif)$/.test(file.contentType||''))return null;
  const revision=String(id)+':'+file.length+':'+String(file.uploadDate||'');
  return variants.get(revision+':'+width,()=>jobs.run(async()=>{
   if(file.length>BUFFERED_SOURCE_BYTES)return transformStream(bucket.openDownloadStream(id),width);
   // Small originals share a bounded byte cache across responsive widths.
   const original=await sources.get(revision,async()=>{
    const chunks=[];let length=0;
    for await(const chunk of bucket.openDownloadStream(id)){length+=chunk.length;if(length>BUFFERED_SOURCE_BYTES)throw new Error('Image source exceeded its buffered size');chunks.push(chunk);}
    return Buffer.concat(chunks);
   },60000,{cacheNull:false});
   return transform(original,width);
  }),300000,{cacheNull:false});
 };
}
/** Authorization runs on EVERY media request before either byte cache. */
export const publicImageVariant=createPublicImageVariantService();
