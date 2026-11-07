/** Real local HTTP/Mongo outbox and synthetic mail transport; never remote SMTP. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {isolatedDatabase,testEnvironment} from './isolation.js';
test('webinar publication queues only current paid members and delivers durable professional invitations',{timeout:180000},async t=>{
 const isolated=isolatedDatabase();testEnvironment();
 const mongoose=(await import('mongoose')).default,bcrypt=(await import('bcryptjs')).default,{createApp}=await import('../src/app.js');
 const M={};for(const name of ['User','Event','Invoice','SectionAccess','Subscription','StudentNotification'])M[name]=(await import('../src/models/'+name+'.js')).default;
 const {enqueueWebinarAnnouncements,hasActivePaidLearning}=await import('../src/services/webinarNotifications.js'),{deliverStudentNotifications}=await import('../src/services/studentNotifications.js');
 await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:12000});let server;
 t.after(async()=>{try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();}});
 for(const model of Object.values(mongoose.models))await model.createIndexes();
 const password='Synthetic-'+crypto.randomBytes(16).toString('hex'),passwordHash=await bcrypt.hash(password,12),users={};
 for(const key of ['admin','course','section','both','expired','future','test','free','revoked','blocked','removed','legacy','unpaid'])users[key]=await M.User.create({name:key+' Learner',email:key+'@webinar-r5.invalid',role:key==='admin'?'client_admin':'student',country:'US',status:key==='blocked'||key==='removed'?'blocked':'active',...(key==='removed'?{deletedAt:new Date(),removalState:'removed'}:{}),passwordHash});
 const at=new Date(),start=new Date(+at-86400000),end=new Date(+at+30*86400000),future=new Date(+at+7*86400000);let seq=0;
 async function purchase(who,kind='course',changes={}){
  const row=await M.Invoice.create({number:'R5-'+(++seq),user:users[who]._id,kind,title:'Paid '+kind,courseSlug:kind==='course'?'negotiation':undefined,sectionSlug:kind==='section'?'mediation':undefined,planName:kind==='membership'?'Legacy Academy':undefined,accessStartsAt:start,accessExpiresAt:end,grantVersion:1,grantStartsAt:start,grantExpiresAt:end,totalMinor:1000,paidMinor:1000,currency:'USD',status:'paid',fulfillmentAt:at,paidAt:at,dueAt:at,createdBy:users.admin._id,requestKey:crypto.randomUUID(),requestFingerprint:'synthetic',...changes});
  if(kind==='section')await M.SectionAccess.create({user:users[who]._id,sectionSlug:'mediation',invoice:row._id,startsAt:row.grantStartsAt,endsAt:row.grantExpiresAt,status:'active',testMode:row.testMode});
  if(kind==='membership')await M.Subscription.create({user:users[who]._id,plan:'Legacy Academy',status:'active',startsAt:start,endsAt:end,invoice:row._id,source:'manual_payment'});
  return row;
 }
 for(const who of ['course','both','blocked','removed'])await purchase(who);await purchase('section','section');await purchase('both','section');
 await purchase('expired','course',{grantExpiresAt:new Date(+at-1)});await purchase('future','course',{grantStartsAt:new Date(+at+86400000),grantExpiresAt:end});await purchase('test','course',{testMode:true});await purchase('revoked','course',{accessRevokedAt:at});await purchase('unpaid','course',{status:'open',paidMinor:0});await purchase('legacy','membership');
 const app=createApp();server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});const base='http://127.0.0.1:'+server.address().port;let cookie='';
 async function request(path,body,method='POST'){
  const response=await fetch(base+'/api'+path,{method,headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':'client_admin',...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();return {status:response.status,data,headers:response.headers};
 }
 const login=await request('/auth/admin/login',{email:users.admin.email,password});assert.equal(login.status,200);assert.ok(login.headers.getSetCookie().some(value=>/^sa_client_admin_v45=[a-f0-9]{64}/.test(value)),JSON.stringify({data:login.data,names:login.headers.getSetCookie().map(value=>value.split('=')[0])}));cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>/^sa_client_admin_v45=[a-f0-9]{64}$/.test(value)).join('; ');
 let eventId,revision;
 async function event(){return M.Event.findById(eventId).select('+webinarAnnouncement').lean();}
 async function drainFanout(){for(let i=0;i<10;i++){await enqueueWebinarAnnouncements({batchSize:3,jobs:2});if((await event()).webinarAnnouncement.status==='complete')return;}throw Error('Fanout did not complete');}
 await t.test('drafts do not enqueue; first publication atomically persists an outbox and only paid live eligibility qualifies',async()=>{
  const created=await request('/admin/content/events',{title:'Cross-cultural mediation <practice>',slug:'webinar-r5',type:'webinar',status:'draft',date:future,zoomUrl:'https://us02web.zoom.us/j/123?pwd=synthetic',description:'Professional discussion <script>unsafe</script> and live questions.'});assert.equal(created.status,201,JSON.stringify(created.data));eventId=created.data.item._id;assert.equal((await event()).webinarAnnouncement,undefined);assert.equal((await enqueueWebinarAnnouncements()).queued,0);
  for(const who of ['course','section','both','legacy'])assert.equal(await hasActivePaidLearning(users[who]._id),true,who);for(const who of ['expired','future','test','free','revoked','unpaid'])assert.equal(await hasActivePaidLearning(users[who]._id),false,who);
  assert.equal((await request('/admin/content/events/'+eventId,{status:'published'},'PATCH')).status,200);revision=(await event()).webinarAnnouncement.id;await drainFanout();const notices=await M.StudentNotification.find({type:'webinar_published'}).lean();assert.equal(notices.length,4);assert.deepEqual(notices.map(n=>String(n.user)).sort(),['course','section','both','legacy'].map(who=>String(users[who]._id)).sort());
 });
 await t.test('publication retries, layout edits and unchanged unpublish/republish do not send duplicates',async()=>{
  await request('/admin/content/events/'+eventId,{status:'published'},'PATCH');await request('/admin/content/events/'+eventId,{image:'https://example.invalid/image.jpg'},'PATCH');assert.equal((await event()).webinarAnnouncement.id,revision);await request('/admin/content/events/'+eventId,{status:'draft'},'PATCH');await request('/admin/content/events/'+eventId,{status:'published'},'PATCH');assert.equal((await event()).webinarAnnouncement.id,revision);await drainFanout();assert.equal(await M.StudentNotification.countDocuments(),4);
 });
 await t.test('unexpired fan-out leases are respected, expired leases resume, and concurrent workers dedupe a checkpoint replay',async()=>{
  await M.Event.updateOne({_id:eventId},{$set:{'webinarAnnouncement.status':'sending','webinarAnnouncement.leaseToken':'other-worker','webinarAnnouncement.leaseUntil':new Date(Date.now()+300000),'webinarAnnouncement.lastUserId':null}});
  assert.equal((await enqueueWebinarAnnouncements()).processed,0);
  await M.Event.updateOne({_id:eventId},{$set:{'webinarAnnouncement.leaseUntil':new Date(0)}});
  await Promise.all([enqueueWebinarAnnouncements({batchSize:2,jobs:3}),enqueueWebinarAnnouncements({batchSize:2,jobs:3})]);await drainFanout();assert.equal(await M.StudentNotification.countDocuments(),4);
 });
 await t.test('mail uses account recipients, full escaped agenda, UTC date and deduped retryable SMTP acceptance',async()=>{
  const calls=[];let failOnce=true;
  const sendEmail=async mail=>{calls.push(mail);if(failOnce){failOnce=false;throw Error('Synthetic mail outage');}return {accepted:[mail.to],rejected:[]};};
  const first=await deliverStudentNotifications({sendEmail,limit:20});assert.equal(first.failed,1);assert.equal(first.sent,3);let deferred=await M.StudentNotification.findOne({emailState:'deferred'});assert.ok(deferred);await M.StudentNotification.updateOne({_id:deferred._id},{$set:{nextAttemptAt:new Date(0)}});
  assert.equal((await deliverStudentNotifications({sendEmail,limit:20})).sent,1);assert.equal((await deliverStudentNotifications({sendEmail,limit:20})).claimed,0);
  assert.equal(calls[0].messageId,calls.at(-1).messageId);for(const mail of calls){assert.match(mail.to,/@webinar-r5.invalid$/);assert.match(mail.text,/UTC/);assert.match(mail.text,/Dr. Sukhsimranjit Singh/);assert.match(mail.html,/&lt;script&gt;/);assert.doesNotMatch(mail.html,/<script>/);assert.ok(mail.text.includes('https://us02web.zoom.us/j/123?pwd=synthetic'));}
 });
 await t.test('material details changes get a new revision; queued old revisions never send',async()=>{
  assert.equal((await request('/admin/content/events/'+eventId,{description:'Updated agenda and date guidance.'},'PATCH')).status,200);const newer=(await event()).webinarAnnouncement.id;assert.notEqual(newer,revision);await drainFanout();assert.equal(await M.StudentNotification.countDocuments(),8);
  await M.StudentNotification.updateMany({webinarRevision:revision},{$set:{emailState:'queued',nextAttemptAt:new Date(0)}});const calls=[];const result=await deliverStudentNotifications({sendEmail:async mail=>{calls.push(mail);return {accepted:[mail.to],rejected:[]};},limit:20});assert.equal(result.skipped,4);assert.equal(result.sent,4);assert.ok(calls.every(mail=>mail.subject.startsWith('Updated invitation:')));revision=newer;
 });
 await t.test('removed/expired recipients and unpublished/deleted webinars are rechecked before send',async()=>{
  await M.StudentNotification.updateMany({webinarRevision:revision},{$set:{emailState:'queued',nextAttemptAt:new Date(0)}});await M.User.updateOne({_id:users.course._id},{$set:{status:'blocked',removalState:'pending'}});await M.Invoice.updateMany({user:users.section._id},{$set:{accessRevokedAt:new Date()}});
  let sends=0;const result=await deliverStudentNotifications({sendEmail:async mail=>{sends++;return {accepted:[mail.to],rejected:[]};},limit:20});assert.equal(sends,2);assert.equal(result.skipped,2);
  await M.StudentNotification.updateMany({webinarRevision:revision},{$set:{emailState:'queued',nextAttemptAt:new Date(0)}});await request('/admin/content/events/'+eventId,{status:'draft'},'PATCH');sends=0;assert.equal((await deliverStudentNotifications({sendEmail:async()=>{sends++;},limit:20})).skipped,4);assert.equal(sends,0);
 });
 await t.test('republishing re-arms only unsent eligible invitations skipped during a draft interval',async()=>{
  await request('/admin/content/events/'+eventId,{status:'published'},'PATCH');assert.equal((await event()).webinarAnnouncement.id,revision);await drainFanout();
  const calls=[];const result=await deliverStudentNotifications({sendEmail:async mail=>{calls.push(mail);return {accepted:[mail.to],rejected:[]};},limit:20});assert.equal(result.sent,2);assert.deepEqual(calls.map(mail=>mail.to).sort(),[users.both.email,users.legacy.email].sort());assert.equal((await deliverStudentNotifications({sendEmail:async()=>assert.fail('Duplicate send'),limit:20})).claimed,0);
 });
 await t.test('stale concurrent event writers cannot overwrite the current publication and its outbox',async()=>{
  const {saveEventWithAnnouncement}=await import('../src/services/webinarNotifications.js');const stale=await M.Event.findById(eventId).select('+webinarAnnouncement');
  await saveEventWithAnnouncement({location:'Latest venue details'},stale);
  await assert.rejects(()=>saveEventWithAnnouncement({title:'Stale overwrite'},stale),{status:409});assert.notEqual((await event()).title,'Stale overwrite');
 });
 await t.test('webinar publication requires date, and past webinars are never queued',async()=>{
  assert.equal((await request('/admin/content/events',{title:'No date',type:'webinar',status:'published',zoomUrl:'https://zoom.us/j/123'})).status,400);
  const old=await request('/admin/content/events',{title:'Historical webinar',type:'webinar',status:'published',date:new Date(+at-86400000),zoomUrl:'https://zoom.us/j/123'});assert.equal(old.status,201);assert.equal((await M.Event.findById(old.data.item._id).select('+webinarAnnouncement')).webinarAnnouncement,undefined);
 });
});
