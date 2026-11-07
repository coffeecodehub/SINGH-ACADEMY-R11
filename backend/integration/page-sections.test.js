import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import sharp from 'sharp';
import {once} from 'node:events';
import {isolatedDatabase,testEnvironment} from './isolation.js';
import {createPageSectionRouters} from '../src/routes/pageSectionRoutes.js';
import PageSection from '../src/models/PageSection.js';
import mediaRoutes from '../src/routes/mediaRoutes.js';
test('page sections: real Mongo publication, original HD bytes, private-media rejection and revision races',async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:true,serverSelectionTimeoutMS:10000});
 t.after(async()=>{await isolated.cleanup(mongoose);await mongoose.disconnect();});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.cookies={};next();});
 const routes=createPageSectionRouters({authenticate:(req,res,next)=>{req.user={_id:new mongoose.Types.ObjectId(),role:'super_admin',normalizedRole:'super_admin'};next();}});
 app.use('/admin',routes.adminRouter);app.use('/public',routes.publicRouter);app.use('/api/media',mediaRoutes);app.use((error,req,res,next)=>res.status(error.status||500).json({success:false,message:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const origin='http://127.0.0.1:'+server.address().port;
 const original=await sharp({create:{width:3500,height:1400,channels:3,background:'#916640'}}).png().toBuffer();let uploaded;
 await t.test('scanner-gated CMS uploader retains original format, dimensions and every byte',async()=>{
  const form=new FormData();form.append('file',new Blob([original],{type:'image/png'}),'original-hd.png');
  const response=await fetch(origin+'/admin/upload',{method:'POST',body:form});assert.equal(response.status,201);uploaded=await response.json();assert.equal(uploaded.width,3500);assert.equal(uploaded.height,1400);assert.equal(uploaded.mime,'image/png');assert.equal(uploaded.originalPixelsPreserved,true);
  const bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'}),chunks=[];for await(const chunk of bucket.openDownloadStream(new mongoose.Types.ObjectId(uploaded.fileId)))chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),original);
 });
 const block={id:'real-page-media',type:'image',title:'Global learning',description:'A published website image.',imageUrl:uploaded.url,imageFileId:uploaded.fileId,imageAlt:'A wide original image',published:false};
 const save=(revision,blocks)=>fetch(origin+'/admin/about',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,blocks})});
 await t.test('draft media stays private; publication makes only that referenced media readable',async()=>{
  let response=await save(0,[block]);assert.equal(response.status,200);assert.equal((await (await fetch(origin+'/public/about')).json()).blocks.length,0);assert.equal((await fetch(origin+uploaded.url)).status,401);
  response=await save(1,[{...block,published:true}]);assert.equal(response.status,200);assert.equal((await (await fetch(origin+'/public/about')).json()).blocks.length,1);response=await fetch(origin+uploaded.url);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),original);
 });
 await t.test('learner-private GridFS identifiers cannot be attached to public CMS content',async()=>{
  const bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'}),stream=bucket.openUploadStream('private.png',{contentType:'image/png',metadata:{purpose:'student-assessment'}});stream.end(original);await once(stream,'finish');
  const response=await save(2,[{...block,imageUrl:'/api/media/'+stream.id,imageFileId:String(stream.id),published:true}]);assert.equal(response.status,400);assert.match((await response.json()).message,/Private learner files/);assert.equal((await PageSection.findById('about')).revision,2);
 });
 await t.test('the real Mongo primary key and revision guard reject concurrent and stale saves',async()=>{
  const responses=await Promise.all([save(2,[{...block,published:true}]),save(2,[block])]);assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);assert.equal((await save(2,[block])).status,409);assert.equal((await PageSection.findById('about')).revision,3);
 });
});
