/** Real isolated MongoDB transactions + HTTP. No payment/scanner/mail provider is contacted. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';
test('country-authoritative catalog, scoped sections, single-use coupons and atomic course seeds',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default;
 const {createApp}=await import('../src/app.js');
 const M={};for(const name of ['User','Course','Section','SectionAccess','Coupon','Invoice','Subscription','Module','Lesson','SiteContent'])M[name]=(await import('../src/models/'+name+'.js')).default;
 const {quoteProduct,claimCoupon,consumeCoupon,releaseCoupon}=await import('../src/services/coupons.js');
 const {grantSectionAccess,effectiveSectionAccess}=await import('../src/services/sectionAccess.js');
 const {hasCourseAccess}=await import('../src/services/learningAccess.js');
 const {seedCourseData}=await import('../src/services/courseSeeding.js');
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});let server;
 t.after(async()=>{mock.restoreAll();try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 assert.ok((await mongoose.connection.db.admin().command({hello:1})).setName);
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='Synthetic-'+crypto.randomBytes(20).toString('hex'),passwordHash=await bcrypt.hash(password,12),users={};
 for(const [key,role,country] of [['pk','student','PK'],['us','student','US'],['fr','student','FR'],['admin','client_admin','US'],['builder','super_admin','US']])users[key]=await M.User.create({name:key+' Fixture',email:key+'@regional.integration.invalid',role,country,status:'active',passwordHash});
 const pricing=[{key:'six',label:'Six months',price:120,durationMonths:6,countryPrices:[{country:'PK',price:30},{country:'US',price:90}]}];
 const [sectionA,sectionB]=await M.Section.create([{title:'Section A',slug:'section-a',published:true,price:120,pricing},{title:'Section B',slug:'section-b',published:true,price:100}]);
 const [a,b,standalone]=await M.Course.create([{title:'A course',slug:'course-a',sectionSlug:sectionA.slug,published:true,price:120,pricing},{title:'B course',slug:'course-b',sectionSlug:sectionB.slug,published:true,price:100},{title:'Standalone',slug:'standalone',published:true,price:100}]);
 await M.SiteContent.create({key:'membershipPlans',value:[{key:'configured',name:'Configured global plan',price:79,durationMonths:6,countryPrices:[{country:'PK',price:31},{country:'US',price:72}],active:true}]});
 server=await new Promise(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function request(path,{who,method='GET',body}={}){
  const role=users[who]?.role||'student',multipart=body instanceof FormData;
  const res=await fetch(base+'/api'+path,{method,headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':role,...(cookies[who]?{Cookie:cookies[who]}:{}),...(body&&!multipart?{'Content-Type':'application/json'}:{})},...(body?{body:multipart?body:JSON.stringify(body)}:{})});
  const bytes=Buffer.from(await res.arrayBuffer());let data;try{data=JSON.parse(bytes.toString());}catch{}
  return {status:res.status,data,bytes,cookie:res.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>/^sa_(student|client_admin|super_admin)_v45=[a-f0-9]{64}$/.test(value)).join('; ')};
 }
 for(const who of Object.keys(users)){const path=who==='admin'?'/auth/admin/login':who==='builder'?'/auth/super-admin/login':'/auth/login',result=await request(path,{who,method:'POST',body:{email:users[who].email,password}});assert.equal(result.status,200,JSON.stringify(result.data));cookies[who]=result.cookie;assert.ok(cookies[who]);}
 await t.test('the same raw cache returns country-specific prices without leaking maps or changing public metadata',async()=>{
  for(const [who,price] of [['pk',30],['us',90],['fr',90],['pk',30]]){
   const result=await request('/courses',{who});assert.equal(result.status,200);const course=result.data.courses.find(row=>row.slug===a.slug);assert.equal(course.pricing[0].price,price);assert.equal(course.price,price);assert.equal(JSON.stringify(result.data).includes('countryPrices'),false);
   const section=await request('/sections/'+sectionA.slug,{who});assert.equal(section.data.section.pricing[0].price,price);assert.equal(JSON.stringify(section.data).includes('countryPrices'),false);
  }
  const publicSection=await request('/sections/'+sectionA.slug);assert.equal(publicSection.data.section.price,undefined);assert.equal(publicSection.data.section.pricing,undefined);
  const landing=await request('/content/landing');assert.equal(landing.data.courses.find(row=>row.slug===a.slug).price,undefined);assert.equal(landing.data.sections.find(row=>row.slug===sectionA.slug).title,sectionA.title);assert.equal(landing.data.sections[0].price,undefined);assert.equal(landing.data.sections[0].pricing,undefined);assert.equal(JSON.stringify(landing.data).includes('countryPrices'),false);
  const site=await request('/content/site');assert.equal(site.data.content.membershipPlans[0].name,'Configured global plan');assert.equal(site.data.content.membershipPlans[0].price,undefined);assert.equal(JSON.stringify(site.data).includes('countryPrices'),false);
  assert.equal((await quoteProduct({user:users.pk,kind:'membership',product:'configured'})).quote.amountMinor,3100);
  assert.equal((await quoteProduct({user:users.us,kind:'membership',product:'configured'})).quote.amountMinor,7200);
  assert.equal((await quoteProduct({user:users.fr,kind:'membership',product:'configured',country:'PK'})).quote.amountMinor,7200);
 });
 await t.test('published landing sections refresh after admin writes and exclude draft or archived sections',async()=>{
  const created=await request('/admin/sections',{who:'admin',method:'POST',body:{title:'Landing draft',slug:'landing-draft',price:89,published:false}});assert.equal(created.status,201,JSON.stringify(created.data));const id=created.data.item._id;
  assert.equal((await request('/content/landing')).data.sections.some(row=>row.slug==='landing-draft'),false);
  const published=await request('/admin/sections/'+id,{who:'admin',method:'PUT',body:{published:true,description:'Published landing summary'}});assert.equal(published.status,200);
  const summary=(await request('/content/landing')).data.sections.find(row=>row.slug==='landing-draft');assert.equal(summary.description,'Published landing summary');assert.equal(summary.price,undefined);assert.equal(summary.pricing,undefined);
  assert.equal((await request('/admin/sections/'+id,{who:'admin',method:'DELETE'})).status,200);
  assert.equal((await request('/content/landing')).data.sections.some(row=>row.slug==='landing-draft'),false);
 });
 await t.test('section covers preserve original HD bytes and are public only when referenced by a published section',async()=>{
  const sharp=(await import('sharp')).default,png=await sharp({create:{width:2400,height:1300,channels:3,background:'#c9d6e2'}}).png().toBuffer(),form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'original-hd-cover.png');
  const upload=await request('/admin/sections/upload',{who:'admin',method:'POST',body:form});assert.equal(upload.status,201,JSON.stringify(upload.data));assert.equal(upload.data.originalPixelsPreserved,true);assert.equal(upload.data.width,2400);assert.equal(upload.data.height,1300);
  assert.equal((await request('/media/'+upload.data.fileId)).status,401);
  assert.equal((await request('/admin/sections/'+sectionA._id,{who:'admin',method:'PUT',body:{thumbnailFileId:upload.data.fileId,thumbnail:upload.data.url}})).status,200);
  const saved=await request('/media/'+upload.data.fileId);assert.equal(saved.status,200);assert.deepEqual(saved.bytes,png);
 });
 await t.test('both admin roles manage sections/coupons; students cannot and section slugs stay locked',async()=>{
  for(const who of ['admin','builder']){assert.equal((await request('/admin/sections',{who})).status,200);assert.equal((await request('/admin/coupons',{who})).status,200);}
  for(const path of ['/admin/sections','/admin/coupons'])assert.equal((await request(path,{who:'pk'})).status,403);
  assert.equal((await request('/admin/sections/'+sectionA._id,{who:'admin',method:'PUT',body:{slug:'break-owned-grant'}})).status,409);
  assert.equal((await request('/admin/content/courses/'+a._id,{who:'admin',method:'PATCH',body:{sectionSlug:'missing-section'}})).status,400);
 });
 let coupon;
 await t.test('quote trusts stored country/product totals and ignores browser amounts, dates and country',async()=>{
  const created=await request('/admin/coupons',{who:'admin',method:'POST',body:{code:'REGIONAL-25',kind:'course',productSlug:a.slug,percentOff:25,expiresAt:new Date(Date.now()+86400000)}});assert.equal(created.status,201,JSON.stringify(created.data));coupon=created.data.item;
  const result=await quoteProduct({user:users.pk,kind:'course',product:a.slug,optionKey:'six',couponCode:coupon.code,amountMinor:1,country:'US',durationMonths:120});assert.equal(result.quote.subtotalMinor,3000);assert.equal(result.quote.amountMinor,2250);assert.equal(result.quote.durationMonths,6);assert.equal(result.quote.country,'PK');
  const http=await request('/payments/quote',{who:'pk',method:'POST',body:{kind:'course',product:a.slug,optionKey:'six',couponCode:coupon.code,amountMinor:1,country:'US'}});assert.equal(http.status,200,JSON.stringify(http.data));assert.equal(http.data.quote.amountMinor,2250);
  await assert.rejects(()=>quoteProduct({user:users.pk,kind:'section',product:sectionA.slug,couponCode:coupon.code}),{status:409});
 });
 await t.test('two concurrent real transactions cannot reserve or consume the same coupon for different orders',async()=>{
  const orderIds=[new mongoose.Types.ObjectId(),new mongoose.Types.ObjectId()];
  const claims=await Promise.allSettled(orderIds.map((orderId,index)=>mongoose.connection.transaction(session=>claimCoupon({couponId:coupon._id,orderId,userId:index?users.us._id:users.pk._id,session}))));
  assert.equal(claims.filter(row=>row.status==='fulfilled').length,1);assert.equal(claims.filter(row=>row.status==='rejected').length,1);
  const winner=claims.findIndex(row=>row.status==='fulfilled'),orderId=orderIds[winner],loser=orderIds[1-winner],user=winner?users.us:users.pk;
  const own=await quoteProduct({user,kind:'course',product:a.slug,optionKey:'six',couponCode:coupon.code});assert.equal(own.quote.reservedForExistingCheckout,true);
  await assert.rejects(()=>mongoose.connection.transaction(session=>claimCoupon({couponId:coupon._id,orderId:loser,userId:user._id,session})),{status:409});
  await mongoose.connection.transaction(session=>consumeCoupon({couponId:coupon._id,orderId,session}));
  const before=await M.Coupon.findById(coupon._id).lean();await mongoose.connection.transaction(session=>consumeCoupon({couponId:coupon._id,orderId,session}));
  assert.equal(+(await M.Coupon.findById(coupon._id)).redeemedAt,+before.redeemedAt);
  assert.equal(await mongoose.connection.transaction(session=>releaseCoupon({couponId:coupon._id,orderId,session})),null);
  await assert.rejects(()=>quoteProduct({user,kind:'course',product:a.slug,couponCode:coupon.code}),{status:409});
 });
 await t.test('only the owning safely closed order can release an unconsumed reservation',async()=>{
  const row=await M.Coupon.create({code:'RELEASE-25',kind:'course',productSlug:a.slug,percentOff:25,expiresAt:new Date(Date.now()+86400000)}),orderId=new mongoose.Types.ObjectId();
  await mongoose.connection.transaction(session=>claimCoupon({couponId:row._id,orderId,userId:users.pk._id,session}));
  assert.equal(await mongoose.connection.transaction(session=>releaseCoupon({couponId:row._id,orderId:new mongoose.Types.ObjectId(),session})),null);
  await mongoose.connection.transaction(session=>releaseCoupon({couponId:row._id,orderId,session}));assert.equal((await M.Coupon.findById(row._id)).claimedOrder,null);
  assert.equal((await quoteProduct({user:users.us,kind:'course',product:a.slug,optionKey:'six',couponCode:row.code})).quote.amountMinor,6750);
 });
 const start=new Date(Date.now()-86400000),end=new Date(Date.now()+60*86400000);let sectionInvoice,lessonMediaId;
 async function paidInvoice(user,kind,product,start,end,testMode=false){
  return M.Invoice.create({number:'SYNTHETIC-'+crypto.randomUUID(),user:user._id,kind,title:'Synthetic paid term',...(kind==='section'?{sectionSlug:product}:{courseSlug:product}),origin:'online_checkout',currency:'USD',totalMinor:3000,paidMinor:3000,status:'paid',paidAt:start,fulfillmentAt:start,dueAt:start,accessStartsAt:start,accessExpiresAt:end,grantVersion:1,grantStartsAt:start,grantExpiresAt:end,durationMonths:2,createdBy:users.admin._id,requestKey:crypto.randomUUID(),requestFingerprint:'synthetic-no-provider',testMode});
 }
 await t.test('owned section purchase grants only that section, includes later courses and observes exact time/environment boundaries',async()=>{
  sectionInvoice=await paidInvoice(users.pk,'section',sectionA.slug,start,end);
  for(let n=0;n<2;n++)await mongoose.connection.transaction(session=>grantSectionAccess({userId:users.pk._id,sectionSlug:sectionA.slug,startsAt:start,endsAt:end,invoice:sectionInvoice._id,testMode:false,session}));
  assert.equal(await M.SectionAccess.countDocuments({user:users.pk._id}),1);
  assert.equal((await hasCourseAccess(users.pk._id,a.slug)).type,'section');assert.equal(await hasCourseAccess(users.pk._id,b.slug),null);assert.equal(await hasCourseAccess(users.us._id,a.slug),null);
  assert.equal(await effectiveSectionAccess(users.pk._id,sectionA.slug,null,{now:end}),null);
  assert.equal(await effectiveSectionAccess(users.pk._id,sectionA.slug,null,{now:new Date(+start-1)}),null);
  assert.equal(await effectiveSectionAccess(users.pk._id,sectionA.slug,null,{environment:'test'}),null);
  const bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'academyMedia'}),stream=bucket.openUploadStream('synthetic-section-video.mp4',{contentType:'video/mp4',metadata:{purpose:'cms'}});lessonMediaId=String(stream.id);
  await new Promise((resolve,reject)=>{stream.once('finish',resolve);stream.once('error',reject);stream.end(Buffer.from('Synthetic private course-media fixture'));});
  const module=await M.Module.create({title:'Section module',course:a._id});await M.Lesson.create({title:'Section video',module:module._id,published:true,videoFileId:lessonMediaId});
  assert.equal((await request('/media/'+lessonMediaId,{who:'pk'})).status,200);assert.equal((await request('/media/'+lessonMediaId,{who:'us'})).status,403);assert.equal((await request('/media/'+lessonMediaId)).status,401);
  let mine=await request('/courses/enrolled/mine',{who:'pk'});assert.deepEqual(mine.data.courses.map(row=>row.slug),[a.slug]);assert.equal(mine.data.courses[0].sectionAccess,true);
  await M.Course.create({title:'Later section A course',slug:'later-a',sectionSlug:sectionA.slug,published:true,price:50});
  mine=await request('/courses/enrolled/mine',{who:'pk'});assert.deepEqual(mine.data.courses.map(row=>row.slug).sort(),[a.slug,'later-a'].sort());
 });
 await t.test('full refund immediately revokes section access while individual and global membership grants remain independent',async()=>{
  await paidInvoice(users.pk,'course',standalone.slug,start,end);
  assert.equal((await hasCourseAccess(users.pk._id,standalone.slug)).type,'course');
  await M.Invoice.updateOne({_id:sectionInvoice._id},{$set:{creditedMinor:3000}});
  assert.equal(await hasCourseAccess(users.pk._id,a.slug),null);assert.equal((await hasCourseAccess(users.pk._id,standalone.slug)).type,'course');
  assert.equal((await request('/media/'+lessonMediaId,{who:'pk'})).status,403);
  await M.Subscription.create({user:users.us._id,plan:'Configured global plan',startsAt:start,endsAt:end,status:'active'});
  assert.equal((await hasCourseAccess(users.us._id,a.slug)).type,'membership');assert.equal((await hasCourseAccess(users.us._id,b.slug)).type,'membership');
 });
 await t.test('course seeds commit all authored lessons, preserve edits and explicitly repair missing legacy rows',async()=>{
  const results=await seedCourseData();assert.equal(results.reduce((sum,row)=>sum+row.lessonsCreated,0),82);
  const existing=await M.Course.findOne({slug:'public-speaking'}),modules=await M.Module.find({course:existing._id}),lesson=await M.Lesson.findOne({module:{$in:modules.map(row=>row._id)}});
  await M.Lesson.updateOne({_id:lesson._id},{$set:{textNotes:'Preserve this administrator edit'}});
  const removed=await M.Lesson.findOne({_id:{$ne:lesson._id},module:{$in:modules.map(row=>row._id)}});await removed.deleteOne();
  assert.equal((await seedCourseData()).every(row=>row.preserved),true);
  const repaired=await seedCourseData({repairMissing:true});assert.equal(repaired.reduce((sum,row)=>sum+row.lessonsCreated,0),1);assert.equal((await M.Lesson.findById(lesson._id)).textNotes,'Preserve this administrator edit');
 });
 await t.test('failure after an actual lesson insert rolls back its entire seed course',async()=>{
  const original=M.Lesson.create;let inserts=0;
  mock.method(M.Lesson,'create',async function(...args){if(++inserts===2)throw new Error('Synthetic lesson persistence failure');return original.apply(this,args);});
  try{await assert.rejects(()=>seedCourseData({seeds:[{title:'Atomic rollback',slug:'atomic-seed',modules:[['Module',[['One','video'],['Two','video']]]]}]}),/Synthetic lesson persistence failure/);}finally{mock.restoreAll();}
  assert.equal(await M.Course.countDocuments({slug:'atomic-seed'}),0);assert.equal(await M.Lesson.countDocuments({title:'One'}),0);
 });
});
