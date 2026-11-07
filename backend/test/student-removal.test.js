import test from 'node:test';
import assert from 'node:assert/strict';
import {load,response} from './testLoader.js';
import {businessError,text} from '../src/utils/business.js';
import {emailValue,emailOk,portalAllowsRole,isSessionUsable,PORTALS} from '../src/utils/security.js';
import UserModel from '../src/models/User.js';

const id='a'.repeat(24),admin='b'.repeat(24),password='SyntheticAdminPassword!';
const request=()=>({user:{_id:admin,role:'client_admin'},body:{currentPassword:password,confirmationEmail:'student@removal.invalid',reason:'Repeated abusive conduct'}});
function fixture({role='student',cancel=async()=>({complete:true,agreementsCancelled:1,checkoutsClosed:2})}={}){
 const calls=[],audits=[],user={_id:id,role,email:'student@removal.invalid',name:'Removal fixture',status:'active',tokenVersion:4,commerceVersion:8,removalState:null,deletedAt:null,resetPasswordToken:'old-private-reset',resetOtpHash:'old-private-otp',async save(){calls.push('save');return this;}};
 const query=value=>({select(){return this;},session:async()=>value});
 let forceFinalConflict=false;
 const api=load('../src/services/studentRemoval.js',{
  User:{findOne:filter=>{calls.push('read');return query(filter.role===user.role?user:null);},findOneAndUpdate:async(filter,update)=>{calls.push('finalize');if(forceFinalConflict||user.removalState!==filter.removalState||user.deletedAt)return null;Object.assign(user,update.$set);return user;}},
  objectId:value=>{if(!/^[a-f0-9]{24}$/.test(value))throw businessError('Invalid student id.',400);return value;},
  transaction:async work=>{calls.push('transaction:start');const value=await work('isolated-session');calls.push('transaction:end');return value;},
  confirmIdentity:async req=>{calls.push('identity');if(req.body.currentPassword!==password)throw businessError('Incorrect password.',403);},
  revokeUserSessions:async()=>{calls.push('revoke');},audit:async(req,event)=>{audits.push(event);},businessError,text,emailValue
 },'({removeStudent})');
 return {user,calls,audits,api,async remove(req=request(),options={}){return api.removeStudent(req,id,{cancel:async(userId,billingOptions)=>{assert.equal(userId,id);assert.equal(billingOptions.actorUserId,admin);calls.push('provider');return cancel(user);},...options});},forceFinalConflict:()=>{forceFinalConflict=true;}};
}

