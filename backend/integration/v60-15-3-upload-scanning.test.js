import {awaitVideoReviewPlayback} from '../src/services/videoReviewPlayback.js';
/** Actual Express upload + Sharp + MongoDB persistence; scanner responses are an
 * explicitly injected LOCAL HTTP fixture, never an external malware service.
 * Run only through the generated isolated test database gate. */
import test,{mock} from 'node:test';import assert from 'node:assert/strict';
import https from 'node:https';import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';
test('V60.15.3 real upload quarantine, scanner verdict and GridFS ownership',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sa-cloud-integration-'));
 Object.assign(process.env,{UPLOAD_TEMP_DIR:directory,UPLOADS_ENABLED:'true',UPLOAD_SCAN_REQUIRED:'true',UPLOAD_SCAN_PROVIDER:'cloudmersive',CLOUDMERSIVE_API_KEY:'test-only-integration-api-key-1234',CLOUDMERSIVE_MAX_FILE_BYTES:'3500000'});
 let api,scanner,mode='clean',scanCalls=0,lastHeaders,lastBody;
 const mongoose=(await import('mongoose')).default;
 t.after(async()=>{
  for(const server of [api,scanner])if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  mock.restoreAll();
  try{await awaitVideoReviewPlayback();await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();await fs.rm(directory,{recursive:true,force:true});}
 });
 scanner=http.createServer(async(req,res)=>{
  req.on('error',()=>{});const parts=[];for await(const b of req)parts.push(b);
  scanCalls++;lastHeaders=req.headers;lastBody=Buffer.concat(parts).toString('latin1');
  const status=mode==='unavailable'?503:mode==='quota'?429:mode==='auth'?401:mode==='oversize'?413:200;
  res.writeHead(status,{'Content-Type':'application/json'});
  res.end(mode==='malformed'?'not-json':JSON.stringify({CleanResult:mode!=='infected',FoundViruses:mode==='infected'?[{VirusName:'synthetic-fixture-only'}]:[]}));
 });
 await new Promise(resolve=>scanner.listen(0,'127.0.0.1',resolve));
 mock.method(https,'request',(url,options,callback)=>{
  assert.equal(url,'https://api.cloudmersive.com/virus/scan/file');
  return http.request('http://127.0.0.1:'+scanner.address().port+'/scan',options,callback);
 });
 // Import after installing the transport fixture; production scanner code is otherwise unchanged.
 const {createApp}=await import('../src/app.js');
 const User=(await import('../src/models/User.js')).default,bcrypt=(await import('bcryptjs')).default;
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});
 for(const Model of Object.values(mongoose.models))await Model.createIndexes();
 const password='Test-'+crypto.randomBytes(20).toString('hex');
 const admin=await User.create({name:'Upload fixture admin',email:'upload-admin@integration.invalid',role:'client_admin',status:'active',passwordHash:await bcrypt.hash(password,12)});
 api=await new Promise(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+api.address().port;
 const login=await fetch(base+'/api/auth/admin/login',{method:'POST',headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':'client_admin','Content-Type':'application/json'},body:JSON.stringify({email:admin.email,password})});
 assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>/^sa_client_admin_v45=[a-f0-9]{64}$/.test(x)).join('; ');assert.ok(cookie);
 const sharp=(await import('sharp')).default;
 const png=await sharp({create:{width:3,height:3,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).png().toBuffer();
 const files=()=>mongoose.connection.db.collection('academyMedia.files').countDocuments();
 async function upload({content=png,session=cookie,mime='image/png',endpoint='/api/admin/upload'}={}){
  const form=new FormData();form.append('file',new Blob([content],{type:mime}),'private-student-name.png');
  const r=await fetch(base+endpoint,{method:'POST',headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':'client_admin',...(session?{Cookie:session}:{})},body:form});return {status:r.status,data:await r.json()};
 }
 await t.test('clean image gets scanned before actual Sharp/GridFS storage and preserves owner metadata',async()=>{
  const r=await upload();assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.mime,'image/webp');
  const saved=await mongoose.connection.db.collection('academyMedia.files').findOne({_id:new mongoose.Types.ObjectId(r.data.fileId)});
  assert.equal(saved.metadata.scan.status,'clean');assert.equal(saved.metadata.scan.engine,'cloudmersive');assert.equal(saved.metadata.scan.sha256,crypto.createHash('sha256').update(png).digest('hex'));assert.equal(saved.metadata.purpose,'cms');assert.equal(saved.metadata.uploadedBy,String(admin._id));
  assert.equal(scanCalls,1);assert.match(lastBody,/filename="upload.png"/);assert.doesNotMatch(lastBody,/private-student-name/);assert.equal(lastHeaders.cookie,undefined);
  assert.equal((await fs.readdir(directory)).length,0);
 });
 await t.test('a complete original review video larger than the copied 3.5MB hint is actually scanned and stored unchanged',async()=>{
  mode='clean';process.env.ADMIN_MEDIA_MAX_UPLOAD_MB='0';const source=await fs.readFile(new URL('../../frontend/ui-tests/fixtures/video-review.webm',import.meta.url));const content=Buffer.concat([source,Buffer.alloc(4*1024*1024)]),beforeCalls=scanCalls;
  const r=await upload({content,mime:'video/webm',endpoint:'/api/admin/video-reviews/upload'});assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(scanCalls,beforeCalls+1);const saved=await mongoose.connection.db.collection('academyMedia.files').findOne({_id:new mongoose.Types.ObjectId(r.data.fileId)});assert.equal(saved.metadata.purpose,'video-review');assert.equal(saved.length,content.length);assert.equal(saved.metadata.scan.status,'clean');assert.equal(saved.metadata.scan.sha256,crypto.createHash('sha256').update(content).digest('hex'));await awaitVideoReviewPlayback();assert.equal((await fs.readdir(directory)).length,0);
 });
 for(const [scenario,status,code] of [['infected',400,'UPLOAD_INFECTED'],['unavailable',503,'UPLOAD_SCAN_UNAVAILABLE'],['quota',503,'UPLOAD_SCAN_BUSY'],['auth',503,'UPLOAD_SCAN_AUTH'],['malformed',503,'UPLOAD_SCAN_UNAVAILABLE'],['oversize',413,'UPLOAD_SCAN_SIZE']])await t.test(scenario+' leaves no new GridFS metadata or quarantined file',async()=>{
  mode=scenario;const before=await files();const r=await upload();assert.equal(r.status,status);assert.equal(r.data.code,code);assert.equal(await files(),before);assert.equal((await fs.readdir(directory)).length,0);
 });
 await t.test('an explicit operator admin cap retains the configured scanner precheck',async()=>{
  mode='clean';process.env.ADMIN_MEDIA_MAX_UPLOAD_MB='1';process.env.CLOUDMERSIVE_MAX_FILE_BYTES='10';const before=await files(),calls=scanCalls;const r=await upload();assert.equal(r.status,413);assert.equal(r.data.code,'UPLOAD_SCAN_SIZE');assert.equal(scanCalls,calls);assert.equal(await files(),before);assert.equal((await fs.readdir(directory)).length,0);process.env.CLOUDMERSIVE_MAX_FILE_BYTES='3500000';process.env.ADMIN_MEDIA_MAX_UPLOAD_MB='0';
 });
 await t.test('invalid file signature is rejected BEFORE scanner or storage',async()=>{
  const before=await files(),calls=scanCalls;const r=await upload({content:Buffer.from('<html>Not a PNG</html>')});assert.equal(r.status,400);assert.equal(scanCalls,calls);assert.equal(await files(),before);
 });
 await t.test('unauthenticated upload cannot use scanner quota',async()=>{const calls=scanCalls;const r=await upload({session:''});assert.equal(r.status,401);assert.equal(scanCalls,calls);});
 await t.test('explicit uploads OFF still blocks safely without external call',async()=>{process.env.UPLOADS_ENABLED='false';const calls=scanCalls;const r=await upload();assert.equal(r.status,503);assert.equal(r.data.code,'UPLOADS_DISABLED');assert.equal(scanCalls,calls);process.env.UPLOADS_ENABLED='true';});
});
