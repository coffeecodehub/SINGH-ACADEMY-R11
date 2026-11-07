import {awaitVideoReviewPlayback} from '../src/services/videoReviewPlayback.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import {isolatedDatabase,testEnvironment} from './isolation.js';
import {createVideoReviewRouters} from '../src/routes/videoReviewRoutes.js';
import {configureLocalUploads} from '../src/utils/localUploads.js';

test('R6 original review upload exposes actual scanner503 and explicit local configuration restores the original stream',async t=>{
 const isolated=isolatedDatabase();testEnvironment();await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:true,serverSelectionTimeoutMS:10000});const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sa-r6-upload-fix-'));
 t.after(async()=>{await awaitVideoReviewPlayback();fs.rmSync(dir,{recursive:true,force:true});await isolated.cleanup(mongoose);await mongoose.disconnect();});
 const app=express();const auth=(req,res,next)=>{if(req.headers['x-fixture-admin']!=='yes')return res.status(401).json({success:false});req.user={_id:new mongoose.Types.ObjectId(),role:'client_admin',normalizedRole:'client_admin'};next();};const {adminRouter}=createVideoReviewRouters({authenticate:auth,limitRequests:()=>((req,res,next)=>next())});app.use('/admin',adminRouter);app.use((error,req,res,next)=>res.status(error.status||500).json({success:false,code:error.code,message:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const origin='http://127.0.0.1:'+server.address().port;
 const original=fs.readFileSync(new URL('../../frontend/ui-tests/fixtures/video-review.webm',import.meta.url)),bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'});
 const upload=async authorized=>{const form=new FormData();form.append('file',new Blob([original],{type:'video/webm'}),'full-original.webm');return fetch(origin+'/admin/upload',{method:'POST',headers:authorized?{'X-Fixture-Admin':'yes'}:{},body:form});};
 await t.test('guest cannot reach configuration diagnostics or upload',async()=>{assert.equal((await upload(false)).status,401);assert.equal((await fetch(origin+'/admin/upload-status')).status,401);});
 await t.test('missing hosted scanner is rejected before accepting media; diagnostics never suggest local mode',async()=>{
  Object.assign(process.env,{NODE_ENV:'production',DEPLOYMENT_STAGE:'production',UPLOAD_SCAN_PROVIDER:'clamav',CLAMAV_HOST:'',UPLOAD_SCAN_REQUIRED:'true'});
  const response=await upload(true);assert.equal(response.status,503);const result=await response.json();assert.equal(result.code,'UPLOAD_SCAN_CONFIGURATION');assert.equal(result.localUploadCommand,null);assert.equal(await mongoose.connection.db.collection('academyMedia.files').countDocuments(),0);
 });
 await t.test('unreachable actual ClamAV produces honest503 and stores no original',async()=>{
  const closed=net.createServer();closed.listen(0,'127.0.0.1');await once(closed,'listening');const port=closed.address().port;await new Promise(resolve=>closed.close(resolve));Object.assign(process.env,{NODE_ENV:'development',DEPLOYMENT_STAGE:'development',CLAMAV_HOST:'127.0.0.1',CLAMAV_PORT:String(port),UPLOAD_SCAN_REQUIRED:'true'});
  const response=await upload(true);assert.equal(response.status,503);const result=await response.json();assert.equal(result.code,'UPLOAD_SCAN_UNAVAILABLE');assert.match(result.message,/ClamAV scanner could not be reached/);assert.doesNotMatch(JSON.stringify(result),/127\.0\.0\.1|fixture-secret/);assert.equal(await mongoose.connection.db.collection('academyMedia.files').countDocuments(),0);
 });
 await t.test('a reachable scanner size rejection is distinguished from an outage and never stored',async()=>{
  const scanner=net.createServer(socket=>socket.once('data',()=>socket.end('stream: INSTREAM size limit exceeded. ERROR\0')));scanner.listen(0,'127.0.0.1');await once(scanner,'listening');Object.assign(process.env,{NODE_ENV:'development',DEPLOYMENT_STAGE:'development',CLAMAV_HOST:'127.0.0.1',CLAMAV_PORT:String(scanner.address().port),UPLOAD_SCAN_REQUIRED:'true'});
  try{const response=await upload(true);assert.equal(response.status,413);assert.equal((await response.json()).code,'UPLOAD_SCAN_SIZE');assert.equal(await mongoose.connection.db.collection('academyMedia.files').countDocuments(),0);}finally{await new Promise(resolve=>scanner.close(resolve));}
 });
 await t.test('explicit guarded local helper settings applied on restart allow full original upload and exact stored SHA',async()=>{
  const target=path.join(dir,'.env');fs.writeFileSync(target,'NODE_ENV=development\nDEPLOYMENT_STAGE=development\nFRONTEND_URL=http://localhost:3000\nUPLOAD_SCAN_PROVIDER=cloudmersive\nUPLOAD_SCAN_REQUIRED=true\nCLOUDMERSIVE_API_KEY=fixture-secret-must-survive\n');
  assert.equal(configureLocalUploads({target,apply:true,env:{}}).backupCreated,true);const settings=dotenv.parse(fs.readFileSync(target));assert.equal(settings.CLOUDMERSIVE_API_KEY,'fixture-secret-must-survive');Object.assign(process.env,settings);
  const status=await (await fetch(origin+'/admin/upload-status',{headers:{'X-Fixture-Admin':'yes'}})).json();assert.equal(status.upload.configurationReady,true);assert.equal(status.upload.developmentWithoutScanner,true);
  const response=await upload(true);assert.equal(response.status,201);const result=await response.json();assert.equal(result.originalBytesPreserved,true);assert.equal(result.size,original.length);const [file]=await bucket.find({_id:new mongoose.Types.ObjectId(result.fileId)}).toArray();assert.equal(file.metadata.scan.status,'not-scanned-development');const chunks=[];for await(const chunk of bucket.openDownloadStream(file._id))chunks.push(chunk);assert.equal(createHash('sha256').update(Buffer.concat(chunks)).digest('hex'),createHash('sha256').update(original).digest('hex'));
 });
 await t.test('large original uses bounded larger chunks and preserves exact full/range bytes and legacy files',async()=>{
  const big=Buffer.concat([original,Buffer.alloc(9*1024*1024,37)]),form=new FormData();form.append('file',new Blob([big],{type:'video/webm'}),'large-original.webm');
  const response=await fetch(origin+'/admin/upload',{method:'POST',headers:{'X-Fixture-Admin':'yes'},body:form});assert.equal(response.status,201);const result=await response.json();
  const id=new mongoose.Types.ObjectId(result.fileId),[file]=await bucket.find({_id:id}).toArray();assert.equal(file.chunkSize,4*1024*1024);assert.equal(file.length,big.length);
  assert.equal(await mongoose.connection.db.collection('academyMedia.chunks').countDocuments({files_id:id}),Math.ceil(big.length/file.chunkSize));
  const all=[];for await(const chunk of bucket.openDownloadStream(id))all.push(chunk);assert.deepEqual(Buffer.concat(all),big);
  const start=file.chunkSize-117,end=file.chunkSize+217,range=[];for await(const chunk of bucket.openDownloadStream(id,{start,end}))range.push(chunk);assert.deepEqual(Buffer.concat(range),big.subarray(start,end));
  const legacy=bucket.openUploadStream('unchanged-legacy.webm');legacy.end(original);await once(legacy,'finish');const [old]=await bucket.find({_id:legacy.id}).toArray();assert.equal(old.chunkSize,255*1024);const oldBytes=[];for await(const chunk of bucket.openDownloadStream(old._id))oldBytes.push(chunk);assert.deepEqual(Buffer.concat(oldBytes),original);
 });

});
