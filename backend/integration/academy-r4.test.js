/** Actual HTTP + generated replica-set DB. No merchant, Zoom, scanner or SMTP calls. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';
function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const char=text[i];if(quoted){if(char==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(char==='"')quoted=false;else cell+=char;}
  else if(char==='"')quoted=true;else if(char===','){row.push(cell);cell='';}else if(char==='\r'&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}else cell+=char;
 }
 if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
test('webinar publication, moderated reviews, safe all-student export and base regional terms',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default,{createApp}=await import('../src/app.js');
 const M={};for(const name of ['User','Review','Course','Section','Event'])M[name]=(await import('../src/models/'+name+'.js')).default;
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});let server;
 t.after(async()=>{mock.restoreAll();try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 assert.ok((await mongoose.connection.db.admin().command({hello:1})).setName);for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='Synthetic-'+crypto.randomBytes(16).toString('hex'),passwordHash=await bcrypt.hash(password,12),users={};
 for(const [key,role,country] of [['student','student','PK'],['other','student','FR'],['client','client_admin','US'],['super','super_admin','US']])users[key]=await M.User.create({name:key+' Fixture',email:key+'@academy-r4.invalid',role,country,status:'active',passwordHash});
 server=await new Promise(resolve=>{const app=createApp().listen(0,'127.0.0.1',()=>resolve(app));});const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function request(path,{who,method='GET',body}={}){
  const response=await fetch(base+'/api'+path,{method,headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':users[who]?.role||'student',...(cookies[who]?{Cookie:cookies[who]}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes.toString());}catch{}
  return {status:response.status,data,bytes,headers:response.headers,cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>/^sa_(student|client_admin|super_admin)_v45=[a-f0-9]{64}$/.test(value)).join('; ')};
 }
 for(const who of Object.keys(users)){const route=who==='client'?'/auth/admin/login':who==='super'?'/auth/super-admin/login':'/auth/login',result=await request(route,{who,method:'POST',body:{email:users[who].email,password}});assert.equal(result.status,200,JSON.stringify(result.data));cookies[who]=result.cookie;}
 await t.test('both admin roles create webinars with HTTPS Zoom joins, while drafts and bad hosts never appear',async()=>{
  for(const [who,slug] of [['client','client-webinar'],['super','super-webinar']]){
   const created=await request('/admin/content/events',{who,method:'POST',body:{title:'Professional '+slug,slug,type:'webinar',date:'2026-12-01T10:00:00Z',description:'Professional discussion followed by live Q&A.',zoomUrl:'https://us02web.zoom.us/j/123?pwd=synthetic',status:'draft'}});assert.equal(created.status,201,JSON.stringify(created.data));
   assert.equal((await request('/content/events',{who:'student'})).data.events.some(event=>event.slug===slug),false);
   assert.equal((await request('/admin/content/events/'+created.data.item._id,{who,method:'PATCH',body:{status:'published'}})).status,200);
   const event=(await request('/content/events',{who:'student'})).data.events.find(event=>event.slug===slug);assert.equal(event.type,'webinar');assert.equal(event.zoomUrl,'https://us02web.zoom.us/j/123?pwd=synthetic');assert.equal(event.description,'Professional discussion followed by live Q&A.');
  }
  for(const zoomUrl of ['javascript:alert(1)','https://zoom.us.evil.invalid/j/123','https://evilzoom.us/j/123'])assert.equal((await request('/admin/content/events',{who:'client',method:'POST',body:{title:'Unsafe webinar',type:'webinar',status:'published',zoomUrl}})).status,400);
  assert.equal((await request('/admin/content/events',{who:'client',method:'POST',body:{title:'Missing link',type:'webinar',status:'published'}})).status,400);
  assert.equal((await request('/admin/content/events',{who:'student',method:'POST',body:{title:'Forbidden event'}})).status,403);
 });
 await t.test('new/edited reviews remain hidden, both admins can moderate, and same-millisecond stale approvals fail',async()=>{
  const fixed=new Date();mock.method(mongoose,'now',()=>fixed);
  try{
   const first=await request('/reviews',{who:'student',method:'POST',body:{rating:5,message:'First submitted review for approval.',status:'approved'}});assert.equal(first.status,201,JSON.stringify(first.data));assert.equal(first.data.review.status,'pending');
   const read=await request('/academy-admin/reviews?status=pending',{who:'client'});assert.equal(read.status,200);const old=read.data.items.find(item=>item._id===first.data.review._id);assert.ok(old);assert.equal(old.revision,1);
   assert.equal((await request('/reviews',{who:'other'})).data.reviews.some(review=>review._id===old._id),false);assert.equal((await request('/content/landing')).data.reviews.some(review=>review._id===old._id),false);
   const second=await request('/reviews',{who:'student',method:'POST',body:{rating:4,message:'Changed submitted review before approval.',approvedBy:users.super._id,approvedAt:new Date(),status:'approved'}});assert.equal(second.status,201);const latest=await M.Review.findById(old._id).lean();assert.equal(+latest.updatedAt,+new Date(old.updatedAt));assert.equal(latest.revision,2);assert.equal(latest.approvedBy,null);assert.equal(latest.approvedAt,null);
   const path='/admin/reviews/'+old._id+'/status';assert.equal((await request(path,{who:'client',method:'PATCH',body:{status:'approved',revision:old.revision,updatedAt:old.updatedAt}})).status,409);
   assert.equal((await request(path,{who:'student',method:'PATCH',body:{status:'approved',revision:latest.revision,updatedAt:latest.updatedAt}})).status,403);
   const approved=await request(path,{who:'client',method:'PATCH',body:{status:'approved',revision:latest.revision,updatedAt:latest.updatedAt}});assert.equal(approved.status,200,JSON.stringify(approved.data));assert.equal(approved.data.item.revision,3);
   assert.equal((await request('/reviews',{who:'other'})).data.reviews.find(review=>review._id===old._id).message,'Changed submitted review before approval.');assert.ok((await request('/content/landing')).data.reviews.some(review=>review._id===old._id));
   const edit=await request('/reviews',{who:'student',method:'POST',body:{rating:3,message:'An edited approved review requires another decision.'}});assert.equal(edit.data.review.status,'pending');
   assert.equal((await request('/reviews',{who:'other'})).data.reviews.some(review=>review._id===old._id),false);assert.equal((await request('/content/landing')).data.reviews.some(review=>review._id===old._id),false);
   const pending=await M.Review.findById(old._id).lean();assert.equal((await request(path,{who:'super',method:'PATCH',body:{status:'rejected',revision:pending.revision,updatedAt:pending.updatedAt}})).status,200);
   assert.equal((await request('/admin/reviews/'+old._id,{who:'client',method:'PATCH',body:{message:'Client cannot rewrite learner text.',revision:4,updatedAt:pending.updatedAt}})).status,403);
   const rejected=await M.Review.findById(old._id).lean(),body={name:'Reviewed learner',rating:4,message:'Administrator reviewed and corrected this submission.',status:'approved',revision:rejected.revision,updatedAt:rejected.updatedAt};
   assert.equal((await request('/admin/reviews/'+old._id,{who:'super',method:'PATCH',body})).status,200);assert.equal((await request('/admin/reviews/'+old._id,{who:'super',method:'PATCH',body})).status,409);
   assert.equal((await request('/reviews',{who:'other'})).data.reviews.find(review=>review._id===old._id).message,body.message);
  }finally{mock.restoreAll();}
 });
 await t.test('legacy reviews with no revision can be approved once using explicit zero and cannot replay that decision',async()=>{
  const at=new Date(),id=new mongoose.Types.ObjectId();await M.Review.collection.insertOne({_id:id,user:users.other._id,name:'Legacy reviewer',rating:5,message:'Legacy review awaiting an actual admin decision.',status:'approved',createdAt:at,updatedAt:at});
  assert.equal((await request('/reviews',{who:'student'})).data.reviews.some(review=>review._id===String(id)),false);assert.equal((await request('/content/landing')).data.reviews.some(review=>review._id===String(id)),false);
  for(const [who,path] of [['client','/academy-admin/reviews?status=pending'],['super','/admin/reviews?status=pending']]){const row=(await request(path,{who})).data.items.find(review=>review._id===String(id));assert.equal(row.status,'pending');assert.equal(row.legacyApprovalRequired,true);}
  const body={status:'approved',revision:0,updatedAt:at};const path='/admin/reviews/'+id+'/status';assert.equal((await request(path,{who:'super',method:'PATCH',body})).status,200);assert.equal((await request(path,{who:'super',method:'PATCH',body})).status,409);
 });
 await t.test('CSV export includes every nonremoved student beyond one page, protects formulas and rejects guests/students',async()=>{
  const leads=Array.from({length:31},(_,index)=>({name:index===0?'=HYPERLINK("https://invalid.example")':index===1?'الطالب, "Example"':'Export learner '+index,email:'export-'+index+'@academy-r4.invalid',phone:index===0?'+92-123-456':undefined,role:'student',country:'IN',status:index===2?'blocked':'active',passwordHash}));await M.User.insertMany(leads);
  await M.User.create({name:'Removed lead',email:'removed@academy-r4.invalid',role:'student',status:'blocked',country:'US',passwordHash,deletedAt:new Date(),removalState:'removed'});
  const path='/admin/students/export.csv';assert.equal((await request(path)).status,401);assert.equal((await request(path,{who:'student'})).status,403);
  for(const who of ['client','super']){
   const exported=await request(path+'?pageSize=1&role=super_admin',{who});assert.equal(exported.status,200);assert.equal(exported.bytes.subarray(0,3).toString('hex'),'efbbbf');assert.match(exported.headers.get('content-type'),/^text\/csv; charset=utf-8/);assert.match(exported.headers.get('content-disposition'),/attachment; filename="singh-academy-students-.*\.csv"/);assert.match(exported.headers.get('cache-control'),/no-store/);
   const text=exported.bytes.toString('utf8').replace(/^\uFEFF/,''),rows=parseCsv(text);assert.equal(rows.length,34);assert.deepEqual(rows[0],['Name','Email','Phone','Country','Registration date (UTC)','Status']);
   assert.ok(rows.some(row=>row[0]==='\'=HYPERLINK("https://invalid.example")'&&row[2]==="'+92-123-456"));assert.ok(rows.some(row=>row[0]==='الطالب, "Example"'));assert.ok(rows.some(row=>row[1]==='export-2@academy-r4.invalid'&&row[5]==='blocked'));
   for(const secret of ['removed@academy-r4.invalid','client@academy-r4.invalid','super@academy-r4.invalid','passwordHash','tokenVersion','resetPasswordToken',passwordHash])assert.equal(text.includes(secret),false,secret);
  }
 });
 await t.test('base and additional regional terms persist via admin API and appear as separate safe student offers',async()=>{
  for(const kind of ['courses','sections']){
   const created=await request('/admin/'+(kind==='courses'?'content/courses':'sections'),{who:'client',method:'POST',body:{title:'Regional '+kind,slug:'base-'+kind,published:true,price:100,accessMonths:3,includeBaseOffer:true,countryPrices:[{country:'US',price:90},{country:'PK',price:30}],pricing:[{key:'nine',label:'Nine months',price:200,durationMonths:9,countryPrices:[{country:'PK',price:80}]}]}});assert.equal(created.status,201,JSON.stringify(created.data));assert.equal(created.data.item.countryPrices.length,2);
   const response=await request('/'+kind+'/base-'+kind,{who:'student'}),item=response.data[kind==='courses'?'course':'section'];assert.deepEqual(item.pricing.map(offer=>[offer.key,offer.price,offer.durationMonths]),[['base',30,3],['nine',80,9]]);assert.equal(JSON.stringify(response.data).includes('countryPrices'),false);
   const fallback=await request('/'+kind+'/base-'+kind,{who:'other'});assert.equal(fallback.data[kind==='courses'?'course':'section'].pricing[0].price,90);
  }
 });
});
