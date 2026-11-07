import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {localUploadPlan,configureLocalUploads} from '../src/utils/localUploads.js';
import {uploadAvailability} from '../src/utils/uploadAvailability.js';
const original='NODE_ENV=development\r\nDEPLOYMENT_STAGE=development\r\nFRONTEND_URL=http://localhost:3000\r\nMONGODB_URI=mongodb://secret-fixture-only\r\nAUTH_SECRET=fixture-secret-unchanged\r\nCLOUDMERSIVE_API_KEY=fixture-scanner-key-unchanged\r\nUPLOAD_SCAN_PROVIDER=cloudmersive\r\nUPLOAD_SCAN_REQUIRED=true\r\nCLAMAV_HOST=old-fixture-only\r\n';
test('local plan resolves stale scanner configuration without changing database/auth/scanner credentials',()=>{
 const plan=localUploadPlan(original);assert.equal(plan.changed,true);assert.match(plan.content,/UPLOAD_SCAN_PROVIDER=clamav/);assert.match(plan.content,/UPLOAD_SCAN_REQUIRED=false/);assert.match(plan.content,/CLAMAV_HOST=\r?\n/);assert.match(plan.content,/ADMIN_MEDIA_MAX_UPLOAD_MB=0/);
 for(const line of original.split('\r\n').filter(line=>/^(MONGODB_URI|AUTH_SECRET|CLOUDMERSIVE_API_KEY)=/.test(line)))assert.ok(plan.content.includes(line));
 assert.equal(localUploadPlan(plan.content).changed,false);
});
for(const extra of ['NODE_ENV=production','DEPLOYMENT_STAGE=review','FRONTEND_URL=https://singhacademy.com'])test('refuses hosted settings without relabeling them: '+extra,()=>assert.throws(()=>localUploadPlan(original+'\r\n'+extra+'\r\n'),/Hosted|localhost/));
test('exported contradictory upload values cannot falsely report a working file-only fix',()=>assert.throws(()=>localUploadPlan(original,{UPLOAD_SCAN_PROVIDER:'cloudmersive'}),/exported upload setting/));
test('dry run does not mutate; explicit apply creates private backup, retains credentials and is idempotent',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sa-r6-local-upload-'));try{const target=path.join(dir,'.env');fs.writeFileSync(target,original);const before=fs.readdirSync(dir);const check=configureLocalUploads({target,env:{}});assert.equal(check.applied,false);assert.deepEqual(fs.readdirSync(dir),before);assert.equal(fs.readFileSync(target,'utf8'),original);
  const applied=configureLocalUploads({target,apply:true,env:{}});assert.equal(applied.backupCreated,true);const backup=fs.readdirSync(dir).find(name=>name.startsWith('.env.uploads-local-backup-'));assert.equal(fs.readFileSync(path.join(dir,backup),'utf8'),original);const changed=fs.readFileSync(target,'utf8');assert.match(changed,/fixture-secret-unchanged/);assert.equal(configureLocalUploads({target,apply:true,env:{}}).changed,false);assert.equal(fs.readdirSync(dir).length,2);assert.doesNotMatch(JSON.stringify(applied),/fixture-secret|fixture-scanner|mongodb:/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('sanitized availability exposes one exact local fix command only in non-hosted mode',()=>{
 const local=uploadAvailability({NODE_ENV:'development',DEPLOYMENT_STAGE:'development',UPLOAD_SCAN_PROVIDER:'cloudmersive'});assert.equal(local.configurationReady,false);assert.equal(local.code,'UPLOAD_SCAN_CONFIGURATION');assert.equal(local.localUploadCommand,'npm.cmd run uploads:local -- --apply');
 const hosted=uploadAvailability({NODE_ENV:'production',UPLOAD_SCAN_PROVIDER:'cloudmersive'});assert.equal(hosted.localUploadCommand,null);assert.equal(hosted.required,true);
});
