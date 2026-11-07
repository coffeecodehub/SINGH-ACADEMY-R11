/** Actual application HTTP + isolated MongoDB + the real Stripe SDK talking to
 * a loopback synthetic provider server. No external merchant or charge exists. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {isolatedDatabase,testEnvironment} from './isolation.js';

test('owned renewal controls require consent and provider confirmation without changing paid access',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();Object.assign(process.env,{ONLINE_PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:['sk','test',crypto.randomBytes(18).toString('hex')].join('_'),STRIPE_WEBHOOK_SECRET:'whsec_SyntheticRenewalControls'});
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default,{createApp}=await import('../src/app.js'),{getStripe}=await import('../src/services/paymentProviders.js');
 const models={};for(const name of ['User','Course','CheckoutOrder','BillingAgreement','Invoice','Payment','Enrollment','AuditLog'])models[name]=(await import('../src/models/'+name+'.js')).default;
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});
 const remote=new Map(),requests=[],mutations=[],cache=new Map();let failUpdates=0,delayUpdate=null;
 let server,provider;const stripe=await getStripe(),originalApi={...stripe._api};
 t.after(async()=>{Object.assign(stripe._api,originalApi);for(const s of [server,provider])if(s){s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}try{await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 provider=await new Promise(resolve=>{const s=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const path=new URL(req.url,'http://synthetic.invalid').pathname,subscriptionId=path.split('/').at(-1),subscription=remote.get(subscriptionId);
  requests.push({method:req.method,path,key:req.headers['idempotency-key'],body:raw});
  res.setHeader('Content-Type','application/json');
  if(!subscription){res.writeHead(404);return res.end(JSON.stringify({error:{type:'invalid_request_error',message:'Unknown synthetic subscription'}}));}
  if(req.method==='GET')return res.end(JSON.stringify(subscription));
  if(req.method==='POST'){
   const key=req.headers['idempotency-key'],params=new URLSearchParams(raw);assert.match(String(key),/^sa-renewal-/);
   if(delayUpdate)await delayUpdate;
   if(failUpdates>0){failUpdates--;res.writeHead(503);return res.end(JSON.stringify({error:{type:'api_error',message:'Synthetic provider outage before update'}}));}
   if(!cache.has(key)){subscription.cancel_at_period_end=params.get('cancel_at_period_end')==='true';cache.set(key,structuredClone(subscription));mutations.push({id:subscriptionId,cancel:subscription.cancel_at_period_end,key});}
   return res.end(JSON.stringify(cache.get(key)));
  }
  if(req.method==='DELETE'){subscription.status='canceled';return res.end(JSON.stringify(subscription));}
  res.writeHead(405);res.end('{}');
 }).listen(0,'127.0.0.1',()=>resolve(s));});
 Object.assign(stripe._api,{host:'127.0.0.1',port:provider.address().port,protocol:'http',maxNetworkRetries:1,timeout:3000});
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='Synthetic-'+crypto.randomBytes(16).toString('hex'),passwordHash=await bcrypt.hash(password,12),users={};
 for(const who of ['owner','other'])users[who]=await models.User.create({name:'Synthetic '+who,email:who+'@renewal-controls.invalid',country:'PK',role:'student',status:'active',passwordHash});
 const startsAt=new Date(Math.floor(Date.now()/1000)*1000-86400000),endsAt=new Date(+startsAt+30*86400000);
 await models.Course.create({slug:'renewal-course',title:'Renewal course',published:true,price:10,currency:'USD',accessType:'one_time',accessMonths:1});
 const order=await models.CheckoutOrder.create({user:users.owner._id,provider:'stripe',environment:'test',providerOrderId:'cs_SYNTHETIC_controls',kind:'course',product:'renewal-course',title:'Renewal course',amountMinor:500,renewalAmountMinor:1000,subtotalMinor:1000,discountMinor:500,currency:'USD',country:'PK',durationMonths:1,autoRenew:true,termsAcceptedAt:startsAt,status:'paid',expiresAt:endsAt,paidAt:startsAt,requestKey:'synthetic-controls-original',requestFingerprint:'synthetic-controls-original'});
 const agreement=await models.BillingAgreement.create({user:users.owner._id,checkoutOrder:order._id,provider:'stripe',environment:'test',providerSubscriptionId:'sub_SYNTHETIC_controls',kind:'course',product:order.product,title:order.title,amountMinor:1000,currency:'USD',country:'PK',intervalMonths:1,status:'active',activeKey:[users.owner._id,'test','course',order.product].join(':'),currentPeriodStart:startsAt,currentPeriodEnd:endsAt,termsAcceptedAt:startsAt});
 order.billingAgreement=agreement._id;await order.save();
 const invoice=await models.Invoice.create({user:users.owner._id,createdBy:users.owner._id,number:'SA-SYNTHETIC-CONTROLS',kind:'course',courseSlug:order.product,title:order.title,origin:'recurring',billingAgreement:agreement._id,currency:'USD',totalMinor:500,paidMinor:500,creditedMinor:0,status:'paid',testMode:true,paidAt:startsAt,dueAt:startsAt,accessStartsAt:startsAt,accessExpiresAt:endsAt,grantVersion:1,grantStartsAt:startsAt,grantExpiresAt:endsAt,fulfillmentAt:startsAt,requestKey:'synthetic-controls-invoice',requestFingerprint:'synthetic-controls-invoice'});
 await models.Enrollment.create({user:users.owner._id,courseSlug:order.product,status:'active',source:'provider',invoice:invoice._id,testMode:true,accessStartsAt:startsAt,accessExpiresAt:endsAt});
 remote.set(agreement.providerSubscriptionId,{id:agreement.providerSubscriptionId,object:'subscription',metadata:{sa_order_id:String(order._id),sa_user_id:String(users.owner._id)},livemode:false,status:'active',cancel_at_period_end:false,items:{object:'list',has_more:false,data:[{current_period_end:Math.floor(+endsAt/1000),price:{unit_amount:1000,currency:'usd',recurring:{interval:'month',interval_count:1}}}]}});
 server=await new Promise(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+server.address().port,cookies={};
 async function request(path,{who='owner',body,method=body?'POST':'GET',key}={}){
  const response=await fetch(origin+'/api'+path,{method,headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':'student',...(cookies[who]?{Cookie:cookies[who]}:{}),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cookie:response.headers.getSetCookie().map(s=>s.split(';')[0]).filter(s=>/^sa_student_v45=[a-f0-9]{64}$/.test(s)).join('; ')};
 }
 for(const who of ['owner','other']){const login=await request('/auth/login',{who,body:{email:users[who].email,password}});assert.equal(login.status,200);cookies[who]=login.cookie;}
 const path='/payments/mine/agreements/'+agreement._id,getItem=async()=>(await request('/payments/mine/agreements')).data.items.find(a=>a._id===String(agreement._id));
 let current;
 await t.test('owner sees a visible enabled state while foreign actions cannot contact the provider',async()=>{
  current=await getItem();assert.equal(current.autoRenew,true);assert.equal(current.canDisableRenewal,true);assert.equal(current.canEnableRenewal,false);assert.equal(current.amountMinor,1000);
  const before=requests.length;
  for(const action of ['cancel','resume'])assert.equal((await request(path+'/'+action,{who:'other',body:{termsAccepted:true,consentFingerprint:current.renewalConsentFingerprint}})).status,404);
  assert.equal(requests.length,before);
 });
 await t.test('disable is confirmed remotely and leaves independent paid access and financial records unchanged',async()=>{
  const result=await request(path+'/cancel',{body:{}});assert.equal(result.status,200,JSON.stringify(result.data));current=result.data.item;assert.equal(current.autoRenew,false);assert.equal(current.cancelAtPeriodEnd,true);assert.equal(current.canEnableRenewal,true);
  const {effectiveCourseEnrollment}=await import('../src/services/courseEntitlements.js');assert.ok(await effectiveCourseEnrollment(users.owner._id,order.product,null,{environment:'test'}));
  assert.equal(+(await models.Invoice.findById(invoice._id)).grantExpiresAt,+endsAt);assert.equal(await models.Invoice.countDocuments(),1);assert.equal(await models.Payment.countDocuments(),0);
  const count=mutations.length;assert.equal((await request(path+'/cancel',{body:{}})).status,200);assert.equal(mutations.length,count);
 });
 await t.test('enable requires explicit consent bound to the undiscounted recurring price',async()=>{
  const before=mutations.length;
  assert.equal((await request(path+'/resume',{body:{}})).status,400);
  assert.equal((await request(path+'/resume',{body:{termsAccepted:true,consentFingerprint:'stale'}})).status,409);assert.equal(mutations.length,before);
  const result=await request(path+'/resume',{body:{termsAccepted:true,consentFingerprint:current.renewalConsentFingerprint}});assert.equal(result.status,200,JSON.stringify(result.data));current=result.data.item;assert.equal(current.autoRenew,true);assert.equal(current.canDisableRenewal,true);assert.equal(current.canEnableRenewal,false);assert.ok((await models.BillingAgreement.findById(agreement._id)).renewalConsentedAt);
  assert.equal((await request(path+'/resume',{body:{termsAccepted:true,consentFingerprint:current.renewalConsentFingerprint}})).status,200);assert.equal(mutations.length,before+1);
  const evidence=await models.AuditLog.findOne({action:'subscription.auto_renew_enabled'});assert.equal(evidence.changes.amountMinor,1000);assert.equal(evidence.changes.termsAccepted,true);
 });
 await t.test('disable-enable-disable uses a fresh provider key for each actual toggle',async()=>{
  const result=await request(path+'/cancel',{body:{}});assert.equal(result.status,200);current=result.data.item;assert.equal(remote.get(agreement.providerSubscriptionId).cancel_at_period_end,true);
  assert.deepEqual(mutations.map(m=>m.cancel),[true,false,true]);assert.equal(new Set(mutations.map(m=>m.key)).size,3);
 });
 await t.test('a provider price change or an unconfirmed paid period cannot be enabled',async()=>{
  const subscription=remote.get(agreement.providerSubscriptionId),body={termsAccepted:true,consentFingerprint:current.renewalConsentFingerprint},before=mutations.length;
  subscription.items.data[0].price.unit_amount=1;assert.equal((await request(path+'/resume',{body})).status,409);subscription.items.data[0].price.unit_amount=1000;
  subscription.items.data[0].current_period_end+=86400;assert.equal((await request(path+'/resume',{body})).status,409);subscription.items.data[0].current_period_end-=86400;
  assert.equal(mutations.length,before);assert.equal((await models.BillingAgreement.findById(agreement._id)).autoRenew,false);
 });
 await t.test('uncertain provider changes retain a retry key and block opposing changes',async()=>{
  failUpdates=2;
  const body={termsAccepted:true,consentFingerprint:current.renewalConsentFingerprint},failed=await request(path+'/resume',{body});assert.ok(failed.status>=500,JSON.stringify(failed.data));
  const pending=await models.BillingAgreement.findById(agreement._id);assert.equal(pending.renewalOperation.autoRenew,true);assert.equal(pending.autoRenew,false);
  const before=requests.length;assert.equal((await request(path+'/cancel',{body:{}})).status,409);assert.equal(requests.length,before);
  const retry=await request(path+'/resume',{body});assert.equal(retry.status,200,JSON.stringify(retry.data));current=retry.data.item;assert.equal(current.autoRenew,true);assert.equal(current.renewalActionPending,false);
  const attempts=requests.filter(r=>r.method==='POST').slice(-3);assert.equal(attempts.length,3);assert.equal(new Set(attempts.map(r=>r.key)).size,1);
 });
 await t.test('simultaneous opposite changes cannot override an unconfirmed operation',async()=>{
  let release;delayUpdate=new Promise(resolve=>release=resolve);const before=requests.length,pending=request(path+'/cancel',{body:{}});
  const deadline=Date.now()+10000;while(!requests.slice(before).some(r=>r.method==='POST')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(requests.slice(before).some(r=>r.method==='POST'));
  const opposite=await request(path+'/resume',{body:{termsAccepted:true,consentFingerprint:current.renewalConsentFingerprint}});assert.equal(opposite.status,409);
  release();delayUpdate=null;assert.equal((await pending).status,200);current=await getItem();assert.equal(current.autoRenew,false);
 });
 await t.test('ended agreements and one-time purchases require a new consented checkout',async()=>{
  remote.get(agreement.providerSubscriptionId).status='canceled';await models.BillingAgreement.updateOne({_id:agreement._id},{$set:{status:'cancelled',autoRenew:false},$unset:{activeKey:1}});
  current=await getItem();assert.equal(current.canEnableRenewal,false);const before=mutations.length;
  assert.equal((await request(path+'/resume',{body:{termsAccepted:true,consentFingerprint:current.renewalConsentFingerprint}})).status,409);assert.equal(mutations.length,before);
  assert.equal((await request('/payments/mine/agreements/'+new mongoose.Types.ObjectId()+'/resume',{body:{termsAccepted:true}})).status,404);
  assert.equal(await models.Invoice.countDocuments(),1);assert.equal(await models.Payment.countDocuments(),0);
 });
 await t.test('retired blanket membership sales cannot create quotes/orders, while legacy paid order recovery remains owned',async()=>{
  for(const kind of ['membership',' membership ']){
   assert.equal((await request('/payments/catalog?kind='+encodeURIComponent(kind)+'&product=Annual')).status,410);
   assert.equal((await request('/payments/quote',{body:{kind,product:'Annual'}})).status,410);
   assert.equal((await request('/payments/checkout',{body:{kind,product:'Annual'},key:crypto.randomUUID()})).status,410);
  }
  const key=crypto.randomUUID(),digest=value=>crypto.createHash('sha256').update(value).digest('hex'),{stableJson}=await import('../src/utils/business.js');
  const shape={kind:'membership',product:'Annual',provider:'stripe',optionKey:'plan',renewalOf:'',autoRenew:false,couponCode:''};
  const legacy=await models.CheckoutOrder.create({user:users.owner._id,provider:'stripe',environment:'test',kind:'membership',product:'Annual',title:'Legacy Annual',optionKey:'plan',amountMinor:12000,currency:'USD',durationMonths:12,status:'paid',expiresAt:endsAt,requestKey:digest(String(users.owner._id)+':'+key),requestFingerprint:digest(stableJson(shape))});
  assert.equal((await request('/payments/checkout-status',{key})).data.order._id,String(legacy._id));
  const replay=await request('/payments/checkout',{body:{...shape,termsAccepted:true},key});assert.equal(replay.status,200,JSON.stringify(replay.data));assert.equal(replay.data.order._id,String(legacy._id));
  assert.equal((await request('/payments/orders/'+legacy._id,{who:'other'})).status,404);assert.equal((await request('/payments/checkout',{who:'other',body:shape,key})).status,410);
 });
});
