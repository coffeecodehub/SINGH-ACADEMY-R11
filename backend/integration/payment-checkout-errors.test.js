/** Actual HTTP + isolated Mongo transactions + real Stripe SDK loopback.
 * Provider responses are synthetic; no external merchant is contacted. */
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import http from 'node:http';
import {isolatedDatabase,testEnvironment} from './isolation.js';
test('provider checkout failures retain safe diagnostics and one immutable pending order',{timeout:120000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();Object.assign(process.env,{ONLINE_PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_SyntheticErrorR9',STRIPE_WEBHOOK_SECRET:'whsec_SyntheticErrorR9'});
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default,{createApp}=await import('../src/app.js'),{getStripe}=await import('../src/services/paymentProviders.js');
 const M={};for(const name of ['User','Course','CheckoutOrder','Payment','Invoice','Enrollment','GatewayEvent'])M[name]=(await import('../src/models/'+name+'.js')).default;
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});
 const stripe=await getStripe(),oldApi={...stripe._api},logs=[],oldError=console.error;let server,provider,failure={status:400,type:'invalid_request_error',code:'parameter_invalid_integer'},paid=false,remote;
 const calls=[];console.error=value=>logs.push(String(value));
 t.after(async()=>{console.error=oldError;Object.assign(stripe._api,oldApi);for(const s of [server,provider])if(s){s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}try{await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 provider=await new Promise(resolve=>{const s=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const path=new URL(req.url,'http://provider.invalid').pathname;
  res.setHeader('Content-Type','application/json');res.setHeader('request-id','req_SYNTHETIC_R9');
  if(req.method==='POST'&&path==='/v1/checkout/sessions'){
   calls.push({key:req.headers['idempotency-key'],raw});
   if(failure?.socket){res.destroy();return;}
   if(failure){res.statusCode=failure.status;return res.end(JSON.stringify({error:{type:failure.type,code:failure.code,message:'PRIVATE '+process.env.STRIPE_SECRET_KEY+' merchant@example.invalid',param:'line_items[0][price_data][unit_amount]'}}));}
   const params=new URLSearchParams(raw),id=params.get('client_reference_id');remote={id:'cs_SYNTHETIC_'+id,mode:'payment',status:'open',payment_status:'unpaid',livemode:false,client_reference_id:id,metadata:{sa_order_id:id,sa_user_id:params.get('metadata[sa_user_id]')},currency:'usd',amount_total:1000,url:'https://checkout.stripe.com/c/pay/'+id};
   return res.end(JSON.stringify(remote));
  }
  if(req.method==='GET'&&path==='/v1/checkout/sessions/'+remote?.id){
   const current=structuredClone(remote);if(paid)Object.assign(current,{status:'complete',payment_status:'paid',payment_intent:{id:'pi_SYNTHETIC_R9',status:'succeeded',amount_received:1000,currency:'usd',latest_charge:{id:'ch_SYNTHETIC_R9',paid:true,created:Math.floor(Date.now()/1000)}}});
   return res.end(JSON.stringify(current));
  }
  res.statusCode=404;res.end('{}');
 }).listen(0,'127.0.0.1',()=>resolve(s));});
 Object.assign(stripe._api,{host:'127.0.0.1',port:provider.address().port,protocol:'http',maxNetworkRetries:0,timeout:1500});
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='R9-'+crypto.randomBytes(16).toString('hex'),user=await M.User.create({name:'Synthetic student',email:'student@r9-error.invalid',role:'student',status:'active',country:'US',passwordHash:await bcrypt.hash(password,10)});
 const course=await M.Course.create({title:'Error recovery fixture',slug:'error-recovery-r9',published:true,accessType:'one_time',price:10,currency:'USD',accessMonths:1});
 server=await new Promise(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+server.address().port;let cookie='';
 async function request(path,{body,key,headers={}}={}){const response=await fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':'student',...(cookie?{Cookie:cookie}:{}),...(key?{'Idempotency-Key':key}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});return {status:response.status,headers:response.headers,data:await response.json()};}
 const login=await request('/auth/login',{body:{email:user.email,password}});assert.equal(login.status,200);cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>/^sa_student_v45=[a-f0-9]{64}$/.test(x)).join('; ');
 const key=crypto.randomUUID(),body={kind:'course',product:course.slug,optionKey:'base',provider:'stripe',autoRenew:false,termsAccepted:true},quote=await request('/payments/quote',{body});assert.equal(quote.status,200);body.quoteFingerprint=quote.data.quote.fingerprint;
 for(const entry of [
  {status:400,type:'invalid_request_error',code:'parameter_invalid_integer',http:502,publicCode:'PAYMENT_PROVIDER_REJECTED'},
  {status:401,type:'invalid_request_error',code:'api_key_expired',http:503,publicCode:'PAYMENT_PROVIDER_CONFIGURATION'},
  {status:429,type:'rate_limit_error',code:'rate_limit',http:503,publicCode:'PAYMENT_PROVIDER_UNAVAILABLE'},
  {status:500,type:'api_error',code:'api_error',http:503,publicCode:'PAYMENT_PROVIDER_UNAVAILABLE'},
  {socket:true,http:503,publicCode:'PAYMENT_PROVIDER_UNAVAILABLE'}
 ])await t.test('real SDK '+(entry.socket?'connection failure':entry.status)+' stays on the same checkout',async()=>{
  failure=entry;const result=await request('/payments/checkout',{key,body});assert.equal(result.status,entry.http,JSON.stringify(result.data));assert.equal(result.data.code,entry.publicCode);assert.match(result.data.message,/Request ID: [a-f0-9-]+\./);assert.equal(result.data.requestId,result.headers.get('x-request-id'));
  const persisted=await M.CheckoutOrder.findOne({user:user._id});assert.equal(await M.CheckoutOrder.countDocuments(),1);assert.ok(persisted.creationAttemptedAt);assert.equal(persisted.providerOrderId,undefined);assert.ok(['creating','pending'].includes(persisted.status));assert.equal(await M.Payment.countDocuments(),0);assert.equal(await M.Enrollment.countDocuments(),0);
  assert.equal(calls.at(-1).key,'sa-create-'+persisted._id);assert.equal(calls.at(-1).raw,calls[0].raw);
  const line=JSON.parse(logs.at(-1));assert.equal(line.requestId,result.data.requestId);assert.equal(line.paymentProvider,'stripe');if(!entry.socket){assert.equal(line.providerStatus,entry.status);assert.equal(line.providerRequestId,'req_SYNTHETIC_R9');assert.equal(line.providerCode,entry.code);assert.equal(line.providerParam,'line_items[0][price_data][unit_amount]');}
  assert.equal(JSON.stringify(result.data).includes('PRIVATE'),false);assert.equal(logs.join('').includes(process.env.STRIPE_SECRET_KEY),false);assert.equal(logs.join('').includes('merchant@example.invalid'),false);
 });
 await t.test('explicit same-order retry succeeds, signed webhook grants once and repeated delivery is idempotent',async()=>{
  failure=null;const checkout=await request('/payments/checkout',{key,body});assert.equal(checkout.status,200,JSON.stringify(checkout.data));assert.equal(checkout.data.order.status,'pending');assert.equal(await M.CheckoutOrder.countDocuments(),1);assert.equal(calls.at(-1).raw,calls[0].raw);paid=true;
  const event={id:'evt_SYNTHETIC_R9',type:'checkout.session.completed',livemode:false,data:{object:{id:remote.id,metadata:remote.metadata}}},raw=JSON.stringify(event),signature=stripe.webhooks.generateTestHeaderString({payload:raw,secret:process.env.STRIPE_WEBHOOK_SECRET});
  assert.equal((await request('/payments/webhooks/stripe',{body:raw,headers:{'stripe-signature':'invalid'}})).status,400);assert.equal(await M.Payment.countDocuments(),0);
  for(let n=0;n<2;n++)assert.equal((await request('/payments/webhooks/stripe',{body:raw,headers:{'stripe-signature':signature}})).status,200);
  assert.equal(await M.Payment.countDocuments(),1);assert.equal(await M.Invoice.countDocuments(),1);assert.equal(await M.Enrollment.countDocuments({user:user._id,courseSlug:course.slug,status:'active'}),1);assert.equal(await M.GatewayEvent.countDocuments(),1);assert.equal((await M.CheckoutOrder.findById(checkout.data.order._id)).status,'paid');
 });
});
