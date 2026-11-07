/** Regression contracts for enrollment-only My Courses and independent full-library
 * membership authorization. Explicit dependency doubles, no production DB or API. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './testLoader.js';
import {publicRegionalProduct} from '../src/services/regionalPricing.js';

const uid='100000000000000000000001',other='100000000000000000000002';
const courseList=[
 {_id:'a',slug:'existing',published:true,accessType:'paid',title:'Existing course',createdAt:new Date('2026-01-01')},
 {_id:'b',slug:'new',published:true,accessType:'paid',title:'Course published later',createdAt:new Date('2026-10-10')},
 {_id:'c',slug:'another',published:true,accessType:'paid',title:'Unpurchased course'},
 {_id:'d',slug:'free',published:true,accessType:'free',title:'Free course'}
];
const membership={user:uid,status:'active',testMode:false,startsAt:new Date('2026-01-01'),endsAt:new Date('2028-01-01'),invoice:'invoice-1'};
const explicit='Enrolled through active Academy membership.';
const oldAuto='Academy membership: 1-Year Membership';
const query=value=>({select(){return this;},sort(){return this;},session(){return this;},lean(){return Promise.resolve(value);},then(a,b){return Promise.resolve(value).then(a,b);}});
const router=()=>{const routes=new Map();return {get(path,...args){routes.set('GET '+path,args.at(-1));return this;},post(path,...args){routes.set('POST '+path,args.at(-1));return this;},put(path,...args){routes.set('PUT '+path,args.at(-1));return this;},routes};};
const fakeResponse=()=>({body:null,statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}});
function fixture({member=membership,rows=[],grants=[],owner=uid}={}){
 const data=structuredClone(rows),all=structuredClone(courseList).map(course=>({...course,price:course.accessType==='free'?0:100,currency:'USD',accessMonths:1})),calls=[];
 const eligible=q=>member&&member.user===q.user&&member.status==='active'&&member.testMode!==true&&new Date(member.startsAt)<=new Date()&&new Date(member.endsAt)>new Date();
 const models={
  Course:{find:filter=>{calls.push(['courseFind',filter]);assert.ok(filter.slug?.$in,'My Courses must not fetch the whole library');return query(all.filter(c=>c.published&&filter.slug.$in.includes(c.slug)));},findOne:filter=>query(all.find(c=>c.slug===filter.slug&&c.published)||null)},
  Enrollment:{find:filter=>query(data.filter(x=>x.user===filter.user&&x.source===filter.source&&x.reason===filter.reason).map(x=>({...x}))),findOne:filter=>query(data.find(x=>x.user===filter.user&&x.courseSlug===filter.courseSlug)||null),findOneAndUpdate:async(filter,update)=>{const row=data.find(x=>x.user===filter.user&&x.courseSlug===filter.courseSlug);if(row)Object.assign(row,update.$set||{});return row||null;}},
  Subscription:{findOne:q=>query(eligible(q)?member:null)},
  Module:{find:()=>query([])},Lesson:{find:()=>query([])},
  CourseCompletion:{find:()=>query([])},Progress:{find:()=>query([])}
 };
 const env={Router:router,mediaUrl:()=>null,requireAuth:()=>{},requireRole:()=>()=>{},rateLimit:()=>()=>{},prepareStudentUpload:()=>{},uploadAdmission:()=>{},studentUploadSingle:()=>{},storeUpload:()=>{},
  ...models,Subscription:models.Subscription,realAccessFilter:()=>({testMode:{$ne:true}}),
  effectiveCourseEnrollments:async user=>grants.filter(g=>g.user===user),effectiveSectionAccesses:async()=>[],publicRegionalProduct,hasCourseAccess:async user=>member&&member.user===user&&eligible({user})?{type:'membership',membership:member}:null,
  completionProgress:()=>({percent:0}),publicCompletion:x=>x||null};
 const app=load('../src/routes/courseRoutes.js',env,'r');
 const me={user:{id:owner,_id:owner},params:{},body:{}};
 async function mine(){const res=fakeResponse();await app.routes.get('GET /enrolled/mine')(me,res);return res.body;}
 async function enroll(slug){const res=fakeResponse();await app.routes.get('POST /:slug/enroll')({...me,params:{slug}},res);return res;}
 return {mine,enroll,data,calls};
}

test('active LIVE membership exposes full-library access but leaves My Courses empty before enrollment',async()=>{
 const f=fixture({rows:[{user:uid,courseSlug:'existing',source:'membership',reason:oldAuto},{user:uid,courseSlug:'new',source:'membership',reason:oldAuto}]});
 const out=await f.mine();assert.equal(out.membershipActive,true);assert.deepEqual(out.courses,[]);
 assert.deepEqual(f.calls[0][1].slug.$in,[]);
});
test('a member explicitly enrolling in courses published both before and after purchase sees exactly those courses',async()=>{
 const f=fixture({rows:[{user:uid,courseSlug:'existing',source:'membership',reason:explicit},{user:uid,courseSlug:'new',source:'membership',reason:explicit},{user:uid,courseSlug:'another',source:'membership',reason:oldAuto}]});
 const out=await f.mine();assert.deepEqual(out.courses.map(c=>c.slug).sort(),['existing','new']);assert.equal(out.membershipActive,true);
});
test('an individual purchase does not open unrelated courses in My Courses',async()=>{
 const f=fixture({member:null,grants:[{user:uid,courseSlug:'existing',source:'provider',accessStartsAt:new Date('2026-01-01'),accessExpiresAt:new Date('2028-01-01')}]});
 const out=await f.mine();assert.deepEqual(out.courses.map(c=>c.slug),['existing']);assert.equal(out.membershipActive,false);
});
test('sandbox membership is not treated as active LIVE membership',async()=>{
 const f=fixture({member:{...membership,testMode:true},rows:[{user:uid,courseSlug:'existing',source:'membership',reason:explicit}]});
 const out=await f.mine();assert.equal(out.membershipActive,false);assert.deepEqual(out.courses,[]);
});
test('expired membership does not provide paid course access or reveal a membership-only course',async()=>{
 const f=fixture({member:{...membership,endsAt:new Date('2026-02-01')},rows:[{user:uid,courseSlug:'existing',source:'membership',reason:explicit}]});
 const out=await f.mine();assert.equal(out.membershipActive,false);assert.deepEqual(out.courses,[]);
});
test('one student never sees a different student’s clicked courses',async()=>{
 const f=fixture({rows:[{user:other,courseSlug:'existing',source:'membership',reason:explicit}]});
 const out=await f.mine();assert.deepEqual(out.courses,[]);
});
test('free enrollment and valid individual invoice grants remain in My Courses alongside explicit membership enrollments',async()=>{
 const f=fixture({rows:[{user:uid,courseSlug:'new',source:'membership',reason:explicit}],grants:[{user:uid,courseSlug:'free',source:'free'}]});
 const out=await f.mine();assert.deepEqual(out.courses.map(c=>c.slug).sort(),['free','new']);
});
test('clicked auto-synced membership row is marked explicit without granting or extending paid access',async()=>{
 const row={user:uid,courseSlug:'existing',source:'membership',reason:oldAuto,status:'active',accessExpiresAt:new Date('2028-01-01'),testMode:false};
 const f=fixture({rows:[row]});
 const res=await f.enroll('existing');assert.equal(res.statusCode,200);assert.equal(res.body.created,false);
 assert.equal(f.data[0].reason,explicit);assert.equal(+new Date(f.data[0].accessExpiresAt),+new Date(row.accessExpiresAt));assert.equal(f.data[0].testMode,false);
 const mine=await f.mine();assert.deepEqual(mine.courses.map(c=>c.slug),['existing']);
});
test('without an active LIVE membership, enrollment cannot turn a paid course into a free one',async()=>{
 const f=fixture({member:{...membership,testMode:true}});
 const res=await f.enroll('existing');assert.equal(res.statusCode,403);assert.equal(res.body.success,false);assert.deepEqual(f.data,[]);
});

test('direct access to newly published courses is based on valid membership term, never auto-generated course rows',async()=>{
 const course={exists:()=>query(null),findOne:()=>query(null)};
 const sub={findOne:q=>query(membership.user===q.user&&membership.testMode!==true?membership:null)};
 const {hasCourseAccess}=load('../src/services/learningAccess.js',{
  Course:course,Subscription:sub,effectiveCourseEnrollment:async()=>null,
  realAccessFilter:()=>({testMode:{$ne:true}})
 },'({hasCourseAccess})');
 for(const slug of ['existing','new','another'])assert.equal((await hasCourseAccess(uid,slug)).type,'membership');
 assert.equal(await hasCourseAccess(other,'existing'),null);
});
