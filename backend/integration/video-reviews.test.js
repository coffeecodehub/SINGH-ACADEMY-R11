import {awaitVideoReviewPlayback} from '../src/services/videoReviewPlayback.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {once} from 'node:events';
import express from 'express';
import mongoose from 'mongoose';
import {isolatedDatabase,testEnvironment} from './isolation.js';
import {createVideoReviewRouters} from '../src/routes/videoReviewRoutes.js';
import VideoReview from '../src/models/VideoReview.js';
import mediaRoutes from '../src/routes/mediaRoutes.js';
test('video reviews: exact scanned original, guest ranges, draft revocation and paid-course isolation',async t=>{
 const isolated=isolatedDatabase();testEnvironment();await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:true,serverSelectionTimeoutMS:10000});t.after(async()=>{await awaitVideoReviewPlayback();await isolated.cleanup(mongoose);await mongoose.disconnect();});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.cookies={};next();});
 const routes=createVideoReviewRouters({authenticate:(req,res,next)=>{req.user={_id:new mongoose.Types.ObjectId(),role:'client_admin',normalizedRole:'client_admin'};next();},limitRequests:()=>((req,res,next)=>next())});app.use('/admin',routes.adminRouter);app.use('/public',routes.publicRouter);app.use('/api/media',mediaRoutes);app.use((error,req,res,next)=>res.status(error.status||500).json({success:false,message:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const origin='http://127.0.0.1:'+server.address().port;
 const original=fs.readFileSync(new URL('../../frontend/ui-tests/fixtures/video-review.webm',import.meta.url));let uploaded,item;
 const save=(method,path,body)=>fetch(origin+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 await t.test('purpose-specific uploader stores every original byte without transcoding',async()=>{
  const form=new FormData();form.append('file',new Blob([original],{type:'video/webm'}),'original-review.webm');const response=await fetch(origin+'/admin/upload',{method:'POST',body:form});assert.equal(response.status,201);uploaded=await response.json();assert.equal(uploaded.originalBytesPreserved,true);
  const bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'}),[file]=await bucket.find({_id:new mongoose.Types.ObjectId(uploaded.fileId)}).toArray();assert.equal(file.metadata.purpose,'video-review');const chunks=[];for await(const chunk of bucket.openDownloadStream(file._id))chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),original);
 });
 const draft=()=>({title:'Original video review',description:'Public only after approval by an administrator.',videoUrl:uploaded.url,videoFileId:uploaded.fileId,teaserSeconds:15,order:0,published:false});
 await t.test('draft bytes remain private, then publishing enables full anonymous range playback',async()=>{
  let response=await save('POST','/admin',draft());assert.equal(response.status,201);item=(await response.json()).item;assert.equal((await fetch(origin+uploaded.url)).status,401);assert.equal((await (await fetch(origin+'/public')).json()).items.length,0);
  response=await save('PATCH','/admin/'+item._id,{...draft(),published:true,revision:1});assert.equal(response.status,200);response=await fetch(origin+uploaded.url);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),original);
  response=await fetch(origin+uploaded.url,{headers:{Range:'bytes=5-29'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 5-29/${original.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),original.subarray(5,30));
 });
 await t.test('course/CMS videos cannot be republished by supplying their IDs',async()=>{
  const bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'}),stream=bucket.openUploadStream('private-course.webm',{contentType:'video/webm',metadata:{purpose:'cms'}});stream.end(original);await once(stream,'finish');
  const response=await save('POST','/admin',{...draft(),videoUrl:'/api/media/'+stream.id,videoFileId:String(stream.id),published:true});assert.equal(response.status,400);assert.equal((await fetch(origin+'/api/media/'+stream.id)).status,401);assert.equal(await VideoReview.countDocuments(),1);
 });
 await t.test('unpublish and delete immediately remove guest playback without broadening other media access',async()=>{
  let response=await save('PATCH','/admin/'+item._id,{...draft(),revision:2});assert.equal(response.status,200);assert.equal((await fetch(origin+uploaded.url)).status,401);assert.equal((await fetch(origin+'/public/'+item._id)).status,404);
  response=await save('DELETE','/admin/'+item._id,{revision:3});assert.equal(response.status,200);assert.equal((await fetch(origin+uploaded.url)).status,401);
 });
});
