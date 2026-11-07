/** Real exported functions / handlers with explicit DB stubs, not a live Atlas test. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {EventEmitter} from 'node:events';import {createContentCache} from '../src/services/catalogCache.js';
import {load,response,query} from './testLoader.js';import * as security from '../src/utils/security.js';
import {businessError} from '../src/utils/business.js';import {publicCompletion} from '../src/utils/completion.js';
import {imageWidth} from '../src/services/imageVariants.js';
import {createPublicImageReferenceService} from '../src/services/publicImageReferences.js';
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('CMS cache coalesces simultaneous catalog reads into one loader',async()=>{let reads=0;const p=deferred(),cache=createContentCache();const tasks=Array.from({length:12},()=>cache.get('team',async()=>{reads++;return p.promise;}));await Promise.resolve();assert.equal(reads,1);p.resolve([{name:'Founder'}]);const all=await Promise.all(tasks);assert.equal(all.length,12);assert.equal(all[0][0].name,'Founder');assert.equal(cache.stats().inFlight,0);});
test('CMS cache refreshes after its bounded TTL',async()=>{let now=0,reads=0;const cache=createContentCache({clock:()=>now}),fetch=()=>++reads;assert.equal(await cache.get('x',fetch,10000),1);now=9999;assert.equal(await cache.get('x',fetch,10000),1);now=10000;assert.equal(await cache.get('x',fetch,10000),2);});
test('admin invalidation cannot be undone by an old in-flight catalog response',async()=>{const cache=createContentCache(),p=deferred();const old=cache.get('x',()=>p.promise);cache.clear();assert.equal(await cache.get('x',()=>({version:2})).then(x=>x.version),2);p.resolve({version:1});await old;assert.equal((await cache.get('x',()=>({version:3}))).version,2);});
test('failed database requests are never cached as empty courses',async()=>{const cache=createContentCache();await assert.rejects(()=>cache.get('x',()=>{throw Error('down');}),/down/);assert.equal(cache.stats().entries,0);assert.deepEqual(await cache.get('x',()=>['real']),['real']);});
test('image cache memory and number of records remain bounded',async()=>{const cache=createContentCache({limit:2,maxBytes:16});for(let n=0;n<10;n++)await cache.get(String(n),()=>Buffer.alloc(8));assert.ok(cache.stats().bytes<=16);assert.ok(cache.stats().entries<=2);await cache.get('oversized',()=>Buffer.alloc(20));assert.ok(cache.stats().bytes<=16);});
test('a busy image transformer null fallback is not cached for five minutes',async()=>{const cache=createContentCache();await cache.get('img',()=>null,300000,{cacheNull:false});assert.equal(cache.stats().entries,0);assert.equal((await cache.get('img',()=>Buffer.from('real'),300000,{cacheNull:false})).toString(),'real');});
for(const [method,url,status,expected] of [['PATCH','/api/admin/content/team/x',200,1],['POST','/api/admin/content/courses',201,1],['PUT','/api/admin/site/websiteContent',200,1],['PATCH','/api/academy-admin/plans',200,1],['PATCH','/api/admin/content/team/x',403,0],['POST','/api/payments/checkout',200,0],['GET','/api/admin/content/team',200,0]])test(`cache invalidation follows successful CMS writes only: ${method} ${url} ${status}`,()=>{let clears=0;const {catalogInvalidation}=load('../src/middleware/catalogInvalidation.js',{catalogCache:{clear:()=>clears++}},'({catalogInvalidation})');const res=new EventEmitter();res.statusCode=status;let next=0;catalogInvalidation({method,originalUrl:url},res,()=>next++);assert.equal(clears,0);res.emit('finish');assert.equal(clears,expected);assert.equal(next,1);});
test('compact page session does not query enrollments or membership while preserving real identity',async()=>{let reads=0;const {sessionPayload}=load('../src/controllers/authController.js',{...security,Enrollment:{findOne:()=>{reads++;throw Error();}},Subscription:{exists:()=>{reads++;throw Error();}}},'({sessionPayload})');const out=await sessionPayload({user:{_id:'learner',role:'student',name:'Learner',passwordHash:'hidden'},portal:'student',session:{setupOnly:false}},true);assert.equal(out.user.id,'learner');assert.equal(out.user.passwordHash,undefined);assert.equal(reads,0);});
test('new login expires old API-path cookies and issues a root-scoped HttpOnly session',async()=>{const {issueSession}=load('../src/services/sessions.js',{...security,AuthSession:{create:async v=>v,updateOne:async()=>{}},requestMeta:()=>({})},'({issueSession})');const res=response();await issueSession({cookies:{}},res,{_id:'u',role:'student'},'student');assert.equal(res.cookies[0][1].length,64);assert.equal(res.cookies[0][2].path,'/');assert.equal(res.cookies[0][2].httpOnly,true);assert.equal(res.cookies[0][2].sameSite,'lax');for(const path of ['/api','/api/','/api/auth'])assert.ok(res.cleared.some(([name,o])=>name===security.COOKIE_NAMES.student&&o.path===path));});
test('login-only catalog gate is mounted after webhook receiver and before data routers',()=>{const src=read('../src/app.js'),gate=src.indexOf("app.use(['/api/content','/api/courses','/api/reviews'],catalogAccess)");assert.ok(gate>src.indexOf("app.use('/api/payments/webhooks'"));assert.ok(gate<src.indexOf("app.use('/api/contact'"));});
const A='a'.repeat(24),B='b'.repeat(24);
function certificateFixture(items=[]){const routes=new Map(),checks=[];const pass=()=>{};const router={use(){},get(path,...handlers){routes.set('GET '+path,handlers);},post(){}};
 const requireRole=(...roles)=>{const gate=(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({success:false});gate.roles=roles;return gate;};
 load('../src/routes/certificateRoutes.js',{Router:()=>router,requireAuth:pass,requireRole,rateLimit:()=>pass,businessError,objectId:id=>id.toLowerCase(),publicCompletion,CourseCompletion:{find(filter){checks.push(filter);return {select(fields){checks.push(fields);return {lean:async()=>items};}}}}},'r');
 return {checks,routes,run:async req=>{const res=response();res.headers={};res.set=(k,v)=>(res.headers[k]=v,res);const steps=routes.get('GET /status');let denied=false;steps[0](req,res,()=>{denied=false;});if(res.code!==200)return res;await steps.at(-1)(req,res);return res;}};
}
test('certificate polling query binds every ID to the requesting student and returns minimal status',async()=>{const f=certificateFixture([{_id:A,user:'u',status:'issued',courseTitle:'My course',pdf:Buffer.from('private'),verificationToken:'secret'}]);const res=await f.run({user:{_id:'u',role:'student'},query:{ids:A+','+B+','+A}});assert.deepEqual(f.checks[0],{user:'u',_id:{$in:[A,B]}});assert.equal(res.body.items[0].status,'issued');assert.equal(JSON.stringify(res.body).includes('private'),false);assert.equal(JSON.stringify(res.body).includes('secret'),false);assert.match(res.headers['Cache-Control'],/no-store/);assert.doesNotMatch(f.checks[1],/pdf|verificationToken/);});
test('unknown or another students completion returns no status, never a global fallback',async()=>{const f=certificateFixture();const res=await f.run({user:{_id:'other',role:'student'},query:{ids:A}});assert.equal(f.checks[0].user,'other');assert.deepEqual(res.body.items,[]);});
for(const role of ['client_admin','super_admin'])test('student certificate watcher rejects '+role,async()=>{const f=certificateFixture();const res=await f.run({user:{_id:'staff',role},query:{ids:A}});assert.equal(res.code,403);assert.equal(f.checks.length,0);});
for(const ids of [undefined,[],{$ne:null},'',A+',bad','a'.repeat(2501),Array.from({length:101},(_,i)=>i.toString(16).padStart(24,'0')).join(',')])test('invalid certificate status request fails before DB lookup '+JSON.stringify(ids)?.slice(0,60),async()=>{const f=certificateFixture();await assert.rejects(()=>f.run({user:{_id:'u',role:'student'},query:{ids}}),{status:400});assert.equal(f.checks.length,0);});
for(const value of ['240','480','720','1080','1600'])test('bounded CMS image variant '+value,()=>assert.equal(imageWidth(value),Number(value)));
for(const value of ['-1','4096','Infinity','720.0','0',{},['720','480']])test('arbitrary resize inputs do not reach image processor '+JSON.stringify(value),()=>assert.equal(imageWidth(value),0));
test('learner private file purposes remain checked before generic CMS/image access',()=>{
 const source=read('../src/routes/mediaRoutes.js');
 assert.ok(source.includes("file.metadata?.purpose==='payment-receipt'"));
 assert.ok(source.includes("file.metadata?.purpose==='student-assessment'"));
 assert.ok(source.includes("['cms','cms-page-section'].includes(file.metadata.purpose)"));
 assert.match(source,/const reviewVideo=file\.metadata\?\.purpose==='video-review'&&/);
 assert.match(source,/const publicReviewVideo=reviewVideo&&await VideoReview\.exists\(\{published:true,videoFileId:String\(id\),videoUrl:'\/api\/media\/'\+String\(id\)\}\)/);
 assert.match(source,/if\(!publicImage&&!publicReviewVideo\)user=await optionalUser\(req\)/);
 const receipt=source.indexOf("if(file.metadata?.purpose==='payment-receipt')"),assignment=source.indexOf("}else if(file.metadata?.purpose==='student-assessment')"),review=source.indexOf('}else if(reviewVideo)'),generic=source.indexOf('}else if(!publicImage&&!await visibleTo');
 assert.ok(receipt>=0&&assignment>receipt&&review>assignment&&generic>review);
 assert.match(source,/if\(publicImage&&!forceDownload\)/);
});

function mediaFixture({purpose='cms',published=true,user=null,variant=Buffer.from('webp-test'),type='image/jpeg'}={}){
 const routes=new Map(),stats={auth:0,variants:0,refs:0,streams:0};
 const router={get(path,...handlers){routes.set(path,handlers.at(-1));}};
 const file={length:100,contentType:type,filename:'photo.jpg',metadata:{purpose}};
 const bucket={find:()=>({toArray:async()=>[file]}),openDownloadStream(){stats.streams++;throw Error('No stream expected in this HEAD/variant test');}};
 class ObjectId{constructor(value){this.value=value;}toString(){return this.value;}}
 const exists=async()=>{stats.refs++;return published;};
 const referenceRows={Course:[{thumbnailFileId:A}],TeamMember:[{imageFileId:A}],Event:[{imageFileId:A}],SiteContent:[{value:{images:[{fileId:A}]}}],Section:[{thumbnailFileId:A}],PageSection:[{blocks:[{published:true,imageFileId:A}]}]};
 const models=Object.fromEntries(Object.entries(referenceRows).map(([name,rows])=>[name,{find(filter){
  stats.refs++;
  if(name==='Course'||name==='Section')assert.equal(filter.published,true);
  if(name==='Section')assert.equal(filter.archivedAt,null);
  if(name==='TeamMember')assert.equal(filter.active,true);
  if(name==='Event')assert.equal(filter.status,'published');
  if(name==='SiteContent')assert.equal(filter.key,'websiteContent');
  if(name==='PageSection')assert.equal(filter.blocks.$elemMatch.published,true);
  return query(published?rows:[]);
 },exists}]));
 const isPublicImageReference=createPublicImageReferenceService({models,cache:createContentCache()});
 const deps={Router:()=>router,mongoose:{isValidObjectId:v=>/^[a-f0-9]{24}$/.test(v),Types:{ObjectId},connection:{db:{}},mongo:{GridFSBucket:class{constructor(){return bucket;}}}},validPortal:v=>['student','client_admin','super_admin'].includes(v),resolveSession:async()=>{stats.auth++;return user?{user,session:{setupOnly:false}}:null;},normalizeRole:v=>v,configuredOrigins:()=>[],httpError:(status,message)=>Object.assign(new Error(message),{status}),parseByteRange:()=>null,realAccessFilter:()=>({}),activeEnrollmentWindow:()=>({}),lessonMediaQuery:()=>({}),catalogCache:createContentCache(),imageWidth,publicImageVariant:async()=>{stats.variants++;return variant;},Course:{exists,find:()=>query([])},Section:{exists},PageSection:{exists},TeamMember:{exists},Event:{exists},SiteContent:{exists},Lesson:{find:()=>query([])},Module:{find:()=>query([])},PaymentAttachment:{exists:async()=>!!user},StudentFile:{exists:async()=>!!user},Enrollment:{exists:async()=>false},Subscription:{exists:async()=>false}};
 load('../src/routes/mediaRoutes.js',{...deps,isPublicImageReference},'({r})');
 const res={...response(),headers:new Map(),set(k,v){this.headers.set(k.toLowerCase(),v);return this;},removeHeader(k){this.headers.delete(k.toLowerCase());},end(){this.ended=true;return this;},send(body){this.body=body;return this;}};
 return {stats,res,run:(req={})=>routes.get('/:id')({params:{id:A},query:{w:'720'},headers:{},method:'HEAD',...req},res,e=>{throw e;})};
}
test('published CMS image variant skips all learner-session reads',async()=>{const f=mediaFixture();await f.run({method:'GET'});assert.equal(f.stats.auth,0);assert.equal(f.stats.refs,6);assert.equal(f.stats.variants,1);assert.equal(f.res.headers.get('content-type'),'image/webp');assert.equal(f.res.headers.get('cache-control'),'private, max-age=300');assert.equal(f.res.body.toString(),'webp-test');});
test('image processor busy falls back to original rather than a broken thumbnail',async()=>{const f=mediaFixture({variant:null});await f.run();assert.equal(f.stats.variants,1);assert.equal(f.res.headers.get('content-type'),'image/jpeg');assert.equal(f.res.headers.get('content-length'),'100');assert.equal(f.res.ended,true);});
test('private receipt screenshot never uses the public derivative cache even if referenced by CMS',async()=>{const f=mediaFixture({purpose:'payment-receipt',user:{_id:'owner',role:'student'},published:true});await f.run();assert.equal(f.stats.auth,1);assert.equal(f.stats.refs,0);assert.equal(f.stats.variants,0);assert.equal(f.res.headers.get('cache-control'),'private, no-store');});
test('anonymous private assignment request is denied before bytes or resize',async()=>{const f=mediaFixture({purpose:'student-assessment'});await assert.rejects(()=>f.run(),e=>e.status===401);assert.equal(f.stats.variants,0);assert.equal(f.stats.streams,0);});
test('unpublished CMS image does not acquire the public-cache marker',async()=>{const f=mediaFixture({published:false,user:{_id:'admin',role:'client_admin'}});await f.run();assert.equal(f.stats.auth,1);assert.equal(f.stats.variants,0);assert.equal(f.res.headers.has('x-sa-public-image'),false);assert.equal(f.res.headers.get('cache-control'),'private, no-store');});
test('derivative ETag revalidation responds 304 without sending duplicate image bytes',async()=>{const f=mediaFixture();await f.run({method:'GET',headers:{'if-none-match':'"sa-photo-'+A+'-720-v1"'}});assert.equal(f.res.code,304);assert.equal(f.res.ended,true);assert.equal(f.res.body,undefined);});

test('learner access is authorized before creating any assessment attempt',async()=>{
 const routes=new Map(),pass=()=>{},router={get(p,...h){routes.set('GET '+p,h.at(-1));},post(){},put(){}};let attempts=0,otherReads=0;
 const denyRead=()=>{otherReads++;throw Error('Must not read learner state before access');};
 const deps={Router:()=>router,requireAuth:pass,requireRole:()=>pass,rateLimit:()=>pass,uploadAdmission:pass,studentUploadSingle:pass,storeUpload:pass,prepareStudentUpload:pass,Course:{findOne:()=>query({_id:A,slug:'paid',published:true})},Module:{find:denyRead},Progress:{find:denyRead},CourseCompletion:{findOne:denyRead},hasCourseAccess:async()=>null,currentAttempt:async()=>{attempts++;throw Error();}};
 load('../src/routes/courseRoutes.js',deps,'({r})');const res=response();await routes.get('GET /:slug/learn')({params:{slug:'paid'},user:{id:'owner',_id:'owner'}},res,e=>{throw e;});assert.equal(res.code,403);assert.equal(attempts,0);assert.equal(otherReads,0);
});
