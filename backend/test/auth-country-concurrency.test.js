import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {COUNTRIES,normalizeCountry} from '../src/utils/countries.js';
import {publicUser} from '../src/utils/security.js';
import User from '../src/models/User.js';
import AuthSession from '../src/models/AuthSession.js';
import Review from '../src/models/Review.js';
import {loginFor,register} from '../src/controllers/authController.js';
import {prepareReviewIndexes} from '../src/services/reviewIndexes.js';
import StudentNotification from '../src/models/StudentNotification.js';
import {deliverStudentNotifications} from '../src/services/studentNotifications.js';

function query(value){return {select(){return this;},then(resolve,reject){return Promise.resolve(value).then(resolve,reject);}};}
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}});
const uid='123456789012345678901234';

test('country choices are a unique complete ISO alpha-2 list with plain names',()=>{
 assert.equal(COUNTRIES.length,249);assert.equal(new Set(COUNTRIES.map(row=>row.code)).size,249);
 for(const row of COUNTRIES){assert.match(row.code,/^[A-Z]{2}$/);assert.ok(row.name.length);}
 assert.equal(normalizeCountry(' pk '),'PK');
 for(const value of ['XX','East','Pakistan',{},null,''])assert.equal(normalizeCountry(value),'');
});
test('public user includes only the normalized persisted country',()=>{
 assert.equal(publicUser({_id:uid,country:'pk'}).country,'PK');
 assert.equal(publicUser({_id:uid,country:'unknown'}).country,'');
});
test('User validates new country storage while permitting an unconfigured legacy country',()=>{
 const base={name:'Test Student',email:'student@academy.invalid',passwordHash:'hash'};
 assert.equal(new User({...base,country:'PK'}).validateSync(),undefined);
 assert.equal(new User(base).validateSync(),undefined);
 assert.ok(new User({...base,country:'unknown'}).validateSync()?.errors.country);
});
test('registration rejects absent, invalid and injected countries before any account write',async()=>{
 for(const country of [undefined,'XX',{$ne:null}]){
  const res=response();await register({body:{name:'Test Student',email:'student@academy.invalid',password:'valid-password',confirmPassword:'valid-password',country}},res);
  assert.equal(res.statusCode,400);assert.match(res.body.message,/country/);
 }
});
test('a concurrent password reset cannot upgrade an old-password login into the new token generation',async t=>{
 const oldHash=await bcrypt.hash('old-password-123',4),newHash=await bcrypt.hash('new-password-456',4);
 const persisted={_id:uid,name:'Student',email:'race@academy.invalid',role:'student',status:'active',passwordHash:oldHash,tokenVersion:0};
 let compared,continueComparison;
 const entered=new Promise(resolve=>compared=resolve),resume=new Promise(resolve=>continueComparison=resolve);
 const compare=bcrypt.compare.bind(bcrypt);
 t.mock.method(bcrypt,'compare',async(password,hash)=>{compared();await resume;return compare(password,hash);});
 t.mock.method(User,'findOne',()=>query({...persisted}));
 t.mock.method(User,'findOneAndUpdate',filter=>{
  assert.equal(filter.passwordHash,oldHash);assert.deepEqual(filter.$or,[{tokenVersion:0},{tokenVersion:{$exists:false}}]);
  return query(filter.passwordHash===persisted.passwordHash&&persisted.tokenVersion===0?{...persisted}:null);
 });
 const sessions=t.mock.method(AuthSession,'create',async()=>assert.fail('A reset-invalidated login must never create a session'));
 const pending=loginFor('student')({body:{email:persisted.email,password:'old-password-123'}},response());
 await entered;persisted.passwordHash=newHash;persisted.tokenVersion=1;continueComparison();
 await assert.rejects(pending,{status:401});assert.equal(sessions.mock.callCount(),0);
});
test('review schema enforces one review per student in every status',()=>{
 const index=Review.schema.indexes().find(([key,options])=>key.user===1&&options.name==='one_review_per_student');
 assert.ok(index);assert.equal(index[1].unique,true);assert.equal(index[1].partialFilterExpression,undefined);
});
test('review index preparation blocks duplicates and never deletes or edits them',async()=>{
 let writes=0;
 const collection={listIndexes:()=>({toArray:async()=>[]}),aggregate:()=>({toArray:async()=>[{_id:uid,count:2}]}),createIndex:async()=>writes++};
 const report=await prepareReviewIndexes(collection,{apply:true});
 assert.equal(report.status,'blocked');assert.equal(writes,0);assert.equal(report.duplicateUsers[0].count,2);
});
test('review uniqueness preparation is additive and idempotent',async()=>{
 let indexes=[{name:'one_pending_review_per_student',key:{user:1},unique:true,partialFilterExpression:{status:'pending'}}],writes=0;
 const collection={listIndexes:()=>({toArray:async()=>indexes}),aggregate:()=>({toArray:async()=>[]}),createIndex:async(key,options)=>{writes++;indexes.push({key,...options});}};
 assert.equal((await prepareReviewIndexes(collection)).status,'missing');assert.equal(writes,0);
 assert.equal((await prepareReviewIndexes(collection,{apply:true})).status,'passed');assert.equal(writes,1);
 assert.equal((await prepareReviewIndexes(collection,{apply:true})).created,false);assert.equal(writes,1);
 assert.ok(indexes.some(index=>index.name==='one_pending_review_per_student'));
});
test('later items in a slow batch receive fresh leases and cannot be stolen by another worker',async t=>{
 const start=new Date('2026-11-04T00:00:00Z'),rows=Array.from({length:18},(_,i)=>({_id:String(i),user:uid,type:'welcome',title:'Notice '+(i+1),message:'Welcome',dedupeKey:'welcome:'+i,emailState:'queued',nextAttemptAt:start,attempts:0}));
 let elapsed=0,checkedSecondWorker=false;const sends=[],clock=()=>new Date(+start+elapsed);
 t.mock.method(StudentNotification,'findOneAndUpdate',(filter,update)=>{
  const at=filter.$or[0].nextAttemptAt.$lte;
  const row=rows.find(item=>(['queued','deferred'].includes(item.emailState)&&item.nextAttemptAt<=at)||(item.emailState==='sending'&&item.leaseUntil<at));
  if(!row)return Promise.resolve(null);
  Object.assign(row,update.$set);row.attempts++;
  return Promise.resolve({...row});
 });
 t.mock.method(StudentNotification,'updateOne',async(filter,update)=>{
  const row=rows.find(item=>item._id===filter._id&&item.leaseToken===filter.leaseToken);if(!row)return {modifiedCount:0};
  Object.assign(row,update.$set);for(const key of Object.keys(update.$unset||{}))delete row[key];return {modifiedCount:1};
 });
 t.mock.method(User,'findById',()=>({select(){return this;},lean:async()=>({_id:uid,name:'Student',email:'student@academy.invalid',role:'student',status:'active'})}));
 const sendEmail=async mail=>{
  sends.push(mail.subject);
  if(mail.subject==='Notice 18'&&!checkedSecondWorker){
   checkedSecondWorker=true;
   assert.equal(elapsed,306000);
   assert.ok(rows[17].leaseUntil>clock());
   const other=await deliverStudentNotifications({clock,sendEmail,limit:1});assert.equal(other.claimed,0);
  }
  elapsed+=18000;return {accepted:['student@academy.invalid'],rejected:[]};
 };
 const result=await deliverStudentNotifications({clock,sendEmail,limit:20});
 assert.equal(result.sent,18);assert.equal(sends.length,18);assert.equal(new Set(sends).size,18);assert.equal(checkedSecondWorker,true);
});
