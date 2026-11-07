/** V60.15 adverse regressions. Pure functions + explicit model adapters; these
 * are NOT a claim of a real MongoDB transaction or merchant network test. */
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {load,response} from './testLoader.js';import {harness} from './inMemoryModels.js';import {entitlementHarness} from './entitlementHarness.js';
import * as grants from '../src/utils/courseEntitlements.js';import * as business from '../src/utils/business.js';import * as commerce from '../src/utils/commerce.js';
import {assessmentDefinition,publicAssessment,assessmentToken,assessmentTokenMatches,answerCoverage} from '../src/utils/assessments.js';
import {checkEnvironment} from '../src/utils/deployment.js';import {cookieOptions} from '../src/utils/security.js';
import {signProxyIdentity,verifyProxyIdentity,singleClientIp} from '../src/utils/proxyIdentity.js';
import {equivalentIndex,requiredIndexPlan} from '../src/utils/indexPolicy.js';
const uid='100000000000000000000001',other='100000000000000000000002',aid='200000000000000000000001',bid='200000000000000000000002',eid='300000000000000000000001',pid='400000000000000000000001';
const day=s=>new Date(s+'T12:00:00Z');
const invoice=(id=aid,extra={})=>({_id:id,user:uid,kind:'course',courseSlug:'course',status:'paid',origin:'online_checkout',paidAt:day('2026-01-01'),fulfillmentAt:day('2026-01-01'),totalMinor:10000,paidMinor:10000,creditedMinor:0,testMode:false,durationMonths:1,grantVersion:1,grantStartsAt:day('2026-01-01'),grantExpiresAt:day('2026-02-01'),grantNoExpiry:false,accessStartsAt:day('2026-01-01'),accessExpiresAt:day('2026-02-01'),...extra});
const enrollment=extra=>({_id:eid,user:uid,courseSlug:'course',source:'provider',invoice:aid,status:'active',testMode:false,accessStartsAt:day('2026-01-01'),accessExpiresAt:day('2027-01-01'),...extra});
function fixture(invoices=[invoice()],rows=[enrollment()]){
 const h=harness({User:[{_id:uid,role:'student',status:'active'}],Invoice:invoices,Enrollment:rows,Subscription:[],Course:[{_id:'500000000000000000000001',slug:'course',published:true}],Refund:[],Payment:[],Notification:[],CheckoutOrder:[]});
 const access=entitlementHarness(h);
 const membership=load('../src/services/membershipEnrollments.js',{...business,Course:h.model('Course'),Enrollment:h.model('Enrollment')},'syncMembershipCourseEnrollments');
 const refund=load('../src/services/gatewayRefunds.js',{crypto,...business,...commerce,transaction:h.transaction,audit:h.audit,...Object.fromEntries(['User','Invoice','Payment','Refund','Enrollment','Subscription','Notification','CheckoutOrder'].map(n=>[n,h.model(n)])),syncCheckout:async()=>{},getStripe:()=>{},paypalApi:()=>{}},'recordGatewayRefund');
 return {...h,...access,membership,refund};
}
for(const testMode of [false,true])test(`membership (${testMode?'sandbox':'live'}) never mutates an existing individual grant`,async()=>{
 const f=fixture(),before=structuredClone(f.state.data.Enrollment);
 await f.membership({userId:uid,startsAt:day('2026-01-10'),endsAt:day('2027-01-10'),invoice:bid,testMode});
 assert.deepEqual(f.state.data.Enrollment,before);
 const live=await f.effectiveCourseEnrollment(uid,'course',null,{environment:'live',now:day('2026-02-02')});assert.equal(live,null);
});
test('membership identity rows do not grant course access after subscription ends or is refunded',async()=>{
 const f=fixture([],[]);await f.membership({userId:uid,startsAt:day('2026-01-10'),endsAt:day('2027-01-10'),invoice:bid,testMode:false});
 assert.equal(f.state.data.Enrollment.length,1);assert.equal(f.state.data.Enrollment[0].source,'membership');
 assert.equal(await f.effectiveCourseEnrollment(uid,'course',null,{environment:'live',now:day('2026-02-02')}),null);
});
for(const patch of [{startsAt:null},{endsAt:null},{endsAt:'bad'},{endsAt:day('2025-01-01')}])test('invalid membership dates cannot create a new access record '+JSON.stringify(patch),async()=>{
 const f=fixture([],[]);await assert.rejects(()=>f.membership({userId:uid,startsAt:day('2026-01-01'),endsAt:day('2027-01-01'),...patch}));assert.equal(f.state.data.Enrollment.length,0);
});
test('full membership refund removes that subscription while original course expires at its OWN invoice end',async()=>{
 const f=fixture();f.state.data.Invoice.push(invoice(bid,{kind:'membership',courseSlug:undefined,totalMinor:50000,paidMinor:50000}));
 f.state.data.Payment.push({_id:pid,user:uid,invoice:bid,status:'paid',provider:'stripe',providerRecordKey:'stripe:live:pi_membership',amountMinor:50000,refundedMinor:0,currency:'USD',paidAt:day('2026-01-01'),testMode:false});
 f.state.data.Subscription.push({_id:bid,user:uid,invoice:bid,status:'active',startsAt:day('2026-01-01'),endsAt:day('2027-01-01')});
 await f.refund({provider:'stripe',environment:'live',id:'re_membership',paymentId:'pi_membership',amountMinor:50000,currency:'USD',refundedAt:day('2026-01-20')});
 assert.equal(f.state.data.Subscription[0].status,'cancelled');
 assert.ok(await f.effectiveCourseEnrollment(uid,'course',null,{environment:'live',now:day('2026-01-25')}));
 assert.equal(await f.effectiveCourseEnrollment(uid,'course',null,{environment:'live',now:day('2026-02-02')}),null);
});
for(const which of ['first','renewal'])test(`full refund of ${which} course invoice removes ONLY that contribution`,async()=>{
 const b=invoice(bid,{paidAt:day('2026-01-20'),grantStartsAt:day('2026-02-01'),grantExpiresAt:day('2026-03-01'),accessExpiresAt:day('2026-03-01')});
 const f=fixture([invoice(),b],[enrollment({invoice:bid})]);
 const victim=which==='first'?aid:bid;
 f.state.data.Payment.push({_id:pid,user:uid,invoice:victim,status:'paid',provider:'stripe',providerRecordKey:'stripe:live:pi_course',amountMinor:10000,refundedMinor:0,currency:'USD',paidAt:day('2026-01-01'),testMode:false});
 const proof={provider:'stripe',environment:'live',id:'re_course',paymentId:'pi_course',amountMinor:10000,currency:'USD',refundedAt:day('2026-01-21')};
 await f.refund(proof);await f.refund(proof);assert.equal(f.state.data.Refund.length,1);
 assert.equal(Boolean(await f.effectiveCourseEnrollment(uid,'course',null,{environment:'live',now:day('2026-01-25')})),which!=='first');
 assert.equal(Boolean(await f.effectiveCourseEnrollment(uid,'course',null,{environment:'live',now:day('2026-02-15')})),which!=='renewal');
});
test('partial refund retains the purchased interval and does not grant additional time',()=>{
 const {grants:g}=grants.invoiceCourseGrants([invoice(aid,{creditedMinor:2500})]);assert.equal(g.length,1);assert.equal(+g[0].endsAt,+day('2026-02-01'));
});
for(const patch of [{status:'open'},{status:'void'},{fulfillmentAt:null},{paidMinor:100},{creditedMinor:10000},{creditedMinor:10001},{accessRevokedAt:new Date()},{grantSuppressed:true}])test('unsettled/revoked invoice does NOT authorize '+JSON.stringify(patch),()=>assert.equal(grants.invoiceCourseGrants([invoice(aid,patch)]).grants.length,0));
test('sandbox invoice cannot authorize live, nor alter the real term; review can see the owned test term',async()=>{
 const f=fixture([invoice(),invoice(bid,{testMode:true,grantStartsAt:day('2026-01-01'),grantExpiresAt:day('2027-01-01')})]);
 assert.equal(await f.effectiveCourseEnrollment(uid,'course',null,{environment:'live',now:day('2026-05-01')}),null);
 assert.equal((await f.effectiveCourseEnrollment(uid,'course',null,{environment:'test',now:day('2026-05-01')})).testMode,true);
 assert.equal(await f.effectiveCourseEnrollment(other,'course',null,{environment:'test',now:day('2026-05-01')}),null);
});
test('gap between two paid grants is not turned into free access',()=>{
 const d=grants.invoiceCourseGrants([invoice(),invoice(bid,{grantStartsAt:day('2026-03-01'),grantExpiresAt:day('2026-04-01')})]).grants;
 assert.equal(grants.effectiveGrant(d,day('2026-02-15')),null);assert.ok(grants.effectiveGrant(d,day('2026-03-02')));
});
test('exact end/start boundary is continuous, without counting the expired half-open interval twice',()=>{
 const d=grants.invoiceCourseGrants([invoice(),invoice(bid,{grantStartsAt:day('2026-02-01'),grantExpiresAt:day('2026-03-01')})]).grants;
 assert.equal(grants.effectiveGrant(d,day('2026-01-20')).accessExpiresAt.toISOString(),day('2026-03-01').toISOString());
 assert.equal(grants.grantActive(d[0],day('2026-02-01')),false);assert.equal(grants.grantActive(d[1],day('2026-02-01')),true);
});
test('legacy cumulative renewal derives its separate interval even after the original invoice is refunded',()=>{
 const a=invoice(aid,{grantVersion:0,creditedMinor:10000}),b=invoice(bid,{grantVersion:0,paidAt:day('2026-01-10'),accessExpiresAt:day('2026-03-01')});
 const result=grants.invoiceCourseGrants([b,a]);assert.deepEqual(result.issues,[]);assert.equal(result.grants.length,1);assert.equal(+result.grants[0].startsAt,+day('2026-02-01'));
 assert.equal(grants.effectiveGrant(result.grants,day('2026-01-15')),null);
});
for(const patch of [{accessStartsAt:null},{accessExpiresAt:null,durationMonths:undefined},{durationMonths:1,accessExpiresAt:day('2026-04-11')}])test('ambiguous legacy paid grant is reported, never assigned invented lifetime '+JSON.stringify(patch),()=>{
 const out=grants.invoiceCourseGrants([invoice(aid,{grantVersion:0,...patch})]);assert.equal(out.grants.length,0);assert.equal(out.issues.length,1);
});
for(const source of ['membership','provider','manual_payment'])test('mirrored '+source+' enrollment cannot authorize without source evidence',()=>assert.equal(grants.manualEnrollmentGrants(enrollment({source,invoice:null})).length,0));
test('an explicit complimentary base survives later paid-row replacement, without trusting its mirror dates',()=>{
 const row=enrollment({baseGrant:{source:'complimentary',status:'active',testMode:false,accessStartsAt:day('2026-01-01'),accessExpiresAt:day('2026-01-20')}});
 const g=grants.manualEnrollmentGrants(row);assert.equal(g.length,1);assert.equal(grants.grantActive(g[0],day('2026-01-25')),false);
});
const secret='Test-only-015-Assessment-A-0123456789-NOT-A-REAL-CREDENTIAL';
process.env.AUTH_SECRET=secret;
test('public assessment revision is HMAC, not an offline correct-answer oracle',()=>{
 const lesson={_id:aid,questions:[{prompt:'Choose',kind:'multiple-choice',options:['A','B','C','D'],correctAnswer:'C'}]},def=assessmentDefinition(lesson),view=publicAssessment(def);
 assert.match(view.version,/^a1_[a-f0-9]{64}$/);assert.equal(JSON.stringify(view).includes('correctAnswer'),false);assert.notEqual(view.version,def.version);
 for(const answer of ['A','B','C','D']){const guess=assessmentDefinition({...lesson,questions:[{...lesson.questions[0],correctAnswer:answer}]});assert.notEqual(guess.version,view.version);}
 assert.equal(assessmentTokenMatches(view.version,def),true);assert.equal(assessmentTokenMatches(def.version,def),false);
 assert.equal(assessmentTokenMatches(assessmentToken(def.version,{AUTH_SECRET:secret+'-other'}),def),false);
});
test('changing the instructor answer invalidates public token, while stored internal history stays usable',()=>{
 const lesson={_id:aid,title:'Test',questions:[{prompt:'Choose',kind:'multiple-choice',options:['A','B'],correctAnswer:'A'}]},def=assessmentDefinition(lesson),view=publicAssessment(def);
 const sub={lesson:aid,schemaVersion:def.version,submittedAt:new Date(),fields:[{key:aid+'-0',answer:'0'}]};assert.equal(answerCoverage([lesson],[sub],[aid]).complete,true);
 const changed={...lesson,questions:[{...lesson.questions[0],correctAnswer:'B'}]};assert.equal(assessmentTokenMatches(view.version,assessmentDefinition(changed)),false);assert.equal(answerCoverage([changed],[sub],[aid]).complete,false);
});
const env=()=>({NODE_ENV:'development',DEPLOYMENT_STAGE:'development',AUTH_SECRET:secret,MONGODB_URI:'mongodb://127.0.0.1:27018/sa_test?replicaSet=rs0',FRONTEND_URL:'http://localhost:3000'});
for(const stage of ['review','production'])test('contradictory hosted '+stage+' + development is rejected and still uses Secure cookie/live boundary',()=>{
 const e={...env(),DEPLOYMENT_STAGE:stage};assert.ok(checkEnvironment(e).errors.some(x=>x.includes('NODE_ENV=production')));
 const old={...process.env};Object.assign(process.env,e);try{assert.equal(cookieOptions().secure,true);if(stage==='production')assert.deepEqual(commerce.realAccessFilter(),{testMode:{$ne:true}});}finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}
});
test('production runtime cannot silently choose a development deployment stage',()=>assert.ok(checkEnvironment({...env(),NODE_ENV:'production'}).errors.some(x=>x.includes('DEPLOYMENT_STAGE=development'))));
const context={method:'POST',path:'/api/auth/login',origin:'https://academy.test',portal:'student',key:'request-123',cookie:'sa_student_v45=abc'},ip='203.0.113.11',stamp=1791280000000;
test('trusted network proof validates exactly and is separate from account authentication',()=>{const p=signProxyIdentity(ip,context,secret,stamp);assert.equal(verifyProxyIdentity(p.payload,p.signature,context,secret,stamp),ip);assert.equal(verifyProxyIdentity(p.payload,p.signature,context,secret,stamp+61000),null);});
for(const [field,value] of [['method','GET'],['path','/api/auth/register'],['origin','https://evil.test'],['portal','client_admin'],['cookie','another-session'],['key','another-checkout']])test('network proof cannot be replayed with different '+field,()=>{
 const p=signProxyIdentity(ip,context,secret,stamp);assert.equal(verifyProxyIdentity(p.payload,p.signature,{...context,[field]:value},secret,stamp),null);
});
for(const value of ['203.0.113.1, 203.0.113.2','attacker','https://203.0.113.1','',null])test('ambiguous/non-IP edge value refused '+value,()=>assert.equal(singleClientIp(value),null));
test('tampered proof and weak keys fail closed',()=>{const p=signProxyIdentity(ip,context,secret,stamp);assert.equal(verifyProxyIdentity(p.payload,p.signature.slice(0,-1)+(p.signature.endsWith('0')?'1':'0'),context,secret,stamp),null);assert.equal(verifyProxyIdentity(p.payload,p.signature,context,'password',stamp),null);});
test('rate limiter distinguishes signed network identities but still enforces each individual bucket',async()=>{
 const data=new Map();const rate=load('../src/middleware/rateLimit.js',{resolveSession:async()=>null,privateKey:s=>s,emailValue:s=>s,RateLimit:{findOneAndUpdate:({ _id })=>({lean:async()=>{const count=(data.get(_id)||0)+1;data.set(_id,count);return {count};}})}},'rateLimit');
 const limit=rate('signup',2,3600000);for(const address of ['203.0.113.1','203.0.113.2']){for(let n=0;n<3;n++){let passed=false;const res=response();await limit({ip:'shared-proxy',saClientIp:address,body:{}},res,e=>{if(e)throw e;passed=true;});assert.equal(passed,n<2);if(n===2)assert.equal(res.code,429);}}
});
test('index validation checks ordered keys and unique/partial/TTL options, not a friendly name',()=>{
 const key={provider:1,environment:1,providerOrderId:1},options={unique:true,partialFilterExpression:{providerOrderId:{$type:'string'}}};
 assert.equal(equivalentIndex({name:'different_name',key,...options},key,options),true);
 for(const wrong of [{unique:false},{sparse:true},{partialFilterExpression:{status:'paid'}},{key:{environment:1,provider:1,providerOrderId:1}}])assert.equal(equivalentIndex({key,...options,...wrong},key,options),false);
 assert.equal(equivalentIndex({key:{expiresAt:1},expireAfterSeconds:1},{expiresAt:1},{expireAfterSeconds:0}),false);
 const plan=requiredIndexPlan({collection:{name:'checkoutorders'},schema:{indexes:()=>[[key,options]]}},[{name:'bad',key,unique:false}]);assert.equal(plan[0].status,'missing');assert.deepEqual(plan[0].conflicting,['bad']);
});
