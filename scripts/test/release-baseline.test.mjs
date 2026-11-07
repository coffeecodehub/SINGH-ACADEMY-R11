import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateReleaseBaseline} from '../generate-release-baseline.mjs';
import {verifyReleaseBaseline,usesReleaseBaseline,RELEASE_BASELINE,sha256} from '../release-baseline.mjs';
import {verifyPaymentUiScope} from '../verify-payment-scope.mjs';
const quiet={log(){}};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sa-reviewed-release-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 function write(name,value){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));}
 for(const scope of ['','backend/','frontend/'])write(scope+'package.json',{name:'release-fixture',version:'60.16.0'});
 const original=Buffer.from([0,255,1,2,3,4]);write('frontend/public/original.png',original);write('backend/src/assets/certificate.png',original);
 write('qa/v60.9/preserved-files.json',{'frontend/public/original.png':sha256(original),'backend/src/assets/certificate.png':sha256(original),'frontend/app/auth.css':sha256('old authorized CSS')});
 write('qa/v50/original-public-sha256.json',{'frontend/public/original.png':sha256(original)});
 write('frontend/components/NewSections.tsx','export default function Section(){return null;}');write('frontend/app/auth.css','new user-authorized CSS');write('backend/src/section.js','export const section=true;');
 write('qa/fixtures/render.mjs','export const fixture=true;');write('qa/results.json',{status:'old output'});write('frontend/next-env.d.ts','generated reference');
 return {root,write,generate:(options={})=>generateReleaseBaseline({root,acknowledged:true,logger:quiet,...options}),verify:()=>verifyReleaseBaseline({root,logger:quiet})};
}
test('explicit current-version snapshot accepts authorized source/CSS while checking every original binary asset',t=>{const f=fixture(t),snapshot=f.generate(),result=f.verify();assert.equal(result.retainedAssets,2);assert.ok(snapshot.files.some(file=>file.path==='frontend/components/NewSections.tsx'));assert.ok(snapshot.files.some(file=>file.path==='qa/fixtures/render.mjs'));assert.equal(snapshot.files.some(file=>file.path==='qa/results.json'),false);assert.equal(usesReleaseBaseline(f.root),true);assert.deepEqual(verifyPaymentUiScope({root:f.root,logger:quiet}),result);});
test('verification is read-only and never invents a missing reviewed snapshot',t=>{const f=fixture(t);assert.throws(f.verify,/Missing reviewed/);assert.equal(fs.existsSync(path.join(f.root,RELEASE_BASELINE)),false);assert.throws(()=>generateReleaseBaseline({root:f.root,logger:quiet}),/Explicit acknowledgement/);});
test('changed and missing newly introduced application source both fail',t=>{const f=fixture(t);f.generate();f.write('frontend/components/NewSections.tsx','export default function Section(){return "tampered";}');assert.throws(f.verify,/bytes changed/);fs.rmSync(path.join(f.root,'frontend/components/NewSections.tsx'));assert.throws(f.verify,/missing/);});
test('new unknown executable source cannot hide outside the reviewed file list',t=>{const f=fixture(t);f.generate();f.write('new-feature-directory/unreviewed.ts','export const unreviewed=true;');assert.throws(f.verify,/new file outside/);});
test('hand-authored QA fixture source is protected even while generated QA output changes freely',t=>{const f=fixture(t);f.generate();f.write('qa/results.json',{status:'new run output'});f.write('frontend/next-env.d.ts','new generated route reference');f.verify();f.write('qa/fixtures/render.mjs','throw Error("tampered fixture");');assert.throws(f.verify,/qa\/fixtures\/render.mjs: bytes changed/);});
test('explicit regeneration still cannot approve destructive changes to existing public/certificate assets',t=>{const f=fixture(t);f.generate();f.write('frontend/public/original.png',Buffer.from([8,9]));assert.throws(()=>f.generate({replaceReviewed:true}),/Original public\/certificate asset changed/);});
test('uploaded photographs retain their supplied provenance bytes even during a reviewed regeneration',t=>{const f=fixture(t),data=Buffer.from('original uploaded image bytes');f.write('frontend/public/images/global-learning/photo.jpg',data);f.write('docs/global-learning-images.json',{images:[{src:'/images/global-learning/photo.jpg',sha256:sha256(data)}]});f.generate();assert.equal(f.verify().originalUploads,1);f.write('frontend/public/images/global-learning/photo.jpg','compressed replacement');assert.throws(()=>f.generate({replaceReviewed:true}),/original photograph changed/);});
test('snapshot omissions and unsafe traversal entries fail before reading arbitrary paths',t=>{const f=fixture(t);f.generate();const file=path.join(f.root,RELEASE_BASELINE),baseline=JSON.parse(fs.readFileSync(file));baseline.files=baseline.files.filter(entry=>entry.path!=='backend/src/section.js');f.write(RELEASE_BASELINE,baseline);assert.throws(f.verify,/new file outside/);baseline.files.push({path:'../outside.js',sha256:'a'.repeat(64)});f.write(RELEASE_BASELINE,baseline);assert.throws(f.verify,/Invalid or duplicate/);});
test('replacing an existing reviewed baseline requires an explicit reviewed-update flag',t=>{const f=fixture(t);f.generate();assert.throws(f.generate,/--replace-reviewed/);f.write('backend/src/section.js','export const section="approved edit";');f.generate({replaceReviewed:true});f.verify();});
