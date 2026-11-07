/** Real MongoDB transaction regressions; payment evidence is explicitly
 * SYNTHETIC and injected only into the internal settlement service. No provider
 * charges, refunds, live database, DNS tunnel, or SMTP calls are performed. */
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';
import {syntheticSettlement} from './fixtures/settlement.js';
test('V60.15 invoice-source access, refunds, index inventory and trusted proxy HTTP',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();process.env.ONLINE_PAYMENTS_ENABLED='false';
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default;
 const {createApp}=await import('../src/app.js');const {fulfillOnlineOrder}=await import('../src/services/onlineCheckout.js');const {recordGatewayRefund}=await import('../src/services/gatewayRefunds.js');
 const {effectiveCourseEnrollment}=await import('../src/services/courseEntitlements.js');const {hasCourseAccess}=await import('../src/services/learningAccess.js');
 const {databaseIndexReport}=await import('../src/services/databaseIndexes.js');const {signProxyIdentity}=await import('../src/utils/proxyIdentity.js');
 const M={};for(const name of ['User','Course','Invoice','Payment','Refund','CheckoutOrder','Enrollment','Subscription','AuthSession'])M[name]=(await import('../src/models/'+name+'.js')).default;
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});let server;
 t.after(async()=>{try{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 assert.ok((await mongoose.connection.db.admin().command({hello:1})).setName,'Real test replica set required');
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='Fixture-security-'+crypto.randomBytes(12).toString('hex'),passwordHash=await bcrypt.hash(password,12);
 let serial=0;const newUser=()=>M.User.create({name:'Security fixture',email:`security-${++serial}@integration.invalid`,passwordHash,role:'student',status:'active'});
 const course=await M.Course.create({slug:'security-access-history',title:'Synthetic access history course',published:true,price:100,currency:'USD',accessType:'one_time',accessMonths:1});
 async function orderFor(user,{kind='course',environment='live',paidAt=new Date(),months=1}={}){
  const unique=crypto.randomUUID(),order=await M.CheckoutOrder.create({user:user._id,provider:'stripe',environment,providerOrderId:'cs_SYNTHETIC_'+unique,status:'pending',kind,product:kind==='course'?course.slug:'Synthetic membership',title:'No real payment',amountMinor:10000,currency:'USD',durationMonths:months,expiresAt:new Date(Date.now()+3600000),requestKey:'synthetic-'+unique,requestFingerprint:'synthetic-'+unique});
  const {evidence,verificationSource}=syntheticSettlement(order,{paymentId:'pi_SYNTHETIC_'+unique,paidAt});
  return{order,evidence,async settle(){
   await fulfillOnlineOrder(order._id,evidence,verificationSource);
   const saved=await M.CheckoutOrder.findById(order._id),payment=await M.Payment.findById(saved.payment);
   assert.equal(saved.status,'paid');assert.ok(payment,'Settlement must persist a real schema-validated Payment');
   assert.equal(payment.verificationSource,verificationSource);assert.equal(payment.testMode,environment==='test');
   assert.equal(String(payment.user),String(user._id));assert.equal(payment.providerPaymentId,evidence.paymentId);
   return M.Invoice.findById(saved.invoice);
  },async refund(amountMinor=10000){return recordGatewayRefund({provider:'stripe',environment,id:'re_SYNTHETIC_'+unique,paymentId:evidence.paymentId,amountMinor,currency:'USD',refundedAt:new Date()});}};
 }
 await t.test('critical and noncritical model indexes are semantically present, inventory is read-only',async()=>{
  const counts=await M.Invoice.countDocuments(),report=await databaseIndexReport();assert.equal(report.status,'passed',JSON.stringify(report.entries.filter(x=>x.status!=='present')));assert.equal(report.readOnly,true);assert.equal(await M.Invoice.countDocuments(),counts);
 });
 await t.test('invalid verification source rolls back settlement; the production enum remains enforced',async()=>{
  const user=await newUser(),a=await orderFor(user),before=await M.User.findById(user._id).select('+commerceVersion').lean();
  await assert.rejects(()=>fulfillOnlineOrder(a.order._id,a.evidence,'integration_fixture'),error=>{
   assert.equal(error.name,'ValidationError');
   assert.equal(error.errors?.verificationSource?.kind,'enum');
   assert.equal(error.errors.verificationSource.value,'integration_fixture');return true;
  });
  assert.equal(await M.Payment.countDocuments({user:user._id}),0);
  assert.equal(await M.Invoice.countDocuments({user:user._id}),0);
  assert.equal(await M.Enrollment.countDocuments({user:user._id}),0);
  assert.equal(await M.Subscription.countDocuments({user:user._id}),0);
  assert.equal((await M.CheckoutOrder.findById(a.order._id)).status,'pending');
  assert.equal((await M.User.findById(user._id).select('+commerceVersion')).commerceVersion,before.commerceVersion);
 });
 await t.test('test membership never changes live invoice or enrollment expiry',async()=>{
  const user=await newUser(),a=await orderFor(user);const invoice=await a.settle(),before=await M.Enrollment.findOne({user:user._id,courseSlug:course.slug}).lean();
  const membership=await orderFor(user,{kind:'membership',environment:'test',months:12});await membership.settle();
  const after=await M.Enrollment.findOne({user:user._id,courseSlug:course.slug}).lean();assert.equal(+after.accessExpiresAt,+before.accessExpiresAt);assert.equal(after.testMode,false);assert.equal(String(after.invoice),String(invoice._id));
  assert.equal(await effectiveCourseEnrollment(user._id,course.slug,null,{environment:'live',now:new Date(+invoice.grantExpiresAt+1)}),null);
 });
 await t.test('full membership refund removes membership without extending an expired original course',async()=>{
  const user=await newUser(),a=await orderFor(user,{paidAt:new Date(Date.now()-45*86400000)});const invoice=await a.settle();assert.equal(await hasCourseAccess(user._id,course.slug),null);
  const membership=await orderFor(user,{kind:'membership',months:12});const b=await membership.settle();assert.equal((await hasCourseAccess(user._id,course.slug)).type,'membership');
  await membership.refund();assert.equal((await M.Subscription.findOne({invoice:b._id})).status,'cancelled');assert.equal(await hasCourseAccess(user._id,course.slug),null);
  assert.equal(+(await M.Enrollment.findOne({user:user._id})).accessExpiresAt,+invoice.grantExpiresAt);assert.equal((await membership.refund()).replayed,true);
 });
 await t.test('refunding an older individual invoice preserves its independent paid renewal only',async()=>{
  const user=await newUser(),a=await orderFor(user);const first=await a.settle(),b=await orderFor(user);const second=await b.settle();
  assert.equal(+second.grantStartsAt,+first.grantExpiresAt);await a.refund();
  assert.equal(await effectiveCourseEnrollment(user._id,course.slug,null,{environment:'live',now:new Date(+first.grantStartsAt+1000)}),null);
  const renewal=await effectiveCourseEnrollment(user._id,course.slug,null,{environment:'live',now:new Date(+second.grantStartsAt+1000)});assert.ok(renewal);assert.equal(+renewal.accessExpiresAt,+second.grantExpiresAt);
 });
 await t.test('refunding the newest invoice does not revoke the original independently paid course period',async()=>{
  const user=await newUser(),a=await orderFor(user);const first=await a.settle(),b=await orderFor(user);await b.settle();await b.refund();
  const remaining=await effectiveCourseEnrollment(user._id,course.slug,null,{environment:'live'});assert.ok(remaining);assert.equal(+remaining.accessExpiresAt,+first.grantExpiresAt);
 });
 await t.test('partial provider refund preserves the purchased course interval',async()=>{
  const user=await newUser(),a=await orderFor(user);const first=await a.settle();await a.refund(1000);const remaining=await effectiveCourseEnrollment(user._id,course.slug);assert.equal(+remaining.accessExpiresAt,+first.grantExpiresAt);
 });
 await t.test('concurrent duplicate settlement records only one interval, payment and invoice',async()=>{
  const user=await newUser(),a=await orderFor(user);await Promise.all([a.settle(),a.settle()]);assert.equal(await M.Payment.countDocuments({checkoutOrder:a.order._id}),1);assert.equal(await M.Invoice.countDocuments({user:user._id}),1);assert.ok(await effectiveCourseEnrollment(user._id,course.slug));
 });
 await t.test('legacy merged membership enrollment does not override authoritative old course invoice dates',async()=>{
  const user=await newUser(),a=await orderFor(user,{paidAt:new Date(Date.now()-45*86400000)});const first=await a.settle();
  await M.Invoice.updateOne({_id:first._id},{$set:{grantVersion:0},$unset:{grantStartsAt:1,grantExpiresAt:1}});
  await M.Enrollment.updateOne({user:user._id},{$set:{accessExpiresAt:new Date(Date.now()+365*86400000)}});
  assert.equal(await effectiveCourseEnrollment(user._id,course.slug,null,{environment:'live'}),null);
 });
 await t.test('foreign student cannot inherit another student paid grants',async()=>{const a=await newUser(),b=await newUser();await(await orderFor(a)).settle();assert.equal(await effectiveCourseEnrollment(b._id,course.slug),null);});
 // Real HTTP boundary: signed client attribution is not a replacement for login.
 const key=crypto.randomBytes(48).toString('hex');process.env.SA_PROXY_SHARED_SECRET=key;process.env.SA_REQUIRE_PROXY_IDENTITY='true';
 server=await new Promise(r=>{const s=createApp().listen(0,'127.0.0.1',()=>r(s));});const base='http://127.0.0.1:'+server.address().port;
 function proof(path,ip='198.51.100.12',cookie='',method='POST'){
  return signProxyIdentity(ip,{method,path,origin:'http://localhost:3000',portal:'student',cookie},key);
 }
 async function req(path,body,signature){const headers={'Content-Type':'application/json',Origin:'http://localhost:3000','X-SA-Portal':'student','X-SA-CSRF':'1',...(signature?{'X-SA-Network':signature.payload,'X-SA-Network-Signature':signature.signature}:{})};return fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});}
 await t.test('unsigned write cannot bypass required trusted proxy attribution',async()=>{assert.equal((await req('/api/auth/login',{email:'missing@integration.invalid',password})).status,503);});
 await t.test('tampered proof is rejected before login',async()=>{const signed=proof('/api/auth/login');signed.signature='0'.repeat(64);assert.equal((await req('/api/auth/login',{email:'missing@integration.invalid',password},signed)).status,403);});
 await t.test('signed proof still requires a real password and gets owner-scoped HttpOnly session',async()=>{
  const user=await newUser(),path='/api/auth/login';assert.equal((await req(path,{email:user.email,password:'wrong-password'},proof(path))).status,401);
  const response=await req(path,{email:user.email,password},proof(path));assert.equal(response.status,200);assert.ok(response.headers.getSetCookie().some(c=>/^sa_student_v45=[a-f0-9]{64};/.test(c)&&/HttpOnly/i.test(c)));
 });
 await t.test('a proof for another path cannot sign a registration request',async()=>{assert.equal((await req('/api/auth/register',{name:'Should not exist',email:'forged@integration.invalid',password,confirmPassword:password,country:'US'},proof('/api/auth/login'))).status,403);assert.equal(await M.User.countDocuments({email:'forged@integration.invalid'}),0);});
});
