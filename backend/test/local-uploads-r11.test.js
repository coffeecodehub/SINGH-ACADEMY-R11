import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {localUnscannedUploads,localhostUploadRequest} from '../src/utils/localUploadMode.js';
import {uploadAvailability} from '../src/utils/uploadAvailability.js';
import {uploadScanConfiguration} from '../src/utils/uploadScanConfig.js';
const local={NODE_ENV:'development',DEPLOYMENT_STAGE:'development',FRONTEND_URL:'http://localhost:3000',FRONTEND_URLS:'http://localhost:3000,http://127.0.0.1:3001',LOCAL_UPLOADS_UNSCANNED:'true',UPLOAD_SCAN_PROVIDER:'cloudmersive',UPLOAD_SCAN_REQUIRED:'true'};
test('explicit localhost flag accepts stale unavailable scanner settings without exposing a key',()=>{
 assert.equal(localUnscannedUploads(local),true);
 const config=uploadScanConfiguration(local);assert.equal(config.localUnscanned,true);assert.deepEqual(config.errors,[]);
 const status=uploadAvailability(local);assert.equal(status.configurationReady,true);assert.equal(status.developmentWithoutScanner,true);assert.equal(status.localUploadCommand,null);
 assert.doesNotMatch(JSON.stringify(status),/apiKey/);
});
for(const overrides of [{NODE_ENV:'production'},{NODE_ENV:'test'},{DEPLOYMENT_STAGE:'review'},{DEPLOYMENT_STAGE:'production'},{FRONTEND_URL:'https://academy.example'},{FRONTEND_URLS:'http://localhost:3000,https://academy.example'},{FRONTEND_URL:'http://localhost.example:3000'},{LOCAL_UPLOADS_UNSCANNED:'false'},{LOCAL_UPLOADS_UNSCANNED:undefined}])test('unscanned flag cannot relax scanning outside explicit localhost development: '+JSON.stringify(overrides),()=>{
 const env={...local,...overrides};assert.equal(localUnscannedUploads(env),false);assert.equal(uploadAvailability(env).configurationReady,false);
});
function runSetup(t,content){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sa-r11-setup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const name of ['src/scripts/setupLocal.js','src/utils/localUploadMode.js']){const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(new URL('../'+name,import.meta.url),target);}
 fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');fs.writeFileSync(path.join(dir,'.env'),content);
 const env={...process.env};for(const key of Object.keys(env))if(/^(NODE_ENV|DEPLOYMENT_STAGE|FRONTEND_URLS?|LOCAL_UPLOADS_UNSCANNED)$/.test(key))delete env[key];
 const result=spawnSync(process.execPath,[path.join(dir,'src/scripts/setupLocal.js')],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return {text:fs.readFileSync(path.join(dir,'.env'),'utf8'),output:result.stdout};
}
const settings='NODE_ENV=development\nDEPLOYMENT_STAGE=development\nFRONTEND_URL=http://localhost:3000\nUPLOAD_SCAN_PROVIDER=cloudmersive\nUPLOAD_SCAN_REQUIRED=true\nCLOUDMERSIVE_API_KEY=owned-secret-unchanged\nMONGODB_URI=owned-db-unchanged\nAUTH_SECRET=owned-auth-unchanged\n';
test('normal setup adds the explicit local flag and preserves scanner/database credentials',t=>{
 const {text,output}=runSetup(t,settings);assert.match(text,/^LOCAL_UPLOADS_UNSCANNED=true$/m);for(const line of settings.trim().split('\n'))assert.ok(text.includes(line),line);assert.doesNotMatch(output,/owned-/);
});
test('normal setup honors explicit local flag false',t=>assert.match(runSetup(t,settings+'LOCAL_UPLOADS_UNSCANNED=false\n').text,/^LOCAL_UPLOADS_UNSCANNED=false$/m));
for(const tail of ['NODE_ENV=production\n','DEPLOYMENT_STAGE=review\n','FRONTEND_URL=https://academy.example\n'])test('normal setup never selects unscanned uploads for a hosted file: '+tail.trim(),t=>assert.doesNotMatch(runSetup(t,settings+tail).text,/^LOCAL_UPLOADS_UNSCANNED=/m));

const direct={socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:5000',origin:'http://localhost:3000'}};
test('request bypass accepts a direct local browser only',()=>assert.equal(localhostUploadRequest(direct),true));
for(const changes of [{host:'api.academy.example'},{origin:'https://academy.example'},{'x-forwarded-for':'203.0.113.10'},{'x-forwarded-host':'academy.example'},{forwarded:'for=203.0.113.10;host=academy.example'},{'x-sa-client-ip':'203.0.113.10'}])test('request bypass rejects public or forwarded identity '+JSON.stringify(changes),()=>assert.equal(localhostUploadRequest({...direct,headers:{...direct.headers,...changes}}),false));
test('request bypass rejects an actual nonloopback peer even if Host is forged',()=>assert.equal(localhostUploadRequest({...direct,socket:{remoteAddress:'203.0.113.10'}}),false));

test('normal setup honors a quoted export-style false flag without adding a duplicate',t=>{const {text}=runSetup(t,settings+'export LOCAL_UPLOADS_UNSCANNED = \"false\"\n');assert.doesNotMatch(text,/^LOCAL_UPLOADS_UNSCANNED=true$/m);});
