/** Real file + local HTTP transport tests. The injected loopback transport does NOT
 * contact Cloudmersive, validate a paid account, or replace provider acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createCloudmersiveScanner} from '../src/services/uploadScanCloudmersive.js';
import {uploadScanConfiguration,CLOUDMERSIVE_SCAN_URL} from '../src/utils/uploadScanConfig.js';
import {checkEnvironment} from '../src/utils/deployment.js';
const key='test-only-scanner-key-1234567890';
const config=(overrides={})=>({UPLOAD_SCAN_PROVIDER:'cloudmersive',CLOUDMERSIVE_API_KEY:key,UPLOAD_SCAN_REQUIRED:'true',CLOUDMERSIVE_MAX_FILE_BYTES:'6000000',...overrides});
const review=(overrides={})=>({NODE_ENV:'production',DEPLOYMENT_STAGE:'review',AUTH_SECRET:crypto.randomBytes(48).toString('hex'),MONGODB_URI:'mongodb://127.0.0.1:27018/fixture?replicaSet=rs0',FRONTEND_URL:'https://academy.test',FRONTEND_URLS:'https://academy.test',PUBLIC_API_URL:'/api',SMTP_HOST:'mail.academy.test',EMAIL_FROM:'test@academy.test',UPLOADS_ENABLED:'true',...config(),...overrides});
const clean={CleanResult:true,FoundViruses:[]};
async function fixture(t,options={}) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sa-cloud-test-'));
  const file=path.join(directory,'student-private-filename.png');
  const bytes=options.bytes??Buffer.from('Harmless synthetic scan transport fixture');
  await fs.writeFile(file,bytes);
  const requests=[],calls=[];let markRequestReceived;
  const requestReceived=new Promise(resolve=>{markRequestReceived=resolve;});
  const server=http.createServer(async(req,res)=>{
    req.on('error',()=>{});res.on('error',()=>{});
    const chunks=[];
    for await(const chunk of req)chunks.push(chunk);
    requests.push({headers:req.headers,method:req.method,url:req.url,bytes:Buffer.concat(chunks)});
    markRequestReceived();
    if(options.neverReply)return;
    res.writeHead(options.status??200,{'content-type':options.type??'application/json',...options.headers});
    res.end(options.raw??JSON.stringify(options.payload??clean));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const scan=createCloudmersiveScanner((url,opts,callback)=>{
    calls.push({url,opts});
    assert.equal(url,CLOUDMERSIVE_SCAN_URL);assert.equal(new URL(url).protocol,'https:');
    // Transport substitution is ONLY in this test. Production TLS stays enabled.
    return http.request('http://127.0.0.1:'+server.address().port+'/virus/scan/file',opts,callback);
  });
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});});
  return {file,bytes,scan,requests,calls,directory,requestReceived};
}
test('hosted cloud scanner can enable uploads WITHOUT a ClamAV host',()=>{
  assert.deepEqual(checkEnvironment(review()).errors,[]);
  assert.equal(uploadScanConfiguration(review()).required,true);
});
test('default scanner remains ClamAV; providing an API key alone does not change provider',()=>assert.equal(uploadScanConfiguration({CLOUDMERSIVE_API_KEY:key}).provider,'clamav'));
test('review uploads OFF permits scanner setup in stages without a fake key',()=>assert.deepEqual(checkEnvironment(review({UPLOADS_ENABLED:'false',CLOUDMERSIVE_API_KEY:''})).errors,[]));
test('hosted cloud uploads cannot turn required scanning OFF',()=>assert.ok(checkEnvironment(review({UPLOAD_SCAN_REQUIRED:'false'})).errors.some(x=>/UPLOAD_SCAN_REQUIRED/.test(x))));
for(const value of ['', 'YOUR_API_KEY', 'a\r\nx-evil: b', 'a b c d e f g h i j', '"abcdefghijklmnop"'])test('cloud scanner key rejects invalid value '+JSON.stringify(value),()=>{
  const r=checkEnvironment(review({CLOUDMERSIVE_API_KEY:value}));assert.ok(r.errors.some(x=>/CLOUDMERSIVE_API_KEY/.test(x)));
  if(value)assert.ok(!r.errors.join(' ').includes(value));
});
for(const value of ['none','off','http','Cloudmersive','https://evil.invalid'])test('unknown scanner provider is rejected '+value,()=>assert.ok(checkEnvironment(review({UPLOAD_SCAN_PROVIDER:value})).errors.some(x=>/UPLOAD_SCAN_PROVIDER/.test(x))));
for(const value of ['-1','1.5','Infinity','9007199254740992','not-number'])test('scanner file limit rejects '+value,()=>assert.ok(uploadScanConfiguration(config({CLOUDMERSIVE_MAX_FILE_BYTES:value})).errors.length));
test('unknown provider allowance is not guessed; zero defers to its actual scan verdict',()=>assert.equal(uploadScanConfiguration({}).maxFileBytes,0));
test('malicious-origin validation remains intact with HTTPS scanner selected',()=>assert.ok(checkEnvironment(review({FRONTEND_URLS:'*'})).errors.some(x=>/origin/.test(x))));
test('contradictory hosted development remains rejected',()=>assert.ok(checkEnvironment(review({NODE_ENV:'development'})).errors.some(x=>/requires NODE_ENV/.test(x))));
test('streamed multipart carries exact bytes and generic name, positive verdict returns minimal metadata',async t=>{
  const f=await fixture(t);const result=await f.scan(f.file,{env:config(),mime:'image/png'});
  assert.equal(result.status,'clean');assert.equal(result.engine,'cloudmersive');assert.ok(result.scannedAt instanceof Date);
  assert.equal(result.sha256,crypto.createHash('sha256').update(f.bytes).digest('hex'));
  assert.equal(f.requests.length,1);const request=f.requests[0],raw=request.bytes.toString();
  assert.equal(request.method,'POST');assert.equal(request.headers.apikey,key);
  assert.equal(request.headers.accept,'application/json');assert.equal(Number(request.headers['content-length']),request.bytes.length);
  assert.match(raw,/name="inputFile"; filename="upload.png"/);assert.ok(request.bytes.includes(f.bytes));
  assert.ok(!raw.includes('student-private-filename'));assert.equal(request.headers.cookie,undefined);
  assert.equal(f.calls[0].opts.rejectUnauthorized,true);assert.equal(f.calls[0].opts.agent,undefined);
  assert.ok(!JSON.stringify(result).includes(key));
});
test('provider null findings is a valid explicit clean result',async t=>{const f=await fixture(t,{payload:{CleanResult:true,FoundViruses:null}});assert.equal((await f.scan(f.file,{env:config()})).status,'clean');});
test('streamed multi-megabyte upload preserves complete SHA256 without truncation',async t=>{
 const f=await fixture(t,{bytes:crypto.randomBytes(3*1024*1024+123)});const result=await f.scan(f.file,{env:config()});
 assert.equal(result.sha256,crypto.createHash('sha256').update(f.bytes).digest('hex'));
 assert.ok(f.requests[0].bytes.includes(f.bytes));
});
for(const payload of [
 {CleanResult:false,FoundViruses:[{FileName:'hidden',VirusName:'synthetic-test-only'}]},
 {CleanResult:true,FoundViruses:[{VirusName:'contradictory-threat'}]},
 {CleanResult:false,FoundViruses:null},
 {CleanResult:true,FoundViruses:[],ContainsScript:true}
])test('adverse verdict cannot store a file '+JSON.stringify(payload),async t=>{const f=await fixture(t,{payload});await assert.rejects(()=>f.scan(f.file,{env:config()}),{status:400,code:'UPLOAD_INFECTED'});});
for(const payload of [{},[],null,{CleanResult:'true',FoundViruses:[]},{CleanResult:true},{CleanResult:true,FoundViruses:{}},{CleanResult:true,FoundViruses:[],ContainsScript:'false'}])test('malformed/incomplete JSON is not clean '+JSON.stringify(payload),async t=>{
 const f=await fixture(t,{raw:JSON.stringify(payload)});await assert.rejects(()=>f.scan(f.file,{env:config()}),{status:503,code:'UPLOAD_SCAN_UNAVAILABLE'});
});
for(const [status,code,resultStatus] of [[401,'UPLOAD_SCAN_AUTH',503],[403,'UPLOAD_SCAN_AUTH',503],[429,'UPLOAD_SCAN_BUSY',503],[413,'UPLOAD_SCAN_SIZE',413],[500,'UPLOAD_SCAN_UNAVAILABLE',503],[202,'UPLOAD_SCAN_UNAVAILABLE',503],[302,'UPLOAD_SCAN_UNAVAILABLE',503]])test('HTTP '+status+' fails closed without retry or raw secret leakage',async t=>{
 const f=await fixture(t,{status,raw:'provider detail includes '+key,headers:{location:'https://evil.invalid/steal'}});
 await assert.rejects(()=>f.scan(f.file,{env:config()}),error=>error.status===resultStatus&&error.code===code&&!error.message.includes(key));
 assert.equal(f.calls.length,1);
});
test('HTML success page is not a scan result',async t=>{const f=await fixture(t,{type:'text/html',raw:'<html>ok</html>'});await assert.rejects(()=>f.scan(f.file,{env:config()}),{status:503});});
test('invalid JSON fails closed',async t=>{const f=await fixture(t,{raw:'not json'});await assert.rejects(()=>f.scan(f.file,{env:config()}),{status:503});});
test('oversized provider response is bounded',async t=>{const f=await fixture(t,{raw:JSON.stringify({...clean,detail:'x'.repeat(70000)})});await assert.rejects(()=>f.scan(f.file,{env:config()}),{status:503});});
test('missing key fails before any HTTP call',async t=>{const f=await fixture(t);await assert.rejects(()=>f.scan(f.file,{env:config({CLOUDMERSIVE_API_KEY:''})}),{status:503});assert.equal(f.calls.length,0);});
test('configured size cap fails before any bytes leave the server',async t=>{const f=await fixture(t);await assert.rejects(()=>f.scan(f.file,{env:config({CLOUDMERSIVE_MAX_FILE_BYTES:'4'})}),{status:413});assert.equal(f.calls.length,0);});
test('empty file rejected before metered call',async t=>{const f=await fixture(t,{bytes:Buffer.alloc(0)});await assert.rejects(()=>f.scan(f.file,{env:config()}),{status:400});assert.equal(f.calls.length,0);});
test('missing quarantine file rejected without leaking path',async t=>{const f=await fixture(t);await assert.rejects(()=>f.scan(f.file+'-missing',{env:config()}),e=>e.status===503&&!e.message.includes(f.file));assert.equal(f.calls.length,0);});
test('pre-aborted upload starts no network request',async t=>{const f=await fixture(t);const c=new AbortController();c.abort();await assert.rejects(()=>f.scan(f.file,{env:config(),signal:c.signal}),{name:'AbortError',status:499});assert.equal(f.calls.length,0);});
test('client disconnect aborts in-flight scanner instead of saving or retrying',async t=>{
 const f=await fixture(t,{neverReply:true});const c=new AbortController();const task=f.scan(f.file,{env:config(),signal:c.signal});
 // Abort a proven in-flight HTTP request, rather than guessing when async file
 // opening has finished under parallel CPU/I/O load. Early cancellation has
 // its separate zero-network test above.
 await Promise.race([f.requestReceived,task.then(()=>{throw new Error('A non-replying scanner unexpectedly completed.');})]);
 assert.equal(f.calls.length,1);assert.equal(f.requests.length,1);assert.ok(f.requests[0].bytes.includes(f.bytes));
 c.abort();await assert.rejects(task,{name:'AbortError',status:499});assert.equal(f.calls.length,1);
});
test('scanner deadline aborts whole response and does not report clean',async t=>{const f=await fixture(t,{neverReply:true});await assert.rejects(()=>f.scan(f.file,{env:config({UPLOAD_SCAN_TIMEOUT_MS:'5000'})}),{status:503,code:'UPLOAD_SCAN_TIMEOUT'});assert.equal(f.calls.length,1);});
test('transport construction failure sanitized',async t=>{const f=await fixture(t);const scan=createCloudmersiveScanner(()=>{throw new Error(key+' untrusted provider message');});await assert.rejects(()=>scan(f.file,{env:config()}),e=>e.status===503&&!e.message.includes(key));});
test('simultaneous scans retain independent byte hashes and do not share verdicts',async t=>{const f=await fixture(t);const second=path.join(f.directory,'second.pdf'),bytes=Buffer.from('separate document');await fs.writeFile(second,bytes);const [a,b]=await Promise.all([f.scan(f.file,{env:config()}),f.scan(second,{env:config()})]);assert.notEqual(a.sha256,b.sha256);assert.equal(f.calls.length,2);});

test('live cloud config does not accept missing credentials even with uploads OFF',()=>assert.ok(checkEnvironment(review({DEPLOYMENT_STAGE:'production',UPLOADS_ENABLED:'false',CLOUDMERSIVE_API_KEY:''})).errors.some(x=>/CLOUDMERSIVE_API_KEY/.test(x))));

test('admin original ignores a copied legacy size hint only when requested and still needs a clean full-file scan',async t=>{
 const f=await fixture(t,{bytes:crypto.randomBytes(4*1024*1024+17)});
 const result=await f.scan(f.file,{env:config({CLOUDMERSIVE_MAX_FILE_BYTES:'3500000'}),ignoreConfiguredSizeHint:true});
 assert.equal(result.status,'clean');assert.equal(result.sha256,crypto.createHash('sha256').update(f.bytes).digest('hex'));assert.equal(f.requests.length,1);assert.ok(f.requests[0].bytes.includes(f.bytes));
});
test('removing the admin hint never bypasses a real provider size rejection',async t=>{
 const f=await fixture(t,{status:413});await assert.rejects(()=>f.scan(f.file,{env:config({CLOUDMERSIVE_MAX_FILE_BYTES:'4'}),ignoreConfiguredSizeHint:true}),{status:413,code:'UPLOAD_SCAN_SIZE'});assert.equal(f.calls.length,1);
});
