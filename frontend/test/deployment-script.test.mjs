/** Execute the read-only CLI against local HTTP fixtures. Not a hosted deployment test. */
import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),version=JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url))).version;
async function runFixture({backendVersion=version,frontVersion=version,protectedCatalog=true,landingAvailable=true}={}){
 const servers=[],received=[];
 async function start(frontend){const server=http.createServer((req,res)=>{received.push(req.method);res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json');let data={success:true};
  if(req.url==='/api/health')data.version=backendVersion;
  else if(req.url==='/api/health/ready')data.ready=true;
  else if(req.url==='/api/auth/session')data.user=null;
  else if(req.url==='/api/content/landing'){res.statusCode=landingAvailable?200:503;data=landingAvailable?{success:true,courses:[{}],team:[{},{}],reviews:[]}:{success:false};}
  else if(req.url==='/api/content/site')data.content={};
  else if(['/api/content/team','/api/courses'].includes(req.url)){res.statusCode=protectedCatalog?401:200;data=protectedCatalog?{success:false,code:'SESSION_REQUIRED'}:{success:true,courses:[],team:[]};}
  else if(req.url==='/api/app-build')data={success:true,frontendVersion:frontVersion,pageAccess:'public-landing-protected-pages-v6010'};
  else if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><body>SINGH ACADEMY</body></html>');return;}
  else if(req.url==='/about'){res.statusCode=307;res.setHeader('Location','/login?next=%2Fabout');}
  else res.statusCode=404;
  res.end(JSON.stringify(data));
 });servers.push(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;}
 try{const api=await start(false),front=await start(true);const child=spawn(process.execPath,['scripts/check-deployment.mjs','--local','--front',front,'--api',api],{cwd:root});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>output+=b);const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});return {code,output,received};}
 finally{await Promise.all(servers.map(s=>new Promise(r=>{s.closeAllConnections();s.close(r);})))}
}
test('deployment CLI accepts expected anonymous catalog 401 and checks both app releases',async()=>{const r=await runFixture();assert.equal(r.code,0,r.output);assert.match(r.output,/0 failed checks/);assert.ok(r.received.every(x=>x==='GET'));});
test('a new API behind an old frontend is detected, not falsely declared ready',async()=>{const r=await runFixture({frontVersion:'60.8.0'});assert.equal(r.code,1);assert.match(r.output,/1 failed checks/);assert.match(r.output,/frontend build/);});
test('two health version mismatches fail even when HTTP 200',async()=>{const r=await runFixture({backendVersion:'60.8.0'});assert.equal(r.code,1);assert.match(r.output,/2 failed checks/);});
test('unprotected anonymous catalog is a deployment security failure',async()=>{const r=await runFixture({protectedCatalog:false});assert.equal(r.code,1);assert.match(r.output,/4 failed checks/);});

test('public landing summaries are verified, not just static landing HTML',async()=>{const r=await runFixture({landingAvailable:false});assert.equal(r.code,1);assert.match(r.output,/2 failed checks/);});
