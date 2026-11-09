/** Real HTTP/Mongo/Stripe-SDK retry workflow against loopback synthetic transport.
 * No external merchant, payment method, refund or production database is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {isolatedDatabase,testEnvironment} from './isolation.js';

test('abandoned purchases restart safely and verified replacement purchases retire only their old pending billing cards',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 Object.assign(process.env,{ONLINE_PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:['sk','test','SyntheticRepurchaseOnly'].join('_'),STRIPE_WEBHOOK_SECRET:['whsec','SyntheticRepurchaseOnly'].join('_')});
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default,{createApp}=await import('../src/app.js'),{getStripe}=await import('../src/services/paymentProviders.js');
 const M={};for(const name of ['User','Course','Section','CheckoutOrder','BillingAgreement','Payment','Invoice','Enrollment','SectionAccess'])M[name]=(await import('../src/models/'+name+'.js')).default;
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});
 const stripe=await getStripe(),oldApi={...stripe._api},sessions=new Map(),subscriptions=new Map(),invoices=new Map(),collections=new Map(),faults=new Map(),calls=[],logs=[],oldError=console.error;
 let server,provider,onExpire=null;
 console.error=value=>logs.push(String(value));
 t.after(async()=>{console.error=oldError;Object.assign(stripe._api,oldApi);for(const item of [server,provider])if(item){item.closeAllConnections();await new Promise(resolve=>item.close(resolve));}try{await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 const missing=(res,status=404)=>{res.statusCode=status;res.end(JSON.stringify({error:{type:status>=500?'api_error':'invalid_request_error',code:status>=500?'api_error':'resource_missing',message:'Synthetic provider failure',param:'id'}}));};
 provider=await new Promise(resolve=>{const item=http.createServer(async(req,res)=>{
  try{
   let raw='';for await(const chunk of req)raw+=chunk;
   const url=new URL(req.url,'http://provider.invalid'),route=url.pathname;
   calls.push({method:req.method,path:route,key:req.headers['idempotency-key']});
   res.setHeader('Content-Type','application/json');res.setHeader('request-id','req_synthetic_repurchase');
   if(req.method==='POST'&&route==='/v1/checkout/sessions'){
    const body=new URLSearchParams(raw),order=body.get('client_reference_id'),id='cs_SYNTHETIC_'+order,existing=sessions.get(id);
    assert.equal(req.headers['idempotency-key'],'sa-create-'+order);
    if(existing)return res.end(JSON.stringify(existing));
    const price=Number(body.get('line_items[0][price_data][unit_amount]')),currency=body.get('line_items[0][price_data][currency]'),mode=body.get('mode');
    const session={id,url:'https://checkout.stripe.com/c/pay/'+id,mode,status:'open',payment_status:'unpaid',livemode:false,client_reference_id:order,metadata:{sa_order_id:order,sa_user_id:body.get('metadata[sa_user_id]')},currency,amount_total:price,payment_intent:null,subscription:null};
    session.fixtureMonths=Number(body.get('line_items[0][price_data][recurring][interval_count]')||1);sessions.set(id,session);return res.end(JSON.stringify(session));
   }
   if(route.startsWith('/v1/checkout/sessions/')){
    const parts=route.split('/'),id=parts[4],session=sessions.get(id);
    if(faults.has(id))return missing(res,faults.get(id));
    if(!session)return missing(res);
    if(req.method==='POST'&&route.endsWith('/expire')){
     if(onExpire)await onExpire(session);
     if(session.payment_status==='paid'){res.statusCode=400;return res.end(JSON.stringify({error:{type:'invalid_request_error',code:'checkout_session_not_expirable',message:'Synthetic session already completed'}}));}
     session.status='expired';
    }
    return res.end(JSON.stringify(session));
   }
   if(route.startsWith('/v1/subscriptions/')){const value=subscriptions.get(route.split('/')[3]);return value?res.end(JSON.stringify(value)):missing(res);}
   if(route.startsWith('/v1/invoices/')){const value=invoices.get(route.split('/')[3]);return value?res.end(JSON.stringify(value)):missing(res);}
   if(route==='/v1/invoice_payments')return res.end(JSON.stringify({data:collections.get(url.searchParams.get('invoice'))||[],has_more:false}));
   return missing(res);
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:{type:'api_error',code:'fixture_assertion',message:String(error.message)}}));}
 }).listen(0,'127.0.0.1',()=>resolve(item));});
 Object.assign(stripe._api,{host:'127.0.0.1',port:provider.address().port,protocol:'http',maxNetworkRetries:0,timeout:2000});
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='Repurchase-'+crypto.randomBytes(16).toString('hex'),passwordHash=await bcrypt.hash(password,10),users={};
 for(const who of ['owner','other'])users[who]=await M.User.create({name:'Synthetic '+who,email:who+'@repurchase.invalid',role:'student',status:'active',country:'US',passwordHash});
 server=await new Promise(resolve=>{const item=createApp().listen(0,'127.0.0.1',()=>resolve(item));});const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function request(path,{who='owner',body,key,method=body===undefined?'GET':'POST'}={}){
  const response=await fetch(base+'/api'+path,{method,headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':'student',...(cookies[who]?{Cookie:cookies[who]}:{}),...(key?{'Idempotency-Key':key}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json(),cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>/^sa_student_v45=[a-f0-9]{64}$/.test(value)).join('; ')};
 }
 for(const who of ['owner','other']){const login=await request('/auth/login',{who,body:{email:users[who].email,password}});assert.equal(login.status,200,JSON.stringify(login));cookies[who]=login.cookie;}
 async function product(kind,slug){await M[kind==='course'?'Course':'Section'].create({title:'Synthetic '+slug,slug,published:true,currency:'USD',price:10,accessMonths:1,...(kind==='course'?{accessType:'one_time'}:{})});}
 async function checkout(kind,slug,{autoRenew=true,key=crypto.randomUUID(),who='owner'}={}){
  const body={kind,product:slug,provider:'stripe',optionKey:'base',autoRenew,termsAccepted:true},quote=await request('/payments/quote',{who,body});assert.equal(quote.status,200,JSON.stringify(quote));body.quoteFingerprint=quote.data.quote.fingerprint;
  return {result:await request('/payments/checkout',{who,key,body}),body,key};
 }
 async function billing(who='owner'){const result=await request('/payments/mine/agreements',{who});assert.equal(result.status,200,JSON.stringify(result));return result.data.items;}
 function collect(session){
  const at=Math.floor(Date.now()/1000),paymentId='pi_SYNTHETIC_'+session.client_reference_id;
  Object.assign(session,{status:'complete',payment_status:'paid'});
  if(session.mode==='payment'){session.payment_intent={id:paymentId,status:'succeeded',amount_received:session.amount_total,currency:session.currency,latest_charge:{id:'ch_SYNTHETIC_'+session.client_reference_id,paid:true,created:at}};return;}
  const subscription='sub_SYNTHETIC_'+session.client_reference_id,invoice='in_SYNTHETIC_'+session.client_reference_id;session.subscription=subscription;session.invoice=invoice;
  subscriptions.set(subscription,{id:subscription,metadata:session.metadata,livemode:false,status:'active',customer:'cus_SYNTHETIC',cancel_at_period_end:false,items:{data:[{price:{currency:session.currency,unit_amount:session.amount_total,recurring:{interval:'month',interval_count:session.fixtureMonths}}}],has_more:false},latest_invoice:invoice});
  invoices.set(invoice,{id:invoice,parent:{subscription_details:{subscription}},livemode:false,currency:session.currency,billing_reason:'subscription_create',status:'paid',total:session.amount_total,amount_paid:session.amount_total,amount_remaining:0,status_transitions:{paid_at:at},lines:{data:[{period:{start:at,end:at+30*86400},parent:{subscription_item_details:{proration:false}}}],has_more:false}});
  collections.set(invoice,[{invoice,amount_paid:session.amount_total,currency:session.currency,livemode:false,status:'paid',payment:{payment_intent:{id:paymentId,status:'succeeded',amount_received:session.amount_total,currency:session.currency}}}]);
 }

 for(const [kind,finalRecurring]of [['course',false],['section',true]])await t.test(`${kind}: abandoned recurring checkout stays pending until a later ${finalRecurring?'recurring':'one-time'} purchase is actually verified`,async()=>{
  const slug='replace-'+kind;await product(kind,slug);
  const original=await checkout(kind,slug);assert.equal(original.result.status,200,JSON.stringify(original.result));const oldOrder=await M.CheckoutOrder.findById(original.result.data.order._id),oldAgreement=await M.BillingAgreement.findById(oldOrder.billingAgreement);
  assert.equal((await billing()).find(item=>item._id===String(oldAgreement._id)).pendingCheckout,true);
  const fresh=await checkout(kind,slug,{autoRenew:false});assert.equal(fresh.result.status,200,JSON.stringify(fresh.result));assert.notEqual(fresh.result.data.order._id,String(oldOrder._id));
  assert.equal(sessions.get(oldOrder.providerOrderId).status,'expired');const closed=await M.CheckoutOrder.findById(oldOrder._id),retired=await M.BillingAgreement.findById(oldAgreement._id);
  assert.equal(closed.status,'expired');assert.equal(retired.status,'creating');assert.equal(retired.autoRenew,false);assert.equal(retired.activeKey,undefined);assert.equal(retired.accessCancelledAt,undefined);
  let rows=await billing();assert.equal(rows.find(item=>item._id===String(oldAgreement._id)).pendingCheckout,true);assert.equal(await M.Payment.countDocuments({user:users.owner._id,kind}),0);
  // Back/Cancel and an unpaid expired replacement are not paid-access evidence.
  const abandoned=await M.CheckoutOrder.findById(fresh.result.data.order._id);sessions.get(abandoned.providerOrderId).status='expired';
  const failed=await request('/payments/orders/'+abandoned._id+'/confirm',{body:{}});assert.equal(failed.status,200);assert.equal(failed.data.order.status,'expired');
  assert.equal((await billing()).find(item=>item._id===String(oldAgreement._id)).pendingCheckout,true);
  const beforeOrder=await M.CheckoutOrder.findById(oldOrder._id).lean(),beforeAgreement=await M.BillingAgreement.findById(oldAgreement._id).lean();
  const replacement=await checkout(kind,slug,{autoRenew:finalRecurring});assert.equal(replacement.result.status,200,JSON.stringify(replacement.result));const newOrder=await M.CheckoutOrder.findById(replacement.result.data.order._id);
  const createCount=calls.filter(call=>call.method==='POST'&&call.path==='/v1/checkout/sessions').length;
  const repeat=await request('/payments/checkout',{body:replacement.body,key:replacement.key});assert.equal(repeat.status,200);assert.equal(repeat.data.order._id,String(newOrder._id));assert.equal(calls.filter(call=>call.method==='POST'&&call.path==='/v1/checkout/sessions').length,createCount);
  assert.ok((await billing()).some(item=>item._id===String(oldAgreement._id)),'Unpaid replacement must leave the old pending billing card visible');
  collect(sessions.get(newOrder.providerOrderId));const paid=await request('/payments/orders/'+newOrder._id+'/confirm',{body:{}});assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(paid.data.order.status,'paid');
  rows=await billing();assert.equal(rows.some(item=>item._id===String(oldAgreement._id)),false,'A genuine verified replacement must retire the old pending billing card');
  assert.deepEqual(await M.CheckoutOrder.findById(oldOrder._id).lean(),beforeOrder);assert.deepEqual(await M.BillingAgreement.findById(oldAgreement._id).lean(),beforeAgreement);
  assert.equal(await M.CheckoutOrder.countDocuments({_id:oldOrder._id}),1);assert.equal(await M.BillingAgreement.countDocuments({_id:oldAgreement._id}),1);
  const saved=await M.CheckoutOrder.findById(newOrder._id),invoice=await M.Invoice.findById(saved.invoice),payment=await M.Payment.findById(saved.payment);
  assert.equal(invoice.status,'paid');assert.equal(invoice.paidMinor,1000);assert.ok(invoice.fulfillmentAt);assert.equal(payment.status,'paid');assert.ok(payment.verifiedAt);assert.equal(String(payment.checkoutOrder),String(saved._id));
  if(kind==='course')assert.ok(await M.Enrollment.exists({user:users.owner._id,courseSlug:slug,status:'active'}));else assert.ok(await M.SectionAccess.exists({user:users.owner._id,sectionSlug:slug,status:'active'}));
  const repeatConfirm=await request('/payments/orders/'+newOrder._id+'/confirm',{body:{}});assert.equal(repeatConfirm.status,200);assert.equal(await M.Payment.countDocuments({checkoutOrder:newOrder._id}),1);assert.equal(await M.Invoice.countDocuments({_id:saved.invoice}),1);
 });

 for(const status of [404,503])await t.test(`provider closure HTTP ${status} preserves the pending history and cannot create a new checkout`,async()=>{
  const slug='provider-error-'+status;await product('course',slug);const original=await checkout('course',slug);assert.equal(original.result.status,200);const old=await M.CheckoutOrder.findById(original.result.data.order._id),before=await M.CheckoutOrder.countDocuments(),created=calls.filter(call=>call.method==='POST'&&call.path==='/v1/checkout/sessions').length;
  faults.set(old.providerOrderId,status);const fresh=await checkout('course',slug,{autoRenew:false});assert.equal(fresh.result.status,status===404?502:503,JSON.stringify(fresh.result));assert.equal(fresh.result.data.code,'CHECKOUT_RESTART_REQUIRED');
  assert.equal(await M.CheckoutOrder.countDocuments(),before);assert.equal(calls.filter(call=>call.method==='POST'&&call.path==='/v1/checkout/sessions').length,created);assert.equal((await M.CheckoutOrder.findById(old._id)).status,'pending');assert.ok((await M.BillingAgreement.findById(old.billingAgreement)).activeKey);assert.ok((await billing()).some(item=>item._id===String(old.billingAgreement)));
  const log=logs.map(value=>{try{return JSON.parse(value);}catch{return null;}}).find(item=>item?.event==='api_error'&&item.requestId===fresh.result.data.requestId);assert.equal(log?.paymentProvider,'stripe');assert.equal(log?.providerStatus,status);assert.equal(log?.providerCode,status===404?'resource_missing':'api_error');assert.equal(log?.providerRequestId,'req_synthetic_repurchase');
  faults.delete(old.providerOrderId);
 });

 await t.test('a collection racing provider expiration settles the original once instead of creating a replacement',async()=>{
  const slug='settlement-race';await product('course',slug);const original=await checkout('course',slug);assert.equal(original.result.status,200);const old=await M.CheckoutOrder.findById(original.result.data.order._id),before=await M.CheckoutOrder.countDocuments();
  onExpire=session=>{if(session.id===old.providerOrderId)collect(session);};
  try{const fresh=await checkout('course',slug,{autoRenew:false});assert.equal(fresh.result.status,409,JSON.stringify(fresh.result));assert.equal(fresh.result.data.code,'ACTIVE_ACCESS_EXISTS');}finally{onExpire=null;}
  assert.equal(await M.CheckoutOrder.countDocuments(),before);assert.equal((await M.CheckoutOrder.findById(old._id)).status,'paid');assert.equal(await M.Payment.countDocuments({checkoutOrder:old._id}),1);assert.equal((await M.BillingAgreement.findById(old.billingAgreement)).status,'active');
 });

 await t.test('successful purchase leaves another owner, product, kind and payment environment pending histories unchanged',async()=>{
  const slug='boundary-product';await product('course',slug);const rows=[];
  for(const [index,changes]of [{user:users.other._id},{environment:'live'},{product:'different-product'},{kind:'section'}].entries()){
   const order=await M.CheckoutOrder.create({user:users.owner._id,provider:'stripe',environment:'test',kind:'course',product:slug,title:'Unrelated history',currency:'USD',amountMinor:1000,durationMonths:1,autoRenew:true,status:'pending',providerOrderId:'cs_boundary_'+index,expiresAt:new Date(Date.now()+3600000),requestKey:crypto.randomUUID(),requestFingerprint:'boundary',...changes});
   const agreement=await M.BillingAgreement.create({user:order.user,checkoutOrder:order._id,provider:'stripe',environment:order.environment,kind:order.kind,product:order.product,title:order.title,currency:'USD',amountMinor:1000,intervalMonths:1,status:'creating',activeKey:[order.user,order.environment,order.kind,order.product].join(':'),termsAcceptedAt:new Date()});order.billingAgreement=agreement._id;await order.save();rows.push({order:await M.CheckoutOrder.findById(order._id).lean(),agreement:await M.BillingAgreement.findById(agreement._id).lean()});
  }
  const purchase=await checkout('course',slug,{autoRenew:false});assert.equal(purchase.result.status,200,JSON.stringify(purchase.result));const order=await M.CheckoutOrder.findById(purchase.result.data.order._id);collect(sessions.get(order.providerOrderId));assert.equal((await request('/payments/orders/'+order._id+'/confirm',{body:{}})).status,200);
  const visible=await billing();for(const item of rows){assert.deepEqual(await M.CheckoutOrder.findById(item.order._id).lean(),item.order);assert.deepEqual(await M.BillingAgreement.findById(item.agreement._id).lean(),item.agreement);if(String(item.order.user)===String(users.owner._id))assert.ok(visible.some(row=>row._id===String(item.agreement._id)));}
  assert.equal(visible.some(item=>item._id===String(rows[0].agreement._id)),false);assert.ok((await billing('other')).some(item=>item._id===String(rows[0].agreement._id)));
 });
});
