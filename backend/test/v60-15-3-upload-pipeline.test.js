/** Actual storeUpload source + real quarantine files/pipeline; explicit image/GridFS
 * stubs. These tests prove ordering/cleanup, not a production MongoDB/image service. */
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';import {Writable} from 'node:stream';import {pipeline} from 'node:stream/promises';
import {load} from './testLoader.js';import {envInteger} from '../src/utils/deployment.js';
import {validateSignature} from '../src/utils/fileSignature.js';
import {adminVideoStorageOptions} from '../src/utils/adminVideoStorage.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=','base64');
async function setup(t,{purpose='cms',scan=async()=>({status:'clean',engine:'cloudmersive',scannedAt:new Date()}),bytes=png,mime='image/png'}={}){
 const directory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'sa-upload-pipeline-')),file=path.join(directory,'untrusted.upload');await fs.promises.writeFile(file,bytes);
 t.after(()=>fs.promises.rm(directory,{recursive:true,force:true}));const events=[],writes=[],deletes=[];
 const multer=Object.assign(()=>({single:()=>()=>{}}),{diskStorage:()=>({})});
 class GridFSBucket{openUploadStream(name,options){events.push('store');const item={name,options,chunks:[]};writes.push(item);const stream=new Writable({write(chunk,encoding,done){item.chunks.push(Buffer.from(chunk));done();}});stream.id='synthetic-file-id';stream.abort=async()=>{events.push('abort');};return stream;}async delete(id){deletes.push(id);}}
 const sharp=()=>{events.push('decode');const image={destroy(){},rotate(){return image;},resize(){return image;},webp(){return image;},async toFile(output){await fs.promises.copyFile(file,output);return {size:bytes.length,width:1,height:1};}};return image;};
 const storeUpload=load('../src/services/uploads.js',{fs,os,path,crypto,pipeline,mongoose:{mongo:{GridFSBucket},connection:{db:{}}},multer,sharp,envInteger,adminVideoStorageOptions,httpError:(status,message)=>Object.assign(new Error(message),{status}),validateSignature,mediaUrl:(req,id)=>'/api/media/'+id,scanFile:async(p,o)=>{events.push('scan');assert.equal(p,file);assert.equal(o.mime,mime);return scan(p,o);}},'storeUpload');
 let slots=0,error;
 const req={user:{_id:'student-or-admin-owner'},file:{path:file,size:bytes.length,mimetype:mime,originalname:'original-file.png'},studentUpload:purpose==='student-assessment',paymentReceiptUpload:purpose==='payment-receipt',releaseUploadSlot(){slots++;}};
 const res=Object.assign(new EventEmitter(),{destroyed:false,writableEnded:false,status(s){this.statusCode=s;return this;},json(b){this.body=b;this.writableEnded=true;return this;}});
 return {file,events,writes,deletes,req,res,run:()=>storeUpload(req,res,e=>error=e),error:()=>error,slots:()=>slots};
}
for(const purpose of ['cms','student-assessment','payment-receipt'])test(purpose+': nothing decoded/stored until scan completes, clean upload keeps private owner metadata',async t=>{
 let resolve;const verdict=new Promise(r=>resolve=r);const f=await setup(t,{purpose,scan:()=>verdict});const job=f.run();
 while(!f.events.includes('scan'))await new Promise(r=>setTimeout(r,1));
 assert.deepEqual(f.events,['scan']);assert.equal(f.writes.length,0);assert.ok(fs.existsSync(f.file));
 resolve({status:'clean',engine:'cloudmersive',scannedAt:new Date()});await job;
 assert.deepEqual(f.events,['scan','decode','store']);assert.equal(f.res.statusCode,201);assert.equal(f.writes.length,1);
 const metadata=f.writes[0].options.metadata;assert.equal(metadata.purpose,purpose);assert.equal(metadata.uploadedBy,'student-or-admin-owner');assert.equal(metadata.scan.engine,'cloudmersive');assert.equal(metadata.scan.status,'clean');
 assert.ok(!fs.existsSync(f.file));assert.ok(!fs.existsSync(f.file+'.webp'));assert.equal(f.slots(),1);
});
for(const [status,code] of [[400,'UPLOAD_INFECTED'],[503,'UPLOAD_SCAN_TIMEOUT'],[503,'UPLOAD_SCAN_AUTH'],[503,'UPLOAD_SCAN_BUSY'],[413,'UPLOAD_SCAN_SIZE']])test(code+': rejection destroys quarantine and never publishes a file',async t=>{
 const error=Object.assign(new Error('controlled rejection'),{status,code});const f=await setup(t,{scan:async()=>{throw error;}});await f.run();
 assert.equal(f.error(),error);assert.deepEqual(f.events,['scan']);assert.equal(f.writes.length,0);assert.ok(!fs.existsSync(f.file));assert.equal(f.slots(),1);
});
test('a PDF also waits for scanning; image conversion is not incorrectly applied',async t=>{const f=await setup(t,{bytes:Buffer.from('%PDF-1.4\nsynthetic pdf signature fixture\n%%EOF'),mime:'application/pdf'});await f.run();assert.deepEqual(f.events,['scan','store']);assert.equal(f.res.statusCode,201);assert.ok(!fs.existsSync(f.file));});
test('invalid content never reaches the external scanner',async t=>{const f=await setup(t,{bytes:Buffer.from('<script>not a PNG image</script>')});await f.run();assert.equal(f.error().status,400);assert.deepEqual(f.events,[]);assert.ok(!fs.existsSync(f.file));});
test('client disconnect during scan destroys temporary file and releases the slot',async t=>{const f=await setup(t,{scan:async(p,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('cancelled'),{status:499})),{once:true}))});const job=f.run();while(!f.events.includes('scan'))await new Promise(r=>setTimeout(r,1));f.res.destroyed=true;f.res.emit('close');await job;assert.equal(f.writes.length,0);assert.ok(!fs.existsSync(f.file));assert.equal(f.slots(),1);});
