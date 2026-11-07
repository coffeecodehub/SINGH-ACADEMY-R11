/** REAL Express + isolated MongoDB replica-set tests, with controlled provider
 * SDK/HTTP responses. No real card/PayPal/SMTP or production database is used. */
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';
test('V60.14 provider switch persists closure, capture exclusion and owned replacement identity',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 Object.assign(process.env,{ONLINE_PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_CISynthetic12345',STRIPE_WEBHOOK_SECRET:'whsec_CISynthetic12345',
  PAYPAL_MODE:'sandbox',PAYPAL_CLIENT_ID:'CISyntheticClient12345',PAYPAL_CLIENT_SECRET:'CISyntheticSecret12345',PAYPAL_WEBHOOK_ID:'CISyntheticWebhook12345',PAYPAL_MERCHANT_ID:''});
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default;
 const {createApp}=await import('../src/app.js'),providers=await import('../src/services/paymentProviders.js');
 const M={};for(const name of ['User','Course','SiteContent','CheckoutOrder','Payment','Invoice','Enrollment','Subscription'])M[name]=(await import('../src/models/'+name+'.js')).default;
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});
 let server,undoStripe=()=>{};const realFetch=globalThis.fetch;
 t.after(async()=>{globalThis.fetch=realFetch;undoStripe();try{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 assert.ok((await mongoose.connection.db.admin().command({hello:1})).setName,'Real replica set required');
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='Only-For-Isolated-CI-'+crypto.randomBytes(12).toString('hex'),passwordHash=await bcrypt.hash(password,12);
 const users={};for(const who of ['student','other'])users[who]=await M.User.create({name:who+' Fixture',email:who+'@switch-test.invalid',passwordHash,role:'student',status:'active'});
 const course=await M.Course.create({slug:'provider-switch',title:'Provider switching fixture',published:true,price:149,currency:'USD',accessType:'one_time',accessMonths:12});
 await M.SiteContent.create({key:'membershipPlans',value:[{name:'Switch Annual',durationMonths:12,price:299,currency:'USD',active:true}]});
 const stripeRecords=new Map(),paypalRecords=new Map(),captureCalls=[],expireCalls=[];
 const stripe=await providers.getStripe(),sessions=stripe.checkout.sessions,original={create:sessions.create,retrieve:sessions.retrieve,expire:sessions.expire};
 undoStripe=()=>Object.assign(sessions,original);
 sessions.retrieve=async id=>{assert.ok(stripeRecords.has(id));return structuredClone(stripeRecords.get(id));};
 sessions.expire=async id=>{const s=stripeRecords.get(id);assert.ok(s);assert.equal(s.status,'open');expireCalls.push(id);s.status='expired';return structuredClone(s);};
 sessions.create=async params=>{const id='cs_ci_'+params.client_reference_id,price=params.line_items[0].price_data;
  const s={id,mode:'payment',livemode:false,status:'open',payment_status:'unpaid',payment_intent:null,client_reference_id:params.client_reference_id,metadata:params.metadata,amount_total:price.unit_amount,currency:price.currency,url:'https://checkout.stripe.com/c/pay/'+id};
  stripeRecords.set(id,s);return structuredClone(s);
 };
 globalThis.fetch=async(input,options)=>{
  const url=String(input);
  if(!url.startsWith('https://api-m.sandbox.paypal.com/'))return realFetch(input,options);
  if(url.endsWith('/v1/oauth2/token'))return Response.json({access_token:'ci-only',expires_in:3600});
  if(url.endsWith('/v2/checkout/orders')&&options?.method==='POST'){
   const body=JSON.parse(options.body),id='PP_'+body.purchase_units[0].custom_id;
   const order={id,intent:'CAPTURE',status:'CREATED',purchase_units:body.purchase_units,links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token='+id}]};paypalRecords.set(id,order);return Response.json(order);
  }
  const id=decodeURIComponent(url.split('/orders/')[1]?.split('/')[0]||''),order=paypalRecords.get(id);
  assert.ok(order,'Unexpected external PayPal fixture request '+url);
  if(url.endsWith('/capture')){
   const db=await M.CheckoutOrder.findOne({providerOrderId:id}).select('+operationClaim');
   assert.ok(db.captureAttemptedAt);assert.ok(db.operationClaim);assert.equal(db.cancelRequestedAt,undefined);
   captureCalls.push(id);order.status='COMPLETED';order.purchase_units[0].payments={captures:[{id:'CAP_'+id,status:'COMPLETED',amount:order.purchase_units[0].amount,create_time:new Date().toISOString()}]};
  }
  return Response.json(order);
 };
 server=await new Promise(r=>{const s=createApp().listen(0,'127.0.0.1',()=>r(s));});const origin='http://127.0.0.1:'+server.address().port,cookies={};
 async function request(path,{who='student',body,method=body?'POST':'GET',key}={}){
  const r=await realFetch(origin+'/api'+path,{method,headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':'student',...(cookies[who]?{Cookie:cookies[who]}:{}),...(key?{'Idempotency-Key':key}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return{status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>/^sa_student_v45=[a-f0-9]{64}$/.test(x)).join('; ')};
 }
 for(const who of Object.keys(users)){const r=await request('/auth/login',{who,body:{email:users[who].email,password}});assert.equal(r.status,200);cookies[who]=r.cookie;}
 async function seed(provider,kind='course'){
  const id=new mongoose.Types.ObjectId(),key=crypto.randomUUID(),remoteId=provider==='stripe'?'cs_ci_'+id:'PP_'+id;
  const order=await M.CheckoutOrder.create({_id:id,user:users.student._id,provider,environment:'test',providerOrderId:remoteId,status:'pending',kind,product:kind==='course'?course.slug:'Switch Annual',title:'Switch fixture',currency:'USD',amountMinor:kind==='course'?14900:29900,durationMonths:12,expiresAt:new Date(Date.now()+3600000),requestKey:crypto.createHash('sha256').update(users.student._id+':'+key).digest('hex'),requestFingerprint:'fixture'});
  if(provider==='stripe')stripeRecords.set(remoteId,{id:remoteId,mode:'payment',livemode:false,status:'open',payment_status:'unpaid',payment_intent:null,client_reference_id:String(id),metadata:{sa_order_id:String(id),sa_user_id:String(users.student._id)},currency:'usd',amount_total:order.amountMinor});
  else paypalRecords.set(remoteId,{id:remoteId,intent:'CAPTURE',status:'CREATED',purchase_units:[{custom_id:String(id),amount:{currency_code:'USD',value:(order.amountMinor/100).toFixed(2)}}]});
  return{order,key,remoteId};
 }
 for(const provider of ['stripe','paypal'])for(const kind of ['course','membership'])await t.test(`${provider}/${kind} closes unpaid order before replacement eligibility is checked`,async()=>{
  const old=await seed(provider,kind),beforePayments=await M.Payment.countDocuments();
  const result=await request('/payments/checkout/release',{key:old.key,body:{}});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.released,true);
  const again=await request('/payments/checkout/release',{key:old.key,body:{}});assert.equal(result.data.replacementKey,again.data.replacementKey);
  const stored=await M.CheckoutOrder.findById(old.order._id).select('+operationClaim');assert.equal(stored.operationClaim,undefined);assert.ok(stored.cancelRequestedAt);
  assert.equal(stored.status,provider==='stripe'?'expired':'cancelled');
  const beforeOrders=await M.CheckoutOrder.countDocuments(),next=await request('/payments/checkout',{key:result.data.replacementKey,body:{kind,product:old.order.product,optionKey:kind==='course'?'base':'plan',provider:provider==='stripe'?'paypal':'stripe'}});
  if(kind==='membership'){
   // Existing blanket purchases can be safely closed, but their replacement
   // cannot bypass the retirement of NEW Academy-wide memberships.
   assert.equal(next.status,410,JSON.stringify(next.data));assert.equal(await M.CheckoutOrder.countDocuments(),beforeOrders);
  }else{assert.equal(next.status,200,JSON.stringify(next.data));assert.equal(next.data.order.status,'pending');assert.notEqual(next.data.order._id,String(old.order._id));}
  if(provider==='paypal')paypalRecords.get(old.remoteId).status='APPROVED';
  const late=await request('/payments/orders/'+old.order._id+'/confirm',{body:{}});assert.equal(late.status,200);assert.equal(late.data.order.status,stored.status);
  assert.equal(captureCalls.includes(old.remoteId),false);assert.equal(await M.Payment.countDocuments(),beforePayments);
 });
 await t.test('foreign owner release is denied without disclosing the order or its replacement key',async()=>{
  const old=await seed('stripe'),r=await request('/payments/checkout/release',{who:'other',key:old.key,body:{}});
  assert.equal(r.status,409);assert.equal(r.data.order,undefined);assert.equal((await M.CheckoutOrder.findById(old.order._id)).status,'pending');
 });
 await t.test('database lease excludes a simultaneous capture/switch and does not clear another operation',async()=>{
  const old=await seed('paypal');await M.CheckoutOrder.updateOne({_id:old.order._id},{$set:{operationClaim:'foreign-lease',operationClaimUntil:new Date(Date.now()+60000)}});
  const r=await request('/payments/checkout/release',{key:old.key,body:{}});assert.equal(r.status,409);
  assert.equal((await M.CheckoutOrder.findById(old.order._id).select('+operationClaim')).operationClaim,'foreign-lease');
 });
 await t.test('expired lease does not make an uncertain earlier capture safe to replace',async()=>{
  const old=await seed('paypal');paypalRecords.get(old.remoteId).status='APPROVED';
  await M.CheckoutOrder.updateOne({_id:old.order._id},{$set:{captureAttemptedAt:new Date(),operationClaimUntil:new Date(Date.now()-1000)}});
  const r=await request('/payments/checkout/release',{key:old.key,body:{}});assert.equal(r.status,409);assert.equal(r.data.replacementKey,undefined);
 });
 await t.test('two release requests share one replacement identity rather than authorize two new checkouts',async()=>{
  const old=await seed('stripe');const outcomes=await Promise.all([request('/payments/checkout/release',{key:old.key,body:{}}),request('/payments/checkout/release',{key:old.key,body:{}})]);
  assert.ok(outcomes.some(r=>r.status===200));assert.ok(outcomes.every(r=>[200,409].includes(r.status)));
  const final=await request('/payments/checkout/release',{key:old.key,body:{}});
  for(const result of outcomes.filter(x=>x.status===200))assert.equal(result.data.replacementKey,final.data.replacementKey);
  assert.equal(expireCalls.filter(id=>id===old.remoteId).length,1);
 });
 await t.test('normal PayPal approved checkout still captures once and fulfills a real database invoice',async()=>{
  const old=await seed('paypal');paypalRecords.get(old.remoteId).status='APPROVED';
  const confirm=await request('/payments/orders/'+old.order._id+'/confirm',{body:{}});assert.equal(confirm.status,200,JSON.stringify(confirm.data));
  assert.equal(confirm.data.order.status,'paid');assert.equal(await M.Payment.countDocuments({checkoutOrder:old.order._id}),1);
  const release=await request('/payments/checkout/release',{key:old.key,body:{}});assert.equal(release.data.released,false);assert.equal(release.data.replacementKey,undefined);
  assert.equal(captureCalls.filter(id=>id===old.remoteId).length,1);
 });
});
