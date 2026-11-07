/** REAL HTTP + MongoDB replica-set tests. Never substitutes stubs and never silently skips. */
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';
test('V48 real HTTP authentication and Academy/CMS role boundaries',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default;
 const {createApp}=await import('../src/app.js');
 const User=(await import('../src/models/User.js')).default,Course=(await import('../src/models/Course.js')).default;
 const Invoice=(await import('../src/models/Invoice.js')).default,Payment=(await import('../src/models/Payment.js')).default,Enrollment=(await import('../src/models/Enrollment.js')).default;
 const PurchaseRequest=(await import('../src/models/PurchaseRequest.js')).default,Refund=(await import('../src/models/Refund.js')).default;
 const {transaction}=await import('../src/services/businessWrite.js');
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});
 let server;
 t.after(async()=>{try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 const hello=await mongoose.connection.db.admin().command({hello:1});assert.ok(hello.setName||hello.msg==='isdbgrid','Replica set/sharded MongoDB required; do not use standalone');
 for(const M of Object.values(mongoose.models))await M.createIndexes();
 const password='Test-'+crypto.randomBytes(20).toString('hex'),passwordHash=await bcrypt.hash(password,12);
 const fixtures={};for(const [key,role]of [['client','client_admin'],['builder','super_admin'],['student','student'],['other','student']])fixtures[key]=await User.create({name:key+' Test Fixture',email:key+'@integration.invalid',role,status:'active',emailVerified:true,passwordHash});
 await Course.create({title:'Integration fixture course',slug:'integration-fixture',published:true,price:100,currency:'USD',accessType:'one_time'});
 server=await new Promise(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});const url='http://127.0.0.1:'+server.address().port;
 async function request(route,{method='GET',body,cookie,portal='student',key,headers={}}={}){
  const response=await fetch(url+'/api'+route,{method,headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':portal,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(key?{'Idempotency-Key':key}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data={raw};}
  return {status:response.status,data,headers:response.headers,cookie:response.headers.getSetCookie().map(x=>x.split(';')[0]).filter(pair=>/^sa_(?:student|client_admin|super_admin)_v45=[a-f0-9]{64}$/.test(pair)).join('; ')};
 }
 const login=(who,portal)=>request(portal==='student'?'/auth/login':portal==='client_admin'?'/auth/admin/login':'/auth/super-admin/login',{method:'POST',portal,body:{email:fixtures[who].email,password}});
 let studentCookie,otherCookie,adminCookie,builderCookie,requestId,invoiceId,secondPayment;
 await t.test('anonymous and malicious-origin requests are rejected',async()=>{assert.equal((await request('/academy-admin/overview')).status,401);assert.equal((await request('/auth/admin/login',{method:'POST',body:{},headers:{Origin:'https://attacker.invalid'}})).status,403);});
 await t.test('guest content APIs require login while session discovery stays public',async()=>{for(const route of ['/content/team','/courses','/reviews']){const res=await request(route);assert.equal(res.status,401);assert.equal(res.data.code,'SESSION_REQUIRED');}assert.equal((await request('/auth/session')).data.user,null);});
 await t.test('student login rejects both admin roles',async()=>{assert.equal((await login('client','student')).status,401);assert.equal((await login('builder','student')).status,401);});
 await t.test('valid students get independent HttpOnly sessions',async()=>{const a=await login('student','student'),b=await login('other','student');assert.equal(a.status,200);assert.equal(b.status,200);assert.match(a.headers.get('set-cookie'),/HttpOnly/i);assert.match(a.headers.get('set-cookie'),/SameSite=Lax/i);studentCookie=a.cookie;otherCookie=b.cookie;assert.equal((await request('/academy-admin/overview',{cookie:studentCookie})).status,403);});
 async function setupAdmin(who,portal){
  const first=await login(who,portal);
  assert.equal(first.status,200,JSON.stringify(first.data));
  assert.equal(first.data.setupRequired,false);
  assert.equal(first.data.user.role,portal);
  assert.match(first.cookie,new RegExp('^sa_'+portal+'_v45=[a-f0-9]{64}$'));
  assert.match(first.headers.get('set-cookie'),/HttpOnly/i);
  assert.equal((await request('/admin/content/courses',{cookie:first.cookie,portal})).status,200);
  const AuthSession=(await import('../src/models/AuthSession.js')).default;
  const active=await AuthSession.findOne({user:fixtures[who]._id,portal,revokedAt:null});
  assert.ok(active);assert.equal(active.setupOnly,false);
  // Retired routes never expose a secret, enable a factor or revoke this normal session.
  for(const action of ['setup','enable','disable']){
   const result=await request('/auth/security/mfa/'+action,{method:'POST',cookie:first.cookie,portal,
    body:{currentPassword:password,code:'123456'}});
   assert.equal(result.status,410);assert.equal(result.data.code,'FEATURE_RETIRED');
   assert.equal(result.data.secret,undefined);assert.equal(result.data.recoveryCodes,undefined);
  }
  assert.equal((await request('/admin/content/courses',{cookie:first.cookie,portal})).status,200);
  const user=await User.findById(fixtures[who]._id).select('+mfaSecret +mfaPendingSecret');
  assert.equal(user.mfaEnabled,false);assert.equal(user.mfaSecret,null);assert.equal(user.mfaPendingSecret,null);
  return first.cookie;
 }
 await t.test('administrators receive normal isolated sessions; MFA routes stay retired',async()=>{
  adminCookie=await setupAdmin('client','client_admin');builderCookie=await setupAdmin('builder','super_admin');
  assert.notEqual(adminCookie,builderCookie);
  assert.equal((await request('/admin/content/courses',{cookie:adminCookie,portal:'super_admin'})).status,401);
  assert.equal((await request('/admin/content/courses',{cookie:builderCookie,portal:'client_admin'})).status,401);
 });
 await t.test('builder can manage content, never the client ledger',async()=>{assert.equal((await request('/admin/content/courses',{cookie:builderCookie,portal:'super_admin'})).status,200);assert.equal((await request('/academy-admin/overview',{cookie:builderCookie,portal:'super_admin'})).status,403);assert.equal((await request('/academy-admin/overview',{cookie:builderCookie,portal:'client_admin'})).status,401);assert.equal((await request('/admin/site/footerSocial',{method:'PUT',body:{value:{}},cookie:adminCookie,portal:'client_admin'})).status,403);});

 await t.test('removed Business Admin APIs do not expose ledger pages',async()=>{for(const[portal,cookie]of [['client_admin',adminCookie],['super_admin',builderCookie],['student',studentCookie]])assert.equal((await request('/business/overview',{portal,cookie})).status,404);});
 await t.test('V50 client can edit plan definitions but not reviews, website copy or social links',async()=>{
  assert.equal((await request('/admin/content/reviews',{portal:'client_admin',cookie:adminCookie})).status,403);
  const site=await request('/admin/site',{portal:'client_admin',cookie:adminCookie});assert.equal(site.status,200);assert.ok(site.data.items.every(x=>x.key==='membershipPlans'));
  assert.equal((await request('/admin/site/membershipPlans',{portal:'client_admin',cookie:adminCookie,method:'PUT',body:{value:[{name:'Fixture Plan',price:99,durationMonths:1,active:true}]}})).status,200);
  for(const key of ['footerSocial','websiteContent'])assert.equal((await request('/admin/site/'+key,{portal:'client_admin',cookie:adminCookie,method:'PUT',body:{value:[]}})).status,403);
 });
 await t.test('client can create and edit team and events without financial permissions',async()=>{
  for(const[kind,body]of [['team',{name:'Fixture Teacher',active:true}],['events',{title:'Fixture Event',status:'draft'}]]){const a=await request('/admin/content/'+kind,{portal:'client_admin',cookie:adminCookie,method:'POST',body});assert.equal(a.status,201,JSON.stringify(a.data));assert.equal((await request('/admin/content/'+kind+'/'+a.data.item._id,{portal:'client_admin',cookie:adminCookie,method:'PATCH',body:kind==='team'?{role:'Updated designation'}:{status:'published'}})).status,200);}
 });
 await t.test('team member multiple categories persist, filter independently and remain one All record',async()=>{
  const create=await request('/admin/content/team',{portal:'client_admin',cookie:adminCookie,method:'POST',
   body:{name:'Multi Category Fixture',categories:['core','founder','faculty','board'],active:true}});
  assert.equal(create.status,201,JSON.stringify(create.data));const id=create.data.item._id;
  assert.equal(create.data.item.category,'founder');
  assert.deepEqual(create.data.item.categories,['founder','faculty','board','core']);
  for(const category of ['founder','faculty','board','core']){
   const list=await request('/content/team?category='+category,{cookie:studentCookie});
   assert.equal(list.status,200);assert.equal(list.data.team.filter(m=>m._id===id).length,1);
  }
  let all=await request('/content/team',{cookie:studentCookie});
  assert.equal(all.data.team.filter(m=>m._id===id).length,1);assert.equal(all.data.team[0]._id,id);
  const update=await request('/admin/content/team/'+id,{portal:'client_admin',cookie:adminCookie,method:'PATCH',
   body:{categories:['board','faculty']}});
  assert.equal(update.status,200);
  const founders=await request('/content/team?category=founder',{cookie:studentCookie});
  assert.equal(founders.data.team.some(m=>m._id===id),false);
  const before=JSON.stringify(update.data.item.categories);
  for(const categories of [[],['owner'],['faculty','faculty'],{role:'founder'}]){
   const invalid=await request('/admin/content/team/'+id,{portal:'client_admin',cookie:adminCookie,method:'PATCH',body:{categories}});
   assert.equal(invalid.status,400);
  }
  const saved=await request('/admin/content/team',{portal:'client_admin',cookie:adminCookie});
  assert.equal(JSON.stringify(saved.data.items.find(m=>m._id===id).categories),before);
  assert.equal((await request('/admin/content/team/'+id,{cookie:studentCookie,method:'PATCH',body:{categories:['founder']}})).status,403);
 });
 await t.test('builder can update plans, social links and plain website copy with optimistic version check',async()=>{
  assert.equal((await request('/admin/site/membershipPlans',{portal:'super_admin',cookie:builderCookie,method:'PUT',body:{value:[{name:'Fixture Monthly',price:50,durationMonths:1}]}})).status,200);
  const body={revision:0,value:{text:{'landing-001':'Fixture website copy'},images:[]}};
  assert.equal((await request('/admin/site/websiteContent',{portal:'super_admin',cookie:builderCookie,method:'PUT',body})).status,200);
  assert.equal((await request('/admin/site/websiteContent',{portal:'super_admin',cookie:builderCookie,method:'PUT',body})).status,409);
  assert.equal((await request('/content/site',{cookie:studentCookie})).data.content.websiteContent.text['landing-001'],'Fixture website copy');
 });
 await t.test('manual enrollment request no longer creates work or records',async()=>{assert.equal((await request('/payments/requests',{cookie:studentCookie,method:'POST',body:{kind:'course',product:'integration-fixture'}})).status,410);assert.equal(await PurchaseRequest.countDocuments(),0);assert.equal(await Invoice.countDocuments(),0);});
 await t.test('student never gains either CMS or certificate review permission',async()=>{for(const route of ['/admin/content/courses','/certificates/admin','/academy-admin/notifications'])assert.equal((await request(route,{cookie:studentCookie})).status,403);});
 await t.test('builder cannot review student answers or view course-completion notifications',async()=>{for(const route of ['/certificates/admin','/academy-admin/notifications'])assert.equal((await request(route,{cookie:builderCookie,portal:'super_admin'})).status,403);});
 await t.test('forced real transaction exception rolls back a write',async()=>{await assert.rejects(()=>transaction(async session=>{await User.updateOne({_id:fixtures.other._id},{$set:{name:'SHOULD ROLL BACK'}},{session});throw new Error('Intentional rollback fixture');}),/Intentional rollback/);assert.equal((await User.findById(fixtures.other._id)).name,'other Test Fixture');});
 await t.test('V50 student subscription notices remain private and are deduplicated',async()=>{
  const Subscription=(await import('../src/models/Subscription.js')).default,StudentNotification=(await import('../src/models/StudentNotification.js')).default;
  const {enqueueExpiryReminders,queueSubscriptionConfirmation}=await import('../src/services/studentNotifications.js');
  const now=new Date(),sub=await Subscription.create({user:fixtures.student._id,plan:'Fixture Plan',status:'active',startsAt:new Date(+now-86400000*20),endsAt:new Date(+now+86400000*6),durationMonths:1,testMode:false});
  await transaction(session=>queueSubscriptionConfirmation(sub,session));await transaction(session=>queueSubscriptionConfirmation(sub,session));
  await enqueueExpiryReminders(now);await enqueueExpiryReminders(now);assert.equal(await StudentNotification.countDocuments({user:fixtures.student._id}),2);
  const own=await request('/student-notifications',{cookie:studentCookie}),other=await request('/student-notifications',{cookie:otherCookie});assert.equal(own.data.items.length,2);assert.equal(other.data.items.length,0);assert.equal(own.data.items[0].emailState,undefined);
  assert.equal((await request('/student-notifications/'+own.data.items[0]._id+'/read',{method:'PATCH',cookie:otherCookie})).status,404);
  const admin=await request('/academy-admin/subscriptions',{portal:'client_admin',cookie:adminCookie});assert.equal(admin.status,200);assert.ok(admin.data.items.some(x=>String(x.user._id)===String(fixtures.student._id)));assert.equal(admin.data.items[0].subscriptionDate,null);
  for(const[portal,cookie]of [['student',studentCookie],['super_admin',builderCookie]])assert.equal((await request('/academy-admin/subscriptions',{portal,cookie})).status,403);
 });
 await t.test('V50 receipt screenshot uses real upload/ownership checks without changing payment value',async()=>{
  const sharp=(await import('sharp')).default,Attachment=(await import('../src/models/PaymentAttachment.js')).default;
  const payment=await Payment.create({user:fixtures.student._id,amountMinor:9900,amount:99,currency:'USD',status:'paid',paidAt:new Date(),provider:'stripe',providerPaymentId:'test-fixture-only',testMode:true});
  const png=await sharp({create:{width:40,height:40,channels:3,background:{r:245,g:245,b:245}}}).png().toBuffer();
  async function upload(cookie){const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'test-receipt.png');return fetch(url+'/api/payments/mine/payments/'+payment._id+'/attachments',{method:'POST',headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':'student',Cookie:cookie},body:form});}
  assert.equal((await upload(otherCookie)).status,404);
  const uploaded=await upload(studentCookie),data=await uploaded.json();assert.equal(uploaded.status,201,JSON.stringify(data));assert.equal(await Attachment.countDocuments({payment:payment._id,user:fixtures.student._id}),1);
  assert.equal((await request('/media/'+data.fileId,{cookie:otherCookie})).status,403);
  assert.equal((await request('/media/'+data.fileId+'?portal=super_admin',{portal:'super_admin',cookie:builderCookie})).status,403);
  assert.equal((await request('/media/'+data.fileId,{cookie:studentCookie})).status,200);
  const unchanged=await Payment.findById(payment._id);assert.equal(unchanged.amountMinor,9900);assert.equal(unchanged.status,'paid');
  const attachment=await Attachment.findOne({payment:payment._id});assert.equal((await request('/payments/mine/payments/'+payment._id+'/attachments/'+attachment._id,{method:'DELETE',cookie:studentCookie})).status,200);assert.equal(await Attachment.countDocuments({payment:payment._id}),0);assert.ok(await Payment.exists({_id:payment._id}));
 });

});
