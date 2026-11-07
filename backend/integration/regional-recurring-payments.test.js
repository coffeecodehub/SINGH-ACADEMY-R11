/** Actual HTTP, real Mongo transactions and Stripe SDK/HMAC, synthetic provider
 * transport. Never contacts a real merchant or charges a payment method. */
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';
test('regional quotes, single-use discounts and provider-backed recurring periods',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();Object.assign(process.env,{ONLINE_PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_SyntheticRecurringOnly',STRIPE_WEBHOOK_SECRET:'whsec_SyntheticRecurringOnly'});
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default,{createApp}=await import('../src/app.js'),{getStripe}=await import('../src/services/paymentProviders.js');
 const models={};for(const name of ['User','Course','Section','Coupon','SectionAccess','CheckoutOrder','BillingAgreement','Invoice','Payment','Enrollment','Subscription','GatewayEvent'])models[name]=(await import('../src/models/'+name+'.js')).default;
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});let server;
 const stripe=await getStripe(),originals=[];const replace=(object,key,value)=>{originals.push(()=>object[key]=value);object[key]=value;};
 const sessions=new Map(),subscriptions=new Map(),invoices=new Map(),invoicePayments=new Map(),coupons=[],cancellations=[];
 replace(stripe.checkout.sessions,'create',async(body,options)=>{
  const id='cs_SYNTHETIC_'+body.client_reference_id,subId='sub_SYNTHETIC_'+body.client_reference_id,price=body.line_items[0].price_data,sub=body.mode==='subscription';
  const data={id,url:'https://checkout.stripe.com/c/pay/'+id,mode:body.mode,status:'open',payment_status:'unpaid',livemode:false,client_reference_id:body.client_reference_id,metadata:body.metadata,currency:price.currency,amount_total:price.unit_amount};
  if(sub){data.subscription=subId;subscriptions.set(subId,{id:subId,metadata:body.subscription_data.metadata,livemode:false,status:'active',customer:'cus_SYNTHETIC',cancel_at_period_end:false,items:{data:[{price:{unit_amount:price.unit_amount,currency:price.currency,recurring:price.recurring}}]},latest_invoice:null});}
  sessions.set(id,data);assert.equal(options.idempotencyKey,'sa-create-'+body.client_reference_id);return structuredClone(data);
 });
 replace(stripe.checkout.sessions,'retrieve',async id=>structuredClone(sessions.get(id)));
 replace(stripe.subscriptions,'retrieve',async id=>structuredClone(subscriptions.get(id)));
 replace(stripe.subscriptions,'update',async(id,body,options)=>{assert.equal(body.cancel_at_period_end,true);cancellations.push(id);subscriptions.get(id).cancel_at_period_end=true;return structuredClone(subscriptions.get(id));});
 replace(stripe.invoices,'retrieve',async id=>structuredClone(invoices.get(id)));
 replace(stripe.invoicePayments,'list',async({invoice})=>({data:structuredClone(invoicePayments.get(invoice)||[]),has_more:false}));
 replace(stripe.coupons,'create',async(body,options)=>{coupons.push({body,options});return body;});
 t.after(async()=>{for(const restore of originals)restore();try{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='Synthetic-'+crypto.randomBytes(16).toString('hex'),passwordHash=await bcrypt.hash(password,12),users={};for(const [name,country]of [['pk','PK'],['us','US']])users[name]=await models.User.create({name:'Synthetic '+name,email:name+'@regional-test.invalid',role:'student',country,status:'active',passwordHash});
 await models.Course.create({title:'Regional course',slug:'regional-course',price:10,currency:'USD',published:true,accessType:'one_time',accessMonths:1,pricing:[{label:'Monthly',price:10,durationMonths:1,countryPrices:[{country:'PK',price:5}]}]});
 await models.Section.create({title:'Scoped section',slug:'scoped-section',published:true,price:20,accessMonths:1,pricing:[{label:'Monthly',price:20,durationMonths:1,countryPrices:[{country:'PK',price:7}]}]});
 await models.Course.create([{title:'Inside section',slug:'inside-section',sectionSlug:'scoped-section',price:20,published:true,accessType:'one_time'},{title:'Outside section',slug:'outside-section',sectionSlug:'',price:20,published:true,accessType:'one_time'}]);
 await models.Coupon.create([{code:'HALF-COURSE',kind:'course',productSlug:'regional-course',percentOff:50,expiresAt:new Date(Date.now()+86400000)},{code:'FREE-SECTION',kind:'section',productSlug:'scoped-section',percentOff:100,expiresAt:new Date(Date.now()+86400000)}]);
 server=await new Promise(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+server.address().port,cookies={};
 async function request(path,{who='pk',body,method=body?'POST':'GET',key,headers={}}={}){const raw=body===undefined?undefined:JSON.stringify(body),response=await fetch(origin+'/api'+path,{method,headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':'student',...(cookies[who]?{Cookie:cookies[who]}:{}),...(key?{'Idempotency-Key':key}:{}),...(raw?{'Content-Type':'application/json'}:{}),...headers},...(raw?{body:raw}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.getSetCookie().map(s=>s.split(';')[0]).filter(s=>/^sa_student_v45=[a-f0-9]{64}$/.test(s)).join('; ')};}
 for(const who of ['pk','us']){const login=await request('/auth/login',{who,body:{email:users[who].email,password}});assert.equal(login.status,200);cookies[who]=login.cookie;}
 const base={kind:'course',product:'regional-course',optionKey:'0'};let order,agreement,initialInvoice,cycleInvoice;
 await t.test('country and price are server-owned and country maps never leak',async()=>{
  const pk=await request('/payments/quote',{body:{...base,country:'US',amount:1}}),us=await request('/payments/quote',{who:'us',body:{...base,country:'PK',amount:1}});
  assert.equal(pk.status,200);assert.equal(pk.data.quote.amountMinor,500);assert.equal(us.data.quote.amountMinor,1000);assert.equal(JSON.stringify(pk.data).includes('countryPrices'),false);
 });
 await t.test('full coupon atomically grants only its section with no fake payment',async()=>{
  const body={kind:'section',product:'scoped-section',optionKey:'0',couponCode:'FREE-SECTION',autoRenew:false,termsAccepted:true,provider:'discount'},before=await models.Payment.countDocuments();
  const results=await Promise.all([request('/payments/checkout',{body,key:crypto.randomUUID()}),request('/payments/checkout',{who:'us',body,key:crypto.randomUUID()})]);
  const wins=results.filter(r=>r.status===200);assert.equal(wins.length,1,JSON.stringify(results));assert.ok(results.some(r=>r.status===409));
  const win=wins[0].data.order;assert.equal(win.status,'paid');assert.equal(win.amountMinor,0);assert.equal(win.provider,'discount');assert.equal(await models.Payment.countDocuments(),before);
  const invoice=await models.Invoice.findById((await models.CheckoutOrder.findById(win._id)).invoice);assert.equal(invoice.origin,'coupon');assert.equal(invoice.discountFull,true);
  const grants=await models.SectionAccess.find({invoice:invoice._id});assert.equal(grants.length,1);assert.equal(await models.Subscription.countDocuments(),0);
  const {hasCourseAccess}=await import('../src/services/learningAccess.js'),owner=await models.User.findById(invoice.user);
  assert.equal((await hasCourseAccess(owner._id,'inside-section'))?.type,'section');assert.equal(await hasCourseAccess(owner._id,'outside-section'),null);
 });
 await t.test('refunding an older section invoice preserves only the later independent interval',async()=>{
  await models.Section.create({title:'Interval section',slug:'interval-section',published:true,price:7,accessMonths:1});
  const {fulfillOnlineOrder}=await import('../src/services/onlineCheckout.js'),{recordGatewayRefund}=await import('../src/services/gatewayRefunds.js'),{effectiveSectionAccess}=await import('../src/services/sectionAccess.js');
  const paidAt=new Date(Date.now()-86400000),orders=[];
  for(let n=1;n<=2;n++){
   const order=await models.CheckoutOrder.create({user:users.pk._id,provider:'stripe',environment:'test',providerOrderId:'cs_SYNTHETIC_section_'+n,kind:'section',product:'interval-section',title:'Interval section',amountMinor:700,subtotalMinor:700,currency:'USD',durationMonths:1,status:'pending',expiresAt:new Date(Date.now()+3600000),requestKey:'section-interval-'+n,requestFingerprint:'section-interval-'+n});
   const proof={state:'paid',provider:'stripe',environment:'test',providerOrderId:order.providerOrderId,orderId:String(order._id),amountMinor:700,currency:'USD',paymentId:'pi_SYNTHETIC_section_'+n,paidAt};
   await fulfillOnlineOrder(order._id,proof);orders.push({order:await models.CheckoutOrder.findById(order._id),proof});
  }
  const first=await models.Invoice.findById(orders[0].order.invoice),second=await models.Invoice.findById(orders[1].order.invoice),grant=await models.SectionAccess.findOne({invoice:second._id});
  assert.equal(+second.grantStartsAt,+first.grantExpiresAt);assert.equal(+grant.startsAt,+first.grantExpiresAt);
  await recordGatewayRefund({provider:'stripe',environment:'test',id:'re_SYNTHETIC_oldsection',paymentId:orders[0].proof.paymentId,amountMinor:700,currency:'USD',refundedAt:new Date()});
  assert.equal(await effectiveSectionAccess(users.pk._id,'interval-section',null,{now:new Date(),environment:'test'}),null);
  assert.ok(await effectiveSectionAccess(users.pk._id,'interval-section',null,{now:new Date(+grant.startsAt+1),environment:'test'}));
 });
 await t.test('provider connection state and unsupported recurring intervals are explicit',async()=>{
  const q=await request('/payments/quote',{body:{...base,autoRenew:true}});assert.equal(q.data.quote.availableProviders.paypal,false);assert.equal(q.data.quote.providerUnavailableReasons.paypal,'');
  await models.Course.updateOne({slug:'regional-course'},{$set:{'pricing.0.durationMonths':60}});const long=await request('/payments/quote',{body:{...base,autoRenew:true}});assert.equal(long.data.quote.availableProviders.stripe,false);assert.match(long.data.quote.recurringUnavailableReason,/36/);await models.Course.updateOne({slug:'regional-course'},{$set:{'pricing.0.durationMonths':1}});
 });
 await t.test('recurring checkout persists accepted snapshot and first-term discount',async()=>{
  const body={...base,autoRenew:true,couponCode:'HALF-COURSE',termsAccepted:true,provider:'stripe'},quote=(await request('/payments/quote',{body})).data.quote;
  assert.equal(quote.amountMinor,250);assert.equal(quote.renewalAmountMinor,500);
  const stale=await request('/payments/checkout',{body:{...body,quoteFingerprint:'stale'},key:crypto.randomUUID()});assert.equal(stale.status,409);
  const result=await request('/payments/checkout',{body:{...body,quoteFingerprint:quote.fingerprint},key:crypto.randomUUID()});assert.equal(result.status,200,JSON.stringify(result.data));order=await models.CheckoutOrder.findById(result.data.order._id);agreement=await models.BillingAgreement.findById(order.billingAgreement);
  assert.equal(agreement.country,'PK');assert.equal(agreement.amountMinor,500);assert.equal(coupons.at(-1).body.amount_off,250);assert.equal(coupons.at(-1).body.duration,'once');
  const remote=sessions.get(order.providerOrderId);assert.equal(remote.mode,'subscription');
  const refresh=await request('/payments/quote',{body});assert.equal(refresh.status,200);assert.equal(refresh.data.quote.reservedForExistingCheckout,true);
 });
 function paidInvoice(id,billingReason,start,end,amount,status='paid'){
  const subId=sessions.get(order.providerOrderId).subscription,now=Math.floor(Date.now()/1000),data={id,parent:{subscription_details:{subscription:subId}},livemode:false,currency:'usd',billing_reason:billingReason,status,total:amount,amount_paid:status==='paid'?amount:0,amount_remaining:status==='paid'?0:amount,status_transitions:{paid_at:now},lines:{data:[{period:{start,end},parent:{subscription_item_details:{proration:false}}}],has_more:false}};
  invoices.set(id,data);invoicePayments.set(id,[{invoice:id,amount_paid:amount,currency:'usd',livemode:false,status:'paid',payment:{payment_intent:{id:'pi_'+id,status:'succeeded',amount_received:amount,currency:'usd'}}}]);return data;
 }
 await t.test('first settled subscription invoice grants exact provider period once',async()=>{
  const start=Math.floor(Date.now()/1000),end=start+30*86400;initialInvoice=paidInvoice('in_SYNTHETIC_first','subscription_create',start,end,250);const remote=sessions.get(order.providerOrderId);remote.payment_status='paid';remote.status='complete';subscriptions.get(remote.subscription).latest_invoice=initialInvoice.id;
  const confirm=await request('/payments/orders/'+order._id+'/confirm',{body:{}});assert.equal(confirm.status,200,JSON.stringify(confirm.data));assert.equal(confirm.data.order.status,'paid');
  const invoice=await models.Invoice.findOne({providerInvoiceKey:'stripe:test:'+initialInvoice.id});assert.equal(+invoice.grantStartsAt,start*1000);assert.equal(+invoice.grantExpiresAt,end*1000);assert.equal(invoice.totalMinor,250);assert.ok((await models.Coupon.findOne({code:'HALF-COURSE'})).redeemedAt);
 });
 async function webhook(invoice,eventId){const body={id:eventId,type:'invoice.paid',livemode:false,data:{object:{id:invoice.id}}},signature=stripe.webhooks.generateTestHeaderString({payload:JSON.stringify(body),secret:process.env.STRIPE_WEBHOOK_SECRET});return request('/payments/webhooks/stripe',{body,headers:{'stripe-signature':signature}});}
 await t.test('signed renewal invoices are undiscounted and webhook replay is idempotent',async()=>{
  const start=initialInvoice.lines.data[0].period.end,end=start+30*86400;cycleInvoice=paidInvoice('in_SYNTHETIC_cycle','subscription_cycle',start,end,500);
  assert.equal((await webhook(cycleInvoice,'evt_SYNTHETIC_cycle')).status,200);assert.equal((await webhook(cycleInvoice,'evt_SYNTHETIC_cycle')).status,200);assert.equal((await webhook(cycleInvoice,'evt_SYNTHETIC_cycle_repeat')).status,200);
  const rows=await models.Invoice.find({billingAgreement:agreement._id});assert.equal(rows.length,2);const renewal=rows.find(i=>i.providerInvoiceKey.endsWith(cycleInvoice.id));assert.equal(renewal.totalMinor,500);assert.equal(renewal.discountMinor,0);assert.equal(+renewal.grantStartsAt,start*1000);assert.equal(+renewal.grantExpiresAt,end*1000);assert.equal(await models.Payment.countDocuments({billingAgreement:agreement._id}),2);
 });
 await t.test('unpaid or mismatched renewal never grants access',async()=>{
  const count=await models.Invoice.countDocuments({billingAgreement:agreement._id}),start=cycleInvoice.lines.data[0].period.end;
  const unpaid=paidInvoice('in_SYNTHETIC_unpaid','subscription_cycle',start,start+30*86400,500,'open');assert.equal((await webhook(unpaid,'evt_SYNTHETIC_unpaid')).status,503);assert.equal(await models.GatewayEvent.countDocuments({key:'stripe:test:evt_SYNTHETIC_unpaid'}),0);assert.equal(await models.Invoice.countDocuments({billingAgreement:agreement._id}),count);
  const wrong=paidInvoice('in_SYNTHETIC_wrong','subscription_cycle',start,start+30*86400,1);assert.equal((await webhook(wrong,'evt_SYNTHETIC_wrong')).status,409);assert.equal(await models.Invoice.countDocuments({billingAgreement:agreement._id}),count);
 });
 await t.test('a second active recurring agreement for the same product is refused',async()=>{
  const body={...base,autoRenew:true,termsAccepted:true,provider:'stripe'},quote=(await request('/payments/quote',{body})).data.quote;
  const result=await request('/payments/checkout',{body:{...body,quoteFingerprint:quote.fingerprint},key:crypto.randomUUID()});assert.equal(result.status,409);assert.equal(await models.BillingAgreement.countDocuments({user:users.pk._id}),1);
 });
 await t.test('renewal cancellation is owner-scoped, provider-confirmed, replay-safe and preserves paid access',async()=>{
  const before=await models.Invoice.countDocuments({billingAgreement:agreement._id});assert.equal((await request('/payments/mine/agreements/'+agreement._id+'/cancel',{who:'us',body:{}})).status,404);assert.equal(cancellations.length,0);
  const result=await request('/payments/mine/agreements/'+agreement._id+'/cancel',{body:{}});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.item.autoRenew,false);assert.equal(result.data.item.cancelAtPeriodEnd,true);assert.equal(await models.Invoice.countDocuments({billingAgreement:agreement._id}),before);
  assert.equal((await request('/payments/mine/agreements/'+agreement._id+'/cancel',{body:{}})).status,200);assert.equal((await request('/payments/mine/agreements')).data.items.length,1);
 });
});
