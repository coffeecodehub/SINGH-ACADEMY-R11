import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicImageReferenceService} from '../src/services/publicImageReferences.js';
import {createContentCache} from '../src/services/catalogCache.js';

const names=['Course','TeamMember','Event','SiteContent','Section','PageSection'];
const id=n=>n.toString(16).padStart(24,'0');
function fixture({records=()=>[],exists=async()=>false,batchSize=32,parallel=2}={}){
 const calls=[],scheduled=[],cache=createContentCache();
 const models=Object.fromEntries(names.map(name=>[name,{find(filter){
  const call={name,filter};calls.push(call);
  return {select(fields){call.fields=fields;return this;},limit(limit){call.limit=limit;return this;},lean(){return Promise.resolve().then(()=>records(name,call));}};
 },exists(filter){calls.push({name,filter,point:true});return exists(name,filter);}}]));
 const read=createPublicImageReferenceService({models,cache,batchSize,parallel,schedule:fn=>scheduled.push(fn)});
 const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();while(scheduled.length){scheduled.shift()();for(let i=0;i<24;i++)await Promise.resolve();}};
 return {read,calls,cache,flush,scheduled};
}
test('32 simultaneous cold images use six lean publication queries instead of 192 per-image queries',async()=>{
 const f=fixture({records:name=>name==='SiteContent'?[{value:{images:Array.from({length:32},(_,i)=>({fileId:id(i+1)}))}}]:[]});
 const pending=Array.from({length:32},(_,i)=>f.read(id(i+1)));await f.flush();
 assert.ok((await Promise.all(pending)).every(Boolean));assert.equal(f.calls.length,6);
 for(const call of f.calls){assert.equal(call.limit,512);assert.ok(call.fields);assert.equal(Object.hasOwn(call.filter,'user'),false);}
 await f.read(id(1));assert.equal(f.calls.length,6,'responsive sizes share the same per-image publication cache');
 assert.deepEqual(f.calls.find(c=>c.name==='Section').filter,{published:true,archivedAt:null,thumbnailFileId:{$in:Array.from({length:32},(_,i)=>id(i+1))}});
});
test('publication parsing accepts six original reference types but never cross-pairs gallery IDs and URLs',async()=>{
 const f=fixture({records:name=>({
  Course:[{thumbnailFileId:id(1),gallery:[{fileId:id(2)}]}],TeamMember:[{imageFileId:id(3)}],Event:[{imageFileId:id(4)}],SiteContent:[{value:{images:[{fileId:id(5)},{fileId:id(11).toUpperCase()}]}}],Section:[{thumbnailFileId:id(6)}],
  PageSection:[{blocks:[{published:true,imageFileId:id(7),gallery:[{imageFileId:id(8),imageUrl:'/api/media/'+id(8)},{imageFileId:id(9),imageUrl:'/api/media/'+id(10)}]},{published:false,imageFileId:id(10)}]}]
 })[name]});
 const pending=Array.from({length:11},(_,i)=>f.read(id(i+1)));await f.flush();
 assert.deepEqual(await Promise.all(pending),[true,true,true,true,true,true,true,true,false,false,false]);
 assert.equal(f.calls.find(c=>c.name==='TeamMember').filter.active,true);
 assert.equal(f.calls.find(c=>c.name==='Event').filter.status,'published');
 assert.equal(f.calls.find(c=>c.name==='PageSection').filter.blocks.$elemMatch.published,true);
});
test('saturated projections use bounded exact checks so a repeated image cannot hide a different public image',async()=>{
 const f=fixture({records:name=>name==='Course'?Array.from({length:512},()=>({thumbnailFileId:id(1)})):[],exists:async(name,filter)=>name==='Course'&&filter.$or[0].thumbnailFileId.$in[0]===id(2)});
 const first=f.read(id(1)),last=f.read(id(2));await f.flush();assert.deepEqual(await Promise.all([first,last]),[true,true]);assert.equal(f.calls.filter(c=>c.point).length,1);
});
test('unpublish/delete/media replacement invalidation cannot be undone by an old in-flight batch',async()=>{
 let finish,old=true,reads=0;
 const f=fixture({records:async name=>{
  if(name!=='SiteContent')return [];
  reads++;if(old){old=false;return new Promise(resolve=>{finish=()=>resolve([{value:{images:[{fileId:id(1)}]}}]);});}return [];
 }});
 const earlier=f.read(id(1));await f.flush();assert.equal(reads,1);f.cache.clear();
 const fresh=f.read(id(1));await f.flush();assert.equal(await fresh,false);finish();await f.flush();assert.equal(await earlier,true);
 assert.equal(await f.read(id(1)),false,'stale completion never repopulates the cleared cache');assert.equal(reads,2);
});
test('batch concurrency stays bounded and a failed batch can retry cleanly',async()=>{
 let first=true,release;const f=fixture({batchSize:1,parallel:1,records:async name=>{
  if(name==='Course'&&first){first=false;return new Promise((resolve,reject)=>{release=()=>reject(Error('database unavailable'));});}return [];
 }});
 const failed=f.read(id(1)).catch(e=>e),waiting=f.read(id(2));await f.flush();assert.equal(f.calls.length,6);release();await f.flush();
 assert.match((await failed).message,/database/);assert.equal(await waiting,false);assert.equal(f.calls.length,12);
 const retry=f.read(id(1));await f.flush();assert.equal(await retry,false);assert.equal(f.calls.length,18);
 assert.equal(await f.read('invalid'),false);assert.equal(f.calls.length,18);
});
