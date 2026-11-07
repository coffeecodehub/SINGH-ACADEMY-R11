/** Owned access and duplicate-purchase checks on an isolated replica-set DB.
 * All purchases here are genuine 100% coupon terms; no provider is contacted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';

test('catalog access, course entry and fresh checkout share owned active grants',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default,{createApp}=await import('../src/app.js');
 const M={};for(const name of ['User','Course','Section','SectionAccess','Invoice','Enrollment','Subscription','CheckoutOrder','Coupon','Payment'])M[name]=(await import('../src/models/'+name+'.js')).default;
 const {grantSectionAccess}=await import('../src/services/sectionAccess.js'),{catalogAccessSnapshot,activePurchaseCoverage}=await import('../src/services/catalogEntitlements.js');
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});let server;
 t.after(async()=>{try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='Synthetic-'+crypto.randomBytes(20).toString('hex'),passwordHash=await bcrypt.hash(password,12),users={},cookies={};
 for(const name of ['owner','other','member'])users[name]=await M.User.create({name:'Synthetic '+name,email:name+'@task6.integration.invalid',role:'student',country:name==='owner'?'PK':'US',status:'active',passwordHash});
 const pricing=[{key:'term',label:'One month',price:40,durationMonths:1,countryPrices:[{country:'PK',price:20}]}];
 await M.Section.create([{title:'Owned section',slug:'owned-section',published:true,price:40,pricing},{title:'Other section',slug:'other-section',published:true,price:40,pricing}]);
 const products=[['direct',''],['included','owned-section'],['outside','other-section'],['expired',''],['future',''],['sandbox',''],['lifetime','']];
 for(const [slug,sectionSlug] of products)await M.Course.create({title:slug,slug,sectionSlug,published:true,accessType:'one_time',price:40,pricing});
 const now=new Date(),at=days=>new Date(+now+days*86400000),start=at(-1),end=at(10);
 async function invoice(user,kind,product,{from=start,to=end,testMode=false,creditedMinor=0}={}){
  return M.Invoice.create({number:'SYNTHETIC-'+crypto.randomUUID(),user:user._id,kind,title:'Synthetic settled access',...(kind==='course'?{courseSlug:product}:kind==='section'?{sectionSlug:product}:{planName:product}),origin:'online_checkout',currency:'USD',totalMinor:2000,paidMinor:2000,creditedMinor,status:'paid',paidAt:from,fulfillmentAt:from,dueAt:from,accessStartsAt:from,accessExpiresAt:to,grantVersion:1,grantStartsAt:from,grantExpiresAt:to,grantNoExpiry:to===null,noScheduledExpiry:to===null,durationMonths:1,createdBy:user._id,requestKey:crypto.randomUUID(),requestFingerprint:'synthetic-owned-term',testMode});
 }
 const direct=await invoice(users.owner,'course','direct'),section=await invoice(users.owner,'section','owned-section');
 await mongoose.connection.transaction(session=>grantSectionAccess({userId:users.owner._id,sectionSlug:'owned-section',startsAt:start,endsAt:end,invoice:section._id,session}));
 await M.Course.create({title:'Added after section purchase',slug:'later-included',sectionSlug:'owned-section',published:true,accessType:'one_time',price:40,pricing});
 await invoice(users.owner,'course','expired',{from:at(-40),to:at(-2)});await invoice(users.owner,'course','future',{from:at(2),to:at(30)});await invoice(users.owner,'course','sandbox',{testMode:true});await invoice(users.owner,'course','lifetime',{to:null});
 const membershipInvoice=await invoice(users.member,'membership','Legacy');
 await M.Subscription.create({user:users.member._id,plan:'Legacy',startsAt:start,endsAt:end,status:'active',invoice:membershipInvoice._id,testMode:false});
 server=await new Promise(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;
 async function request(path,{who='owner',body,key}={}){
  const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Origin:'http://localhost:3000','X-SA-Portal':'student','X-SA-CSRF':'1',...(cookies[who]?{Cookie:cookies[who]}:{}),...(key?{'Idempotency-Key':key}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),headers:response.headers};
 }
 for(const who of Object.keys(users)){const result=await request('/auth/login',{who,body:{email:users[who].email,password}});assert.equal(result.status,200);cookies[who]=result.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>/^sa_student_v45=[a-f0-9]{64}$/.test(value)).join('; ');}
 await t.test('lightweight snapshot is owned, private, price-free and excludes expired or scheduled terms',async()=>{
  const own=await request('/payments/membership-status');assert.equal(own.status,200);assert.match(own.headers.get('cache-control'),/private.*no-store/);
  assert.deepEqual(own.data.courseAccesses.map(row=>row.courseSlug).sort(),['direct','lifetime','sandbox']);assert.deepEqual(own.data.sectionAccesses.map(row=>row.sectionSlug),['owned-section']);
  assert.equal(own.data.courseAccesses.find(row=>row.courseSlug==='lifetime').endsAt,null);
  assert.equal(own.data.membershipActive,false);assert.equal(JSON.stringify(own.data).includes('countryPrices'),false);assert.equal(JSON.stringify(own.data).includes('paidMinor'),false);
  const other=await request('/payments/membership-status',{who:'other'});assert.deepEqual(other.data.courseAccesses,[]);assert.deepEqual(other.data.sectionAccesses,[]);
  assert.equal((await request('/payments/membership-status',{who:'guest'})).status,401);
 });
 await t.test('course entry includes the parent section and all its published children without enrollment writes',async()=>{
  const before=await M.Enrollment.countDocuments();
  for(const slug of ['included','later-included']){const access=await request('/payments/access/'+slug);assert.equal(access.data.hasAccess,true);assert.equal(access.data.accessType,'section');assert.equal((await request('/courses/'+slug+'/learn')).status,200);const enrolled=await request('/courses/'+slug+'/enroll',{body:{}});assert.equal(enrolled.status,200);assert.equal(enrolled.data.created,false);}
  assert.equal(await M.Enrollment.countDocuments(),before);assert.equal((await request('/payments/access/outside')).data.hasAccess,false);assert.equal((await request('/payments/access/included',{who:'other'})).data.hasAccess,false);
  assert.equal((await request('/payments/access/direct')).data.accessType,'course');assert.equal((await request('/payments/access/included',{who:'member'})).data.accessType,'membership');
  const catalog=await request('/payments/catalog?kind=course&product=included');assert.equal(catalog.data.purchase.sectionSlug,'owned-section');assert.equal(catalog.data.purchase.offers[0].amountMinor,2000);
 });
 async function coupon(kind,product){return M.Coupon.create({code:'FREE-'+crypto.randomBytes(8).toString('hex').toUpperCase(),kind,productSlug:product,percentOff:100,expiresAt:at(1),active:true,createdBy:users.owner._id});}
 const counts=async()=>Promise.all([M.CheckoutOrder.countDocuments(),M.Payment.countDocuments(),M.Invoice.countDocuments(),M.SectionAccess.countDocuments(),M.Enrollment.countDocuments()]);
 await t.test('fresh purchases covered directly, by a section, or by membership fail before coupon claims or payment writes',async()=>{
  for(const [who,kind,product] of [['owner','course','direct'],['owner','course','lifetime'],['owner','course','included'],['owner','section','owned-section'],['member','course','outside'],['member','section','other-section']]){
   const discount=await coupon(kind,product),body={kind,product,optionKey:'term',provider:'discount',couponCode:discount.code,autoRenew:false,termsAccepted:true},before=await counts();
   const quote=await request('/payments/quote',{who,body});assert.equal(quote.status,200);assert.equal(quote.data.quote.country,who==='owner'?'PK':'US');
   const result=await request('/payments/checkout',{who,key:crypto.randomUUID(),body});assert.equal(result.status,409,JSON.stringify(result.data));assert.equal(result.data.code,'ACTIVE_ACCESS_EXISTS');assert.deepEqual(await counts(),before);
   const stored=await M.Coupon.findById(discount._id).lean();assert.equal(stored.claimedOrder,null);assert.equal(stored.redeemedAt,null);
  }
 });
 await t.test('expiry uses an exact half-open boundary and independent refund evidence stays intact',async()=>{
  assert.ok(await activePurchaseCoverage(users.owner._id,'course','direct',{now:new Date(+end-1),environment:'live'}));assert.equal(await activePurchaseCoverage(users.owner._id,'course','direct',{now:end,environment:'live'}),null);
  const expired=await catalogAccessSnapshot(users.owner._id,{now:end});assert.equal(expired.courseAccesses.some(row=>row.courseSlug==='direct'),false);assert.equal(expired.sectionAccesses.length,0);
  assert.equal((await activePurchaseCoverage(users.owner._id,'course','lifetime',{now:at(36500),environment:'live'}))?.access.accessExpiresAt,null);assert.equal(await activePurchaseCoverage(users.other._id,'course','lifetime',{now:at(36500),environment:'live'}),null);
  await M.Invoice.updateOne({_id:direct._id},{$set:{creditedMinor:1000}});assert.equal((await request('/payments/access/direct')).data.hasAccess,true);
  await M.Invoice.updateOne({_id:direct._id},{$set:{creditedMinor:2000}});assert.equal((await request('/payments/access/direct')).data.hasAccess,false);assert.equal((await request('/payments/access/included')).data.hasAccess,true);
  await M.Invoice.updateOne({_id:section._id},{$set:{creditedMinor:2000}});assert.equal((await request('/payments/access/included')).data.hasAccess,false);
 });
 await t.test('live policy excludes sandbox evidence and grants never mix payment environments',async()=>{
  assert.equal(await activePurchaseCoverage(users.owner._id,'course','sandbox',{environment:'live'}),null);assert.ok(await activePurchaseCoverage(users.owner._id,'course','sandbox',{environment:'test'}));
  const stage=process.env.DEPLOYMENT_STAGE;process.env.DEPLOYMENT_STAGE='production';try{const snapshot=await catalogAccessSnapshot(users.owner._id);assert.equal(snapshot.courseAccesses.some(row=>row.courseSlug==='sandbox'),false);assert.equal(await activePurchaseCoverage(users.owner._id,'course','sandbox',{environment:'test'}),null);}finally{process.env.DEPLOYMENT_STAGE=stage;}
 });
 await t.test('expired access can be purchased again while replay returns the same settled order and historical grants stay unchanged',async()=>{
  const old=await M.Invoice.findOne({user:users.owner._id,courseSlug:'expired'}).lean(),discount=await coupon('course','expired'),key=crypto.randomUUID(),body={kind:'course',product:'expired',optionKey:'term',provider:'discount',couponCode:discount.code,autoRenew:false,termsAccepted:true};
  const created=await request('/payments/checkout',{key,body});assert.equal(created.status,200,JSON.stringify(created.data));assert.equal(created.data.order.status,'paid');const before=await counts();
  const replay=await request('/payments/checkout',{key,body});assert.equal(replay.status,200);assert.equal(replay.data.order._id,created.data.order._id);assert.deepEqual(await counts(),before);assert.deepEqual(await M.Invoice.findById(old._id).lean(),old);
  const fresh=await request('/payments/checkout',{key:crypto.randomUUID(),body:{...body,couponCode:(await coupon('course','expired')).code}});assert.equal(fresh.status,409);assert.equal(fresh.data.code,'ACTIVE_ACCESS_EXISTS');
 });
});