test('removal model preserves identity and distinct pending/final timestamps',async()=>{
 const user=new UserModel({name:'Removal model',email:'model@removal.invalid',passwordHash:'synthetic',role:'student'});
 await user.validate();assert.equal(user.removalState,null);assert.equal(user.deletedAt,null);
 for(const removalState of ['pending','removed']){user.removalState=removalState;await user.validate();}
 user.removalState='active';await assert.rejects(()=>user.validate());
});
test('removal commits denial, reset cleanup and revocation before contacting billing',async()=>{
 const f=fixture({cancel:async user=>{assert.equal(user.status,'blocked');assert.equal(user.removalState,'pending');assert.equal(user.deletedAt,null);assert.equal(user.tokenVersion,5);assert.equal(user.commerceVersion,9);assert.equal(user.resetPasswordToken,null);assert.equal(user.resetOtpHash,null);assert.ok(f.calls.indexOf('revoke')<f.calls.indexOf('provider'));assert.ok(f.calls.indexOf('transaction:end')<f.calls.indexOf('provider'));return{complete:true,agreementsCancelled:1,checkoutsClosed:2};}});
 const result=await f.remove();assert.equal(result.removed,true);assert.equal(f.user.removalState,'removed');assert.ok(f.user.deletedAt instanceof Date);
 assert.deepEqual(f.audits.map(row=>row.action),['student.removal_requested','student.removed']);assert.equal(f.audits[1].changes.billingCancellationConfirmed,true);
 assert.equal(f.user.email,'student@removal.invalid');assert.equal(f.user._id,id);assert.equal(JSON.stringify(f.audits).includes(password),false);
});
test('unknown billing result remains blocked/pending and can finish safely on a later retry',async()=>{
 let attempts=0;const f=fixture({cancel:async()=>{if(++attempts===1)throw Error('PRIVATE_PROVIDER_DETAIL must not leak');return{complete:true};}});
 const first=await f.remove();assert.equal(first.removed,false);assert.equal(first.accessBlocked,true);assert.equal(first.billingCancellationPending,true);assert.equal(f.user.deletedAt,null);assert.equal(f.user.removalState,'pending');
 assert.equal(JSON.stringify(first).includes('PRIVATE_PROVIDER_DETAIL'),false);assert.equal(f.audits.some(row=>row.action==='student.removed'),false);
 const second=await f.remove();assert.equal(second.removed,true);assert.equal(f.user.tokenVersion,5);assert.equal(f.user.commerceVersion,9);assert.equal(attempts,2);
 assert.equal(f.audits.filter(row=>row.action==='student.removal_requested').length,1);assert.equal(f.audits.filter(row=>row.action==='student.removed').length,1);
});
test('only an explicit complete billing result permits the final tombstone',async()=>{
 for(const value of [undefined,null,{}, {complete:false},{complete:'true'}]){
  const f=fixture({cancel:async()=>value}),result=await f.remove();assert.equal(result.removed,false);assert.equal(f.user.removalState,'pending');assert.equal(f.user.deletedAt,null);
 }
});
test('repeating confirmed removal is idempotent and cannot run provider cancellation again',async()=>{
 let count=0;const f=fixture({cancel:async()=>{count++;return{complete:true};}});await f.remove();const at=f.user.deletedAt;
 assert.equal((await f.remove()).removed,true);assert.equal(f.user.deletedAt,at);assert.equal(count,1);assert.equal(f.user.tokenVersion,5);assert.equal(f.audits.filter(row=>row.action==='student.removed').length,1);
});
test('current admin password and exact typed student email are required before removal',async()=>{
 const wrongPassword=fixture(),a=request();a.body.currentPassword='incorrect';await assert.rejects(()=>wrongPassword.remove(a),{status:403});assert.equal(wrongPassword.user.status,'active');assert.equal(wrongPassword.calls.includes('provider'),false);
 const wrongEmail=fixture(),b=request();b.body.confirmationEmail='another@removal.invalid';await assert.rejects(()=>wrongEmail.remove(b),{status:400});assert.equal(wrongEmail.user.status,'active');assert.equal(wrongEmail.calls.includes('provider'),false);
 const noReason=fixture(),c=request();c.body.reason='';await assert.rejects(()=>noReason.remove(c),{status:400});assert.equal(noReason.calls.includes('read'),false);
});
test('student removal never targets an administrator account',async()=>{
 for(const role of ['client_admin','super_admin']){const f=fixture({role});await assert.rejects(()=>f.remove(),{status:404});assert.equal(f.user.status,'active');assert.equal(f.calls.includes('provider'),false);}
});
test('changed finalization state cannot be reported as completed removal',async()=>{
 const f=fixture();f.forceFinalConflict();await assert.rejects(()=>f.remove(),{status:409});assert.equal(f.user.removalState,'pending');assert.equal(f.user.deletedAt,null);
});
for(const portal of PORTALS)for(const marker of [{removalState:'pending'},{removalState:'removed'},{deletedAt:new Date()},{removalRequestedAt:new Date()}])test(portal+' sessions reject '+Object.keys(marker)[0]+' independently of status or token generation',()=>{
 const now=new Date(),user={_id:id,role:portal,status:'active',tokenVersion:7,...marker},session={user:id,portal,tokenVersion:7,lastSeenAt:now,expiresAt:new Date(+now+60000),revokedAt:null};
 assert.equal(isSessionUsable(session,user,portal,now),false);
});
test('session issuance refuses pending removal before creating or clearing any session',async()=>{
 let touched=false;const api=load('../src/services/sessions.js',{AuthSession:{updateOne(){touched=true;},create(){touched=true;}}},'({issueSession})');
 for(const marker of [{removalState:'pending'},{removalState:'removed'},{deletedAt:new Date()}])await assert.rejects(()=>api.issueSession({cookies:{}},{},{_id:id,status:'active',...marker},'student'),{status:401});
 assert.equal(touched,false);
});
test('removal during password comparison cannot issue a session from the earlier login snapshot',async()=>{
 let compared,continueComparison,issued=0;const entered=new Promise(resolve=>{compared=resolve;}),paused=new Promise(resolve=>{continueComparison=resolve;});
 const stored={_id:id,email:'student@removal.invalid',role:'student',status:'active',tokenVersion:4,passwordHash:'synthetic-verified-hash',removalState:null,removalRequestedAt:null,deletedAt:null};
 const {loginFor}=load('../src/controllers/authController.js',{
  User:{findOne:()=>({select:async()=>({...stored})}),findOneAndUpdate:filter=>({select:async()=>{assert.equal(filter.removalState,null);assert.equal(filter.removalRequestedAt,null);assert.equal(filter.deletedAt,null);return stored.removalState?null:{...stored};}})},
  bcrypt:{compare:async()=>{compared();await paused;return true;}},emailValue,emailOk,portalAllowsRole,authSecrets:'+passwordHash +tokenVersion',audit:async()=>{},issueSession:async()=>{issued++;}
 },'({loginFor})');
 const attempt=loginFor('student')({body:{email:stored.email,password:'SyntheticPassword!'}},response());await entered;stored.status='blocked';stored.removalState='pending';stored.tokenVersion=5;continueComparison();
 await assert.rejects(attempt,{status:401});assert.equal(issued,0);
});
