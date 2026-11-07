/** Actual HTTP + MongoDB checks; all writes stay inside a randomly named test database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {isolatedDatabase,testEnvironment} from './isolation.js';

test('country registration, admin-only updates, and concurrent published review uniqueness',async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:10000});
 let server;
 t.after(async()=>{server?.closeAllConnections?.();if(server)await new Promise(resolve=>server.close(resolve));try{await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 const {createApp}=await import('../src/app.js');
 const User=(await import('../src/models/User.js')).default,Review=(await import('../src/models/Review.js')).default;
 const {prepareReviewIndexes}=await import('../src/services/reviewIndexes.js');
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 server=await new Promise(resolve=>{const instance=createApp().listen(0,'127.0.0.1',()=>resolve(instance));});
 const base='http://127.0.0.1:'+server.address().port;
 const password='Country-'+crypto.randomBytes(18).toString('hex'),passwordHash=await bcrypt.hash(password,10);
 const admins={};
 for(const role of ['client_admin','super_admin'])admins[role]=await User.create({name:role,email:role+'@country.invalid',country:'GB',role,status:'active',passwordHash});
 async function request(path,{method='GET',body,portal='student',cookie=''}={}){
  const response=await fetch(base+'/api'+path,{method,headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':portal,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>/^sa_(student|client_admin|super_admin)_v45=[a-f0-9]{64}$/.test(value)).join('; ')};
 }
 let student,studentCookie;
 await t.test('country list is public and registration rejects missing/invalid codes',async()=>{
  const list=await request('/auth/countries');assert.equal(list.status,200);assert.equal(list.data.countries.length,249);
  for(const country of [undefined,'XX']){
   const result=await request('/auth/register',{method:'POST',body:{name:'Country Student',email:'student@country.invalid',password,confirmPassword:password,country}});
   assert.equal(result.status,400);assert.equal(await User.countDocuments({email:'student@country.invalid'}),0);
  }
 });
 await t.test('registration persists country and login ignores a browser country override',async()=>{
  const created=await request('/auth/register',{method:'POST',body:{name:'Country Student',email:'student@country.invalid',password,confirmPassword:password,country:'pk'}});
  assert.equal(created.status,201);assert.equal(created.data.user.country,'PK');studentCookie=created.cookie;student=await User.findOne({email:'student@country.invalid'});assert.equal(student.country,'PK');
  const login=await request('/auth/login',{method:'POST',body:{email:student.email,password,country:'US'}});assert.equal(login.status,200);assert.equal(login.data.user.country,'PK');studentCookie=login.cookie;
 });
 const staffCookies={};
 await t.test('country changes require an operational admin and current password',async()=>{
  for(const role of Object.keys(admins)){
   const path=role==='client_admin'?'/auth/admin/login':'/auth/super-admin/login';
   const login=await request(path,{method:'POST',portal:role,body:{email:admins[role].email,password}});assert.equal(login.status,200);staffCookies[role]=login.cookie;
  }
  const path='/academy-admin/students/'+student._id+'/country';
  assert.equal((await request(path,{method:'PATCH',cookie:studentCookie,body:{country:'US',currentPassword:password}})).status,403);
  assert.equal((await request(path,{method:'PATCH',portal:'super_admin',cookie:staffCookies.super_admin,body:{country:'PK',currentPassword:password}})).status,200);
  assert.equal((await request(path,{method:'PATCH',portal:'client_admin',cookie:staffCookies.client_admin,body:{country:'US',currentPassword:'incorrect'}})).status,403);
  assert.equal((await request(path,{method:'PATCH',portal:'client_admin',cookie:staffCookies.client_admin,body:{country:'XX',currentPassword:password}})).status,400);
  assert.equal((await User.findById(student._id)).country,'PK');
  const changed=await request(path,{method:'PATCH',portal:'client_admin',cookie:staffCookies.client_admin,body:{country:'us',currentPassword:password}});assert.equal(changed.status,200);
  assert.equal((await User.findById(student._id)).country,'US');
  const session=await request('/auth/session',{cookie:studentCookie});assert.equal(session.data.user.country,'US');
  assert.equal(await mongoose.models.AuditLog.countDocuments({action:'student.country_updated',targetUser:student._id}),2);
 });
 await t.test('concurrent first reviews produce one pending persisted review',async()=>{
  const results=await Promise.all(['First submitted review text','Second submitted review text'].map(message=>request('/reviews',{method:'POST',cookie:studentCookie,body:{rating:5,message}})));
  assert.deepEqual(results.map(result=>result.status),[201,201]);
  assert.equal(await Review.countDocuments({user:student._id}),1);assert.equal((await Review.findOne({user:student._id})).status,'pending');
 });
 await t.test('legacy index preparation blocks duplicates and adds uniqueness without dropping history',async()=>{
  const legacy=mongoose.connection.db.collection('legacy_reviews_fixture');
  await legacy.createIndex({user:1},{name:'one_pending_review_per_student',unique:true,partialFilterExpression:{status:'pending'}});
  await legacy.insertMany([{user:student._id,status:'approved'},{user:student._id,status:'approved'}]);
  assert.equal((await prepareReviewIndexes(legacy,{apply:true})).status,'blocked');assert.equal(await legacy.countDocuments(),2);
  const clean=mongoose.connection.db.collection('clean_reviews_fixture');
  await clean.createIndex({user:1},{name:'one_pending_review_per_student',unique:true,partialFilterExpression:{status:'pending'}});
  await clean.insertOne({user:student._id,status:'approved'});
  assert.equal((await prepareReviewIndexes(clean,{apply:true})).status,'passed');
  const indexes=await clean.listIndexes().toArray();assert.ok(indexes.some(index=>index.name==='one_pending_review_per_student'));assert.ok(indexes.some(index=>index.name==='one_review_per_student'));
  await assert.rejects(()=>clean.insertOne({user:student._id,status:'approved'}),{code:11000});
 });
});
