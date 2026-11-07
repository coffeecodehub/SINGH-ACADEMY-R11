/** Real Express/Mongo account removal; no payment, mail or scanner provider. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';

test('student removal preserves financial identity and blocks every authenticated path',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default,{createApp}=await import('../src/app.js');
 const M={};for(const name of ['User','AuthSession','AuditLog','Course','Invoice','Payment','CheckoutOrder'])M[name]=(await import('../src/models/'+name+'.js')).default;
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});let server;
 t.after(async()=>{try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='Synthetic-'+crypto.randomBytes(16).toString('hex'),passwordHash=await bcrypt.hash(password,12),users={};
 for(const [name,role]of [['client','client_admin'],['super','super_admin'],['victim','student'],['superVictim','student'],['pending','student'],['other','student']])users[name]=await M.User.create({name:'Removal '+name,email:name+'@removal.integration.invalid',country:'US',role,status:'active',passwordHash});
 await M.Course.create({slug:'removal-course',title:'Removal course',accessType:'free',published:true});
 const at=new Date(),ends=new Date(+at+30*86400000),invoice=await M.Invoice.create({number:'SYNTHETIC-REMOVAL',user:users.victim._id,kind:'course',courseSlug:'removal-course',title:'Preserved paid history',currency:'USD',totalMinor:1000,paidMinor:1000,status:'paid',paidAt:at,fulfillmentAt:at,dueAt:at,accessStartsAt:at,accessExpiresAt:ends,grantVersion:1,grantStartsAt:at,grantExpiresAt:ends,createdBy:users.client._id,requestKey:crypto.randomUUID(),requestFingerprint:'synthetic'});
 const payment=await M.Payment.create({user:users.victim._id,invoice:invoice._id,kind:'course',provider:'stripe',providerPaymentId:'pi_SYNTHETIC_removal',status:'paid',amountMinor:1000,currency:'USD',paidAt:at,verifiedAt:at,verificationSource:'provider_api'});
 server=await new Promise(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function request(path,{who,method='GET',body,cookie}={}){
  const response=await fetch(base+'/api'+path,{method,headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':users[who]?.role||'student',...(cookie||cookies[who]?{Cookie:cookie||cookies[who]}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>/^sa_(?:student|client_admin|super_admin)_v45=[a-f0-9]{64}$/.test(value)).join('; ')};
 }
 for(const who of Object.keys(users)){const portal=users[who].role,path=portal==='client_admin'?'/auth/admin/login':portal==='super_admin'?'/auth/super-admin/login':'/auth/login',login=await request(path,{who,method:'POST',body:{email:users[who].email,password}});assert.equal(login.status,200);cookies[who]=login.cookie;}
 const removalBody=who=>({confirmationEmail:users[who].email,reason:'Repeated abusive conduct in the synthetic fixture',currentPassword:password});
 await t.test('both administrators can list students; students and guests cannot remove any account',async()=>{
  for(const who of ['client','super']){const listed=await request('/academy-admin/students',{who});assert.equal(listed.status,200);assert.equal(listed.data.items.every(row=>!['client','super'].includes(row.email.split('@')[0])),true);}
  assert.equal((await request('/academy-admin/purchases',{who:'super'})).status,403);
  const path='/academy-admin/students/'+users.victim._id;
  assert.equal((await request(path,{method:'DELETE',body:removalBody('victim')})).status,401);
  assert.equal((await request(path,{who:'other',method:'DELETE',body:removalBody('victim')})).status,403);
  assert.equal((await M.User.findById(users.victim._id)).status,'active');
 });
 await t.test('password, target confirmation and student-only targeting are enforced before mutation',async()=>{
  const path='/academy-admin/students/'+users.victim._id,body=removalBody('victim');
  assert.equal((await request(path,{who:'client',method:'DELETE',body:{...body,currentPassword:'incorrect'}})).status,403);
  assert.equal((await request(path,{who:'client',method:'DELETE',body:{...body,confirmationEmail:users.other.email}})).status,400);
  assert.equal((await request(path,{who:'client',method:'DELETE',body:{...body,reason:''}})).status,400);
  for(const target of ['client','super'])assert.equal((await request('/academy-admin/students/'+users[target]._id,{who:'client',method:'DELETE',body:removalBody(target)})).status,404);
  assert.equal((await M.User.findById(users.victim._id)).status,'active');assert.equal(await M.AuditLog.countDocuments({action:'student.removal_requested'}),0);
 });
 await t.test('client-admin removal revokes all sessions and retains User, Invoice and Payment records',async()=>{
  const {hashToken}=await import('../src/utils/security.js');
  await M.AuthSession.create({user:users.victim._id,portal:'student',tokenHash:hashToken(crypto.randomBytes(32).toString('hex')),tokenVersion:0,lastSeenAt:at,expiresAt:ends});
  const result=await request('/academy-admin/students/'+users.victim._id,{who:'client',method:'DELETE',body:removalBody('victim')});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.removed,true);
  const stored=await M.User.findById(users.victim._id).select('+tokenVersion +deletedBy +removalRequestedBy');assert.equal(stored.removalState,'removed');assert.equal(stored.status,'blocked');assert.ok(stored.deletedAt);assert.equal(stored.tokenVersion,1);assert.equal(String(stored.deletedBy),String(users.client._id));assert.equal(stored.email,users.victim.email);
  assert.equal(await M.AuthSession.countDocuments({user:stored._id,revokedAt:null}),0);assert.ok(await M.Invoice.findById(invoice._id));assert.ok(await M.Payment.findById(payment._id));
  assert.equal((await request('/academy-admin/students',{who:'client'})).data.items.some(row=>row._id===String(stored._id)),false);
  assert.equal(await M.AuditLog.countDocuments({action:'student.removed',targetUser:stored._id}),1);
 });
 await t.test('old cookies, correct password, alternate portals and password reset cannot restore removed access',async()=>{
  for(const path of ['/courses','/payments/mine/agreements','/student-notifications'])assert.equal((await request(path,{who:'victim'})).status,401);
  assert.equal((await request('/auth/session',{who:'victim'})).data.user,null);
  for(const path of ['/auth/login','/auth/admin/login','/auth/super-admin/login'])assert.equal((await request(path,{who:'victim',method:'POST',body:{email:users.victim.email,password}})).status,401);
  const {accountAction}=await import('../src/services/businessWrite.js');
  await assert.rejects(()=>accountAction({user:users.client,body:{action:'unblock',reason:'Synthetic unblock attempt',currentPassword:password}},String(users.victim._id)),{status:409});
  const registered=await request('/auth/register',{method:'POST',body:{name:'Repeat account',email:users.victim.email,password,confirmPassword:password,country:'US'}});assert.equal(registered.status,409);
  await M.User.updateOne({_id:users.victim._id},{$set:{status:'active'}});
  assert.equal((await request('/auth/login',{who:'victim',method:'POST',body:{email:users.victim.email,password}})).status,401);
  const {hashToken,privateKey}=await import('../src/utils/security.js'),resetToken=crypto.randomBytes(32).toString('hex'),otp='123456';
  await M.User.updateOne({_id:users.victim._id},{$set:{resetPasswordToken:hashToken(resetToken),resetPasswordExpires:ends,resetOtpHash:privateKey(`${users.victim._id}:${otp}`),resetOtpExpires:ends,resetOtpAttempts:0}});
  assert.equal((await request('/auth/reset-password',{who:'victim',method:'POST',body:{token:resetToken,password:'DifferentSyntheticPassword!'}})).status,400);
  assert.equal((await request('/auth/verify-reset-otp',{who:'victim',method:'POST',body:{email:users.victim.email,otp}})).status,400);
  await M.User.updateOne({_id:users.victim._id},{$set:{status:'blocked'}});
 });
 await t.test('removal is idempotent and Super Admin can remove a separate student',async()=>{
  assert.equal((await request('/academy-admin/students/'+users.victim._id,{who:'client',method:'DELETE',body:removalBody('victim')})).status,200);
  assert.equal(await M.AuditLog.countDocuments({action:'student.removed',targetUser:users.victim._id}),1);
  const result=await request('/academy-admin/students/'+users.superVictim._id,{who:'super',method:'DELETE',body:removalBody('superVictim')});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.removed,true);
  assert.equal(String((await M.User.findById(users.superVictim._id).select('+deletedBy')).deletedBy),String(users.super._id));
 });
 await t.test('an uncertain provider creation leaves an immediately blocked, retryable pending account',async()=>{
  const order=await M.CheckoutOrder.create({user:users.pending._id,provider:'stripe',environment:'test',kind:'course',product:'removal-course',title:'Uncertain synthetic checkout',amountMinor:1000,currency:'USD',status:'creating',creationProtocolVersion:1,creationAttemptedAt:new Date(),creationClaimUntil:new Date(Date.now()+90000),expiresAt:ends,requestKey:crypto.randomUUID(),requestFingerprint:'synthetic-uncertain'});
  const path='/academy-admin/students/'+users.pending._id,result=await request(path,{who:'client',method:'DELETE',body:removalBody('pending')});assert.equal(result.status,202,JSON.stringify(result.data));assert.equal(result.data.removed,false);assert.equal(result.data.accessBlocked,true);
  const stored=await M.User.findById(users.pending._id).select('+tokenVersion');assert.equal(stored.status,'blocked');assert.equal(stored.removalState,'pending');assert.equal(stored.deletedAt,null);assert.equal(stored.tokenVersion,1);
  assert.equal((await M.CheckoutOrder.findById(order._id)).providerOrderId,undefined);assert.equal((await request('/courses',{who:'pending'})).status,401);assert.equal((await request('/auth/login',{who:'pending',method:'POST',body:{email:users.pending.email,password}})).status,401);
  assert.equal((await request(path,{who:'client',method:'DELETE',body:removalBody('pending')})).status,202);assert.equal(await M.AuditLog.countDocuments({action:'student.removal_requested',targetUser:stored._id}),1);assert.equal(await M.AuditLog.countDocuments({action:'student.removed',targetUser:stored._id}),0);
  assert.equal((await request('/academy-admin/students',{who:'super'})).data.items.find(row=>row._id===String(stored._id)).removalState,'pending');
 });
 assert.equal((await request('/auth/session',{who:'other'})).data.user.id,String(users.other._id));
});
