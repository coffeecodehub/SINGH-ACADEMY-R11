import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import {isolatedDatabase,testEnvironment} from './isolation.js';
import VideoReview from '../src/models/VideoReview.js';
import mediaRoutes from '../src/routes/mediaRoutes.js';
import {createVideoReviewRouters} from '../src/routes/videoReviewRoutes.js';
import {videoPlaybackCapability,queueVideoReviewPlayback,awaitVideoReviewPlayback} from '../src/services/videoReviewPlayback.js';
const execute=promisify(execFile),sha=buffer=>createHash('sha256').update(buffer).digest('hex');
async function bytes(bucket,id){const all=[];for await(const chunk of bucket.openDownloadStream(id))all.push(chunk);return Buffer.concat(all);}
test('R9 actual FFmpeg/Mongo/HTTP: scanned upload, faststart preview, posters, authorization and failure cleanup',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();assert.equal(await videoPlaybackCapability(),true,'this integration requires the optional local FFmpeg capability');
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:true,serverSelectionTimeoutMS:10000,monitorCommands:true});const db=mongoose.connection.db,bucket=new mongoose.mongo.GridFSBucket(db,{bucketName:'academyMedia'}),dir=await fs.mkdtemp(path.join(os.tmpdir(),'sa-r9-playback-test-'));
 t.after(async()=>{await awaitVideoReviewPlayback();await isolated.cleanup(mongoose);await mongoose.disconnect();await fs.rm(dir,{recursive:true,force:true});});
 const originalPath=path.join(dir,'tail-moov.mp4');await execute('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-i',new URL('../../frontend/ui-tests/fixtures/video-review.webm',import.meta.url).pathname,'-t','22','-c:v','libx264','-pix_fmt','yuv420p','-threads','1','-y',originalPath],{timeout:30000});const original=await fs.readFile(originalPath);assert.ok(original.indexOf('moov')>original.indexOf('mdat'),'fixture must reproduce original MP4 metadata at the end');
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.cookies={};next();});const {adminRouter,publicRouter}=createVideoReviewRouters({cache:null,authenticate:(req,res,next)=>{req.user={_id:new mongoose.Types.ObjectId(),role:'client_admin',normalizedRole:'client_admin'};next();},limitRequests:()=>((req,res,next)=>next())});app.use('/admin',adminRouter);app.use('/public',publicRouter);app.use('/api/media',mediaRoutes);app.use((error,req,res,next)=>res.status(error.status||500).json({success:false,code:error.code,message:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const origin='http://127.0.0.1:'+server.address().port;
 let uploaded,review,originalFile,legacyReview,legacyFile;
 await t.test('original upload returns 201 then background processing preserves full SHA and stores small independent media',async()=>{
  const form=new FormData();form.append('file',new Blob([original],{type:'video/mp4'}),'original-full.mp4');const response=await fetch(origin+'/admin/upload',{method:'POST',body:form});assert.equal(response.status,201);uploaded=await response.json();assert.equal(uploaded.originalBytesPreserved,true);
  await awaitVideoReviewPlayback();originalFile=await db.collection('academyMedia.files').findOne({_id:new mongoose.Types.ObjectId(uploaded.fileId)});assert.equal(sha(await bytes(bucket,originalFile._id)),sha(original));assert.equal(originalFile.metadata.playback.version,1);assert.equal(originalFile.metadata.scan.status,'not-scanned-development');
  const preview=await db.collection('academyMedia.files').findOne({_id:new mongoose.Types.ObjectId(originalFile.metadata.playback.previewFileId)}),body=await bytes(bucket,preview._id);assert.equal(preview.chunkSize,255*1024);assert.equal(preview.contentType,'video/mp4');assert.ok(body.indexOf('moov')<body.indexOf('mdat'),'web teaser metadata must precede frame data');
  const previewPath=path.join(dir,'web-preview.mp4');await fs.writeFile(previewPath,body);const probe=JSON.parse((await execute('ffprobe',['-v','error','-show_entries','stream=codec_name,pix_fmt:format=duration','-of','json',previewPath],{timeout:10000})).stdout);assert.equal(probe.streams[0].codec_name,'h264');assert.equal(probe.streams[0].pix_fmt,'yuv420p');assert.ok(Number(probe.format.duration)<=20.2);
 });
 await t.test('unpublished original and both derived requests remain private; raw derivative IDs are never public',async()=>{
  for(const suffix of ['', '?preview=1','?poster=1'])assert.equal((await fetch(origin+uploaded.url+suffix)).status,401);
  assert.equal((await fetch(origin+'/api/media/'+originalFile.metadata.playback.posterFileId)).status,404);
  review=await VideoReview.create({title:'Published local review',videoUrl:uploaded.url,videoFileId:uploaded.fileId,published:true});
 });
 await t.test('published poster is JPEG; teaser streams correct exact206/HEAD and original download is unchanged',async()=>{
  let response=await fetch(origin+uploaded.url+'?poster=1');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^image\/jpeg/);assert.deepEqual(Buffer.from(await response.arrayBuffer()).subarray(0,2),Buffer.from([255,216]));
  const item=(await(await fetch(origin+'/public/'+review._id)).json()).item;assert.equal(item.previewRendition,originalFile.metadata.playback.previewFileId);
  const previewUrl=origin+item.videoUrl+'?preview=1&rendition='+item.previewRendition,id=new mongoose.Types.ObjectId(item.previewRendition),body=await bytes(bucket,id);response=await fetch(previewUrl,{headers:{Range:'bytes=5-29'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 5-29/${body.length}`);assert.equal(response.headers.get('content-length'),'25');assert.match(response.headers.get('content-type'),/^video\/mp4/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),body.subarray(5,30));
  response=await fetch(previewUrl,{method:'HEAD',headers:{Range:'bytes=0-99'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-length'),'100');assert.equal((await response.arrayBuffer()).byteLength,0);
  response=await fetch(previewUrl,{headers:{Range:'bytes=999999999-'}});assert.equal(response.status,416);
  response=await fetch(origin+uploaded.url+'?preview=1&download=1');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment/);assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(original));
  await VideoReview.updateOne({_id:review._id},{$set:{published:false}});for(const suffix of ['', '?preview=1','?poster=1'])assert.equal((await fetch(origin+uploaded.url+suffix)).status,401);
 });
 await t.test('legacy preview pins original byte ranges while background processing completes; new playback selects its derivative',async()=>{
  const stream=bucket.openUploadStream('legacy.mp4',{contentType:'video/mp4',metadata:{purpose:'video-review'}});stream.end(original);await once(stream,'finish');const url='/api/media/'+stream.id,legacy=await VideoReview.create({title:'Legacy review',videoUrl:url,videoFileId:String(stream.id),published:true});
  const initial=(await(await fetch(origin+'/public/'+legacy._id)).json()).item;assert.equal(initial.previewRendition,String(stream.id));const pinned=url+'?preview=1&rendition='+initial.previewRendition;let response;
  response=await fetch(origin+pinned,{headers:{Range:'bytes=0-79'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 0-79/${original.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),original.subarray(0,80));
  await awaitVideoReviewPlayback();const prepared=await db.collection('academyMedia.files').findOne({_id:stream.id});assert.equal(prepared.metadata.playback.version,1);legacyReview=legacy;legacyFile=prepared;
  response=await fetch(origin+pinned,{headers:{Range:'bytes=80-159'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 80-159/${original.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),original.subarray(80,160));
  response=await fetch(origin+pinned,{method:'HEAD',headers:{Range:'bytes=80-159'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 80-159/${original.length}`);assert.equal(response.headers.get('content-length'),'80');
  response=await fetch(origin+url+'?preview=1',{headers:{Range:'bytes=80-159'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 80-159/${original.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),original.subarray(80,160));
  const ready=(await(await fetch(origin+'/public/'+legacy._id)).json()).item;assert.equal(ready.previewRendition,prepared.metadata.playback.previewFileId);const derivedUrl=url+'?preview=1&rendition='+ready.previewRendition;
  response=await fetch(origin+derivedUrl,{headers:{Range:'bytes=80-159'}});const derivative=await bytes(bucket,new mongoose.Types.ObjectId(ready.previewRendition));assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 80-159/${derivative.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),derivative.subarray(80,160));
  for(const suffix of ['?preview=1&rendition='+originalFile.metadata.playback.previewFileId,'?preview=1&rendition=invalid'])assert.equal((await fetch(origin+url+suffix)).status,404);
  assert.equal((await fetch(origin+'/api/media/'+prepared.metadata.playback.previewFileId)).status,404);
  response=await fetch(origin+derivedUrl+'&download=1');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment/);assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(original));
  await VideoReview.updateOne({videoFileId:String(stream.id)},{$set:{published:false}});for(const resource of [pinned,derivedUrl])assert.equal((await fetch(origin+resource)).status,401);
 });
 await t.test('the public list selects ready renditions with one bounded metadata projection and keeps the full original URLs',async()=>{
  await VideoReview.updateMany({_id:{$in:[review._id,legacyReview._id]}},{$set:{published:true}});
  const client=mongoose.connection.getClient(),queries=[],observe=event=>{if(event.commandName==='find'&&event.command.find==='academyMedia.files')queries.push(event.command);};client.on('commandStarted',observe);let items;
  try{const response=await fetch(origin+'/public');assert.equal(response.status,200);items=(await response.json()).items;}finally{client.off('commandStarted',observe);}
  assert.equal(queries.length,1);assert.deepEqual(queries[0].filter._id.$in.map(String).sort(),[String(originalFile._id),String(legacyFile._id)].sort());assert.equal(queries[0].filter['metadata.purpose'],'video-review');assert.deepEqual(queries[0].projection,{_id:1,'metadata.playback.previewFileId':1});assert.equal(items.length,2);
  for(const file of [originalFile,legacyFile]){const item=items.find(item=>item.videoUrl==='/api/media/'+file._id);assert.equal(item.previewRendition,file.metadata.playback.previewFileId);assert.equal(item.videoFileId,undefined);assert.equal(item.metadata,undefined);}
 });
 await t.test('failure after derived files were uploaded removes every child metadata/chunk while retaining scanned original',async()=>{
  const stream=bucket.openUploadStream('failure-fixture.mp4',{contentType:'video/mp4',metadata:{purpose:'video-review'}});stream.end(original);await once(stream,'finish');
  const failingDb=new Proxy(db,{get(target,key){if(key==='collection')return(name,...args)=>{const collection=target.collection(name,...args);if(name!=='academyMedia.files')return collection;return new Proxy(collection,{get(inner,field){if(field==='updateOne')return async()=>{throw new Error('synthetic_parent_commit_failure');};const value=Reflect.get(inner,field);return typeof value==='function'?value.bind(inner):value;}});};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  assert.equal(queueVideoReviewPlayback(failingDb,stream.id),true);await awaitVideoReviewPlayback();assert.equal(await db.collection('academyMedia.files').countDocuments({'metadata.parentFileId':String(stream.id)}),0);const all=await db.collection('academyMedia.files').find({}).project({_id:1}).toArray();assert.equal(await db.collection('academyMedia.chunks').countDocuments({files_id:{$nin:all.map(file=>file._id)}}),0);assert.equal(sha(await bytes(bucket,stream.id)),sha(original));
 });
});
