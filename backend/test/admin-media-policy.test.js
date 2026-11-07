/** Real multipart disk streaming at the former product boundary. No publishing,
 * external scanner, production database or untrusted-user limit is bypassed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import {once} from 'node:events';
import express from 'express';
import {uploadSingle} from '../src/services/uploads.js';
import {load} from './testLoader.js';
test('admin upload accepts an original beyond the former 250MiB boundary using bounded-memory multipart streaming',async t=>{
 const app=express();let storedPath;
 app.post('/upload',uploadSingle,async(req,res)=>{storedPath=req.file.path;const size=(await fs.promises.stat(storedPath)).size;await fs.promises.unlink(storedPath);res.json({size,adminMedia:req.adminMediaUpload,originalName:req.file.originalname});});
 app.use((error,req,res,next)=>res.status(500).json({message:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));if(storedPath)await fs.promises.unlink(storedPath).catch(()=>{});});
 const total=250*1024*1024+257,boundary='academy-large-original-fixture',chunk=Buffer.alloc(1024*1024,7);
 const body=Readable.from((async function*(){yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="long-original.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);let remaining=total;while(remaining){const n=Math.min(chunk.length,remaining);yield chunk.subarray(0,n);remaining-=n;}yield Buffer.from(`\r\n--${boundary}--\r\n`);})());
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/upload',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary='+boundary},body,duplex:'half'});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{size:total,adminMedia:true,originalName:'long-original.mp4'});
});
test('only the server-marked no-product-cap admin scan bypasses a copied scanner size hint',async()=>{
 const values=[],previous=process.env.ADMIN_MEDIA_MAX_UPLOAD_MB;
 const scanFile=load('../src/services/uploadScan.js',{net:{},fs:{},uploadScanConfiguration:()=>({provider:'cloudmersive',errors:[]}),scanCloudmersiveFile:async(path,options)=>{values.push(options);return {status:'clean'};}},'scanFile');
 try{delete process.env.ADMIN_MEDIA_MAX_UPLOAD_MB;await scanFile('fixture',{adminMedia:true});await scanFile('fixture',{adminMedia:false});process.env.ADMIN_MEDIA_MAX_UPLOAD_MB='40';await scanFile('fixture',{adminMedia:true});assert.deepEqual(values.map(v=>v.ignoreConfiguredSizeHint),[true,false,false]);}
 finally{if(previous===undefined)delete process.env.ADMIN_MEDIA_MAX_UPLOAD_MB;else process.env.ADMIN_MEDIA_MAX_UPLOAD_MB=previous;}
});
