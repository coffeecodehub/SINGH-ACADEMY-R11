import test from 'node:test';import assert from 'node:assert/strict';
import {createImageWorkQueue} from '../src/services/imageWorkQueue.js';
import {createPublicImageVariantService} from '../src/services/imageVariants.js';
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
test('thumbnail queue admits only two active transforms and drains pending work in order',async()=>{
 const q=createImageWorkQueue(),work=Array.from({length:5},deferred),calls=[];
 const results=work.map((d,i)=>q.run(()=>{calls.push(i);return d.promise;}));await tick();assert.deepEqual(calls,[0,1]);assert.deepEqual(q.stats(),{active:2,queued:3});
 for(let i=0;i<5;i++){work[i].resolve(i);await tick();}assert.deepEqual(await Promise.all(results),[0,1,2,3,4]);assert.deepEqual(q.stats(),{active:0,queued:0});
});
test('queue overload is bounded and falls back without discarding in-flight work',async()=>{
 const q=createImageWorkQueue({parallel:1,maxQueued:1}),a=deferred();let extra=0;
 const one=q.run(()=>a.promise),two=q.run(()=>2);assert.equal(await q.run(()=>++extra),null);assert.equal(extra,0);a.resolve(1);assert.deepEqual(await Promise.all([one,two]),[1,2]);
});
test('queued thumbnail deadline returns fallback, does not execute expired job',async()=>{
 const q=createImageWorkQueue({parallel:1,waitMs:10}),a=deferred();let extra=0;
 const one=q.run(()=>a.promise);assert.equal(await q.run(()=>++extra),null);a.resolve(1);await one;await tick();assert.equal(extra,0);assert.equal(q.stats().queued,0);
});
test('failed transform releases the queue so subsequent photos still load',async()=>{
 const q=createImageWorkQueue({parallel:1});const failed=q.run(()=>{throw Error('bad image');}),next=q.run(()=>7);await assert.rejects(failed,/bad image/);assert.equal(await next,7);
});
const id='a'.repeat(24),file={length:5,contentType:'image/jpeg',metadata:{purpose:'cms'},uploadDate:'2026-10-04'};
function fixture(){let reads=0,transforms=0;const bucket={async *openDownloadStream(){reads++;yield Buffer.from('photo');}};const render=createPublicImageVariantService({transform:async(_,w)=>{transforms++;return Buffer.from('webp-'+w);}});return{bucket,render,stats:()=>({reads,transforms})};}
test('same responsive variant requests coalesce into one GridFS read and one transform',async()=>{
 const f=fixture(),out=await Promise.all(Array.from({length:6},()=>f.render(f.bucket,id,file,480)));assert.equal(out.every(b=>b.toString()==='webp-480'),true);assert.deepEqual(f.stats(),{reads:1,transforms:1});
});
test('different responsive widths share the authorised original bytes',async()=>{
 const f=fixture();await Promise.all([240,480,720,1080].map(w=>f.render(f.bucket,id,file,w)));assert.deepEqual(f.stats(),{reads:1,transforms:4});
});
test('image revision invalidates source and transformed bytes',async()=>{
 const f=fixture();await f.render(f.bucket,id,file,480);await f.render(f.bucket,id,{...file,uploadDate:'2026-10-05'},480);assert.deepEqual(f.stats(),{reads:2,transforms:2});
});
for(const purpose of ['student-assessment','payment-receipt'])test('private '+purpose+' never enters public byte cache',async()=>{
 const f=fixture();assert.equal(await f.render(f.bucket,id,{...file,metadata:{purpose}},480),null);assert.deepEqual(f.stats(),{reads:0,transforms:0});
});
for(const contentType of ['video/mp4','application/pdf','image/svg+xml','text/html'])test('not a raster catalog photograph: '+contentType,async()=>{
 const f=fixture();assert.equal(await f.render(f.bucket,id,{...file,contentType},480),null);assert.equal(f.stats().reads,0);
});
for(const length of [0,-1,NaN,Infinity,1.5])test('invalid image length returns safe original fallback: '+length,async()=>{
 const f=fixture();assert.equal(await f.render(f.bucket,id,{...file,length},480),null);assert.equal(f.stats().reads,0);
});
test('failed source stream is not cached; later request can recover',async()=>{
 let count=0;const render=createPublicImageVariantService({transform:async b=>b}),bucket={async *openDownloadStream(){if(++count===1)throw Error('transient');yield Buffer.from('photo');}};
 await assert.rejects(render(bucket,id,file,480),/transient/);assert.equal((await render(bucket,id,file,480)).toString(),'photo');assert.equal(count,2);
});
