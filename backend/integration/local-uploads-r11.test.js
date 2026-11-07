/** Actual multipart -> validation/scanning -> GridFS for the three reported upload paths.
 * Cleanup is confined to the existing generated-test-database guard. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import sharp from 'sharp';
import {isolatedDatabase,testEnvironment} from './isolation.js';
import {createVideoReviewRouters} from '../src/routes/videoReviewRoutes.js';
import {uploadAdmission,uploadSingle,storeUpload} from '../src/services/uploads.js';
import {awaitVideoReviewPlayback} from '../src/services/videoReviewPlayback.js';

test('R11 normal explicit local flag restores image, review video and course video uploads without changing scanner keys',async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 Object.assign(process.env,{NODE_ENV:'development',DEPLOYMENT_STAGE:'development',LOCAL_UPLOADS_UNSCANNED:'true',UPLOAD_SCAN_PROVIDER:'cloudmersive',UPLOAD_SCAN_REQUIRED:'true',CLOUDMERSIVE_API_KEY:'owned-unavailable-scanner-key-unchanged'});
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:true,serverSelectionTimeoutMS:10000});
 const app=express(),actor=new mongoose.Types.ObjectId();
 const auth=(req,res,next)=>{if(req.headers['x-fixture-admin']!=='yes')return res.status(401).json({success:false});req.user={_id:actor,role:'client_admin',normalizedRole:'client_admin'};next();};
 const {adminRouter}=createVideoReviewRouters({authenticate:auth,limitRequests:()=>((req,res,next)=>next())});app.use('/api/admin/video-reviews',adminRouter);
 app.post('/api/admin/upload',auth,uploadAdmission,uploadSingle,storeUpload);
 app.use((error,req,res,next)=>res.status(error.status||500).json({success:false,code:error.code,message:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await awaitVideoReviewPlayback();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await isolated.cleanup(mongoose);await mongoose.disconnect();});
 const video=fs.readFileSync(new URL('../../frontend/ui-tests/fixtures/video-review.webm',import.meta.url));
 const upload=async(route,bytes,mime,name,extraHeaders={})=>{const form=new FormData();form.append('file',new Blob([bytes],{type:mime}),name);return fetch(origin+route,{method:'POST',headers:{'X-Fixture-Admin':'yes',...extraHeaders},body:form});};
 const files=mongoose.connection.db.collection('academyMedia.files'),bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'});
 await t.test('image completes with decoded dimensions and unscanned-local provenance',async()=>{
  const png=await sharp({create:{width:18,height:12,channels:3,background:'#347b8c'}}).png().toBuffer();
  const response=await upload('/api/admin/upload',png,'image/png','review-image.png');assert.equal(response.status,201);const result=await response.json();assert.equal(result.success,true);assert.equal(result.mime,'image/webp');assert.equal(result.width,18);assert.equal(result.height,12);
  const file=await files.findOne({_id:new mongoose.Types.ObjectId(result.fileId)});assert.equal(file.metadata.scan.status,'not-scanned-development');assert.equal(file.metadata.signatureChecked,true);
 });
 for(const [label,route,purpose]of [['review video','/api/admin/video-reviews/upload','video-review'],['course video','/api/admin/upload','cms']])await t.test(label+' completes and preserves full original bytes',async()=>{
  const response=await upload(route,video,'video/webm',label+'.webm');assert.equal(response.status,201);const result=await response.json();assert.equal(result.success,true);
  const id=new mongoose.Types.ObjectId(result.fileId),file=await files.findOne({_id:id});assert.equal(file.metadata.purpose,purpose);assert.equal(file.metadata.scan.status,'not-scanned-development');
  const chunks=[];for await(const chunk of bucket.openDownloadStream(id))chunks.push(chunk);assert.equal(createHash('sha256').update(Buffer.concat(chunks)).digest('hex'),createHash('sha256').update(video).digest('hex'));
 });
 await t.test('validation failure resolves promptly and next upload is not stuck',async()=>{
  const response=await upload('/api/admin/upload',Buffer.from('not-a-video'),'video/webm','invalid.webm');assert.equal(response.status,400);assert.equal((await upload('/api/admin/upload',video,'video/webm','recovered.webm')).status,201);
 });
 await t.test('public browser or forwarded peer cannot use local flag even through loopback',async()=>{
  const before=await files.countDocuments();for(const headers of [{Origin:'https://academy.example'},{'X-Forwarded-For':'203.0.113.10'},{'X-Forwarded-Host':'academy.example'}]){const response=await upload('/api/admin/upload',video,'video/webm','public-must-scan.webm',headers);assert.equal(response.status,503);assert.equal((await response.json()).code,'UPLOAD_SCAN_CONFIGURATION');}assert.equal(await files.countDocuments(),before);
 });
 await t.test('hosted deployment ignores local flag and still refuses unavailable scanner',async()=>{
  Object.assign(process.env,{NODE_ENV:'production',DEPLOYMENT_STAGE:'production',UPLOAD_SCAN_PROVIDER:'clamav',CLAMAV_HOST:'',UPLOAD_SCAN_REQUIRED:'true'});
  const before=await files.countDocuments();for(const route of ['/api/admin/upload','/api/admin/video-reviews/upload']){const response=await upload(route,video,'video/webm','hosted-must-scan.webm');assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'UPLOAD_SCAN_CONFIGURATION');assert.equal(body.localUploadCommand,null);}
  assert.equal(await files.countDocuments(),before);assert.equal(process.env.CLOUDMERSIVE_API_KEY,'owned-unavailable-scanner-key-unchanged');
 });
});
