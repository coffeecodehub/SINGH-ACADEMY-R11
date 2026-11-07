import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {createVideoReviewRouters} from '../src/routes/videoReviewRoutes.js';
import {validateVideoReview,publicVideoReview} from '../src/utils/videoReviews.js';
const value=(extra={})=>({title:'A learning perspective',description:'An original community review.',videoUrl:'https://youtu.be/abcdefghijk',published:false,teaserSeconds:15,order:0,...extra});
for(const url of ['javascript:alert(1)','data:video/mp4;base64,x','//evil.test/video','http://video.test/a.mp4','https://user:secret@video.test/a.mp4','/api/media/private','blob:untrusted'])test('video reviews reject unsafe URL '+url,()=>assert.throws(()=>validateVideoReview(value({videoUrl:url})),/URL|HTTPS|identifier/));
test('review validation bounds plain content, publication, ordering and 10–20 second preview',()=>{
 for(const patch of [{title:''},{description:'<script>unsafe</script>'},{published:'true'},{teaserSeconds:9},{teaserSeconds:21},{teaserSeconds:10.5},{order:-1}])assert.throws(()=>validateVideoReview(value(patch)));
 for(const teaserSeconds of [10,15,20])assert.equal(validateVideoReview(value({teaserSeconds})).teaserSeconds,teaserSeconds);
 const v=validateVideoReview({...value(),createdBy:'attacker',role:'super_admin',$set:{published:true}});assert.equal(v.createdBy,undefined);assert.equal(v.$set,undefined);
});
test('unsupported HTTPS social sources are retained as links and uploaded IDs must match exactly',()=>{
 assert.equal(validateVideoReview(value({videoUrl:'https://www.instagram.com/reel/review123/'})).videoFileId,null);
 const id='a'.repeat(24);assert.throws(()=>validateVideoReview(value({videoUrl:'/api/media/'+id,videoFileId:'b'.repeat(24)})),/match/);
 assert.equal(validateVideoReview(value({videoUrl:'/api/media/'+id,videoFileId:id})).videoFileId,id);
 assert.equal(publicVideoReview({_id:id,...value(),createdBy:'private',videoFileId:id,revision:3}).revision,undefined);
});
function memory(){
 const documents=new Map();let next=0;
 const matches=(doc,query)=>Object.entries(query).every(([key,value])=>doc[key]===value);
 return {documents,find(query){return {sort(){return this;},limit(){return this;},lean:async()=>[...documents.values()].filter(item=>matches(item,query)).map(item=>structuredClone(item))};},findOne(query){return {lean:async()=>structuredClone([...documents.values()].find(item=>matches(item,query))||null)};},
  async create(doc){const item={_id:(++next).toString(16).padStart(24,'0'),...doc};documents.set(item._id,item);return structuredClone(item);},
  async findOneAndUpdate(query,update){const item=[...documents.values()].find(item=>matches(item,query));if(!item)return null;Object.assign(item,update.$set,{revision:item.revision+1});return structuredClone(item);},
  async findOneAndDelete(query){const item=[...documents.values()].find(item=>matches(item,query));if(!item)return null;documents.delete(item._id);return item;}};
}
async function serve(t,{role,model=memory(),checkMedia=async()=>{}}={}){
 const app=express();app.use(express.json());const authenticate=(req,res,next)=>{if(!role)return res.status(401).json({success:false});req.user={_id:'a'.repeat(24),role,normalizedRole:role};next();};
 const routes=createVideoReviewRouters({model,authenticate,checkMedia,limitRequests:()=>((req,res,next)=>next())});app.use('/public',routes.publicRouter);app.use('/admin',routes.adminRouter);app.use((error,req,res,next)=>res.status(error.status||500).json({success:false,message:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});return {origin:'http://127.0.0.1:'+server.address().port,model};
}
for(const role of [undefined,'student'])test('anonymous/student cannot publish or upload video reviews: '+role,async t=>{
 const {origin}=await serve(t,{role});for(const [path,method]of [['/admin','GET'],['/admin','POST'],['/admin/upload','POST'],['/admin/upload-status','GET'],['/admin/'+'a'.repeat(24),'PATCH'],['/admin/'+'a'.repeat(24),'DELETE']])assert.equal((await fetch(origin+path,{method,headers:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(value())})})).status,role?403:401);
 assert.equal((await fetch(origin+'/public',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value({published:true}))})).status,404);
});
for(const role of ['client_admin','super_admin'])test(role+' can create private drafts, publish and delete with revision protection',async t=>{
 const model=memory(),admin=await serve(t,{role,model}),reader=await serve(t,{model});
 const write=(method,path,body)=>fetch(admin.origin+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 let response=await write('POST','/admin',value());assert.equal(response.status,201);const first=(await response.json()).item;assert.equal(first.revision,1);
 assert.equal((await (await fetch(reader.origin+'/public')).json()).items.length,0);assert.equal((await fetch(reader.origin+'/public/'+first._id)).status,404);
 response=await write('PATCH','/admin/'+first._id,{...value({published:true}),revision:1});assert.equal(response.status,200);
 const publicData=await (await fetch(reader.origin+'/public')).json();assert.equal(publicData.items.length,1);assert.equal(publicData.items[0].revision,undefined);assert.equal(publicData.items[0].createdBy,undefined);
 const races=await Promise.all([write('PATCH','/admin/'+first._id,{...value({published:true}),revision:2}),write('PATCH','/admin/'+first._id,{...value(),revision:2})]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
 assert.equal((await write('DELETE','/admin/'+first._id,{revision:2})).status,409);assert.equal((await write('DELETE','/admin/'+first._id,{revision:3})).status,200);assert.equal(model.documents.size,0);
});
test('a media-validation refusal prevents publication instead of granting a private course reference',async t=>{
 const {origin,model}=await serve(t,{role:'client_admin',checkMedia:async()=>{throw Object.assign(Error('Private course media rejected'),{status:400});}});
 const response=await fetch(origin+'/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value({videoUrl:'/api/media/'+'a'.repeat(24),videoFileId:'a'.repeat(24),published:true}))});assert.equal(response.status,400);assert.equal(model.documents.size,0);
});
