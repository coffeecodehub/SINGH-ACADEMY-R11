/** Tests the TEST-ONLY readiness observer; not a claim of live auth verification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createSignedOutStability,signedOutSnapshotState,readSignedOutSnapshot} from '../ui-tests/helpers/signed-out-snapshot.mjs';
import {compileModule} from './compile.mjs';
const origin='http://127.0.0.1:3108';
const landing=()=>({href:origin+'/',timeOrigin:100,readyState:'complete',totalHeaders:1,headers:[{ready:true,signInLinks:1}],loginForms:[],logoutButtons:0,userChips:0});
const login=()=>({...landing(),href:origin+'/login?next=%2Fteam',headers:[],totalHeaders:0,loginForms:[{emails:1,passwords:1,submitButtons:1}]});
const options={origin};
for(const [name,snapshot,expected] of [['public landing',landing(),'ready:landing'],['login with preserved destination',login(),'ready:login']])test('coherent '+name+' accepted',()=>assert.equal(signedOutSnapshotState(snapshot,options),expected));
for(const [name,patch] of [
 ['wrong host',{href:'http://localhost:3108/'}],
 ['wrong port',{href:'http://127.0.0.1:3109/'}],
 ['protected route',{href:origin+'/team'}],
 ['login-like nested route',{href:origin+'/login/admin'}],
 ['unfinished document',{readyState:'loading'}],
 ['not-yet-complete document',{readyState:'interactive'}],
 ['zero visible headers',{headers:[]}],
 ['two VISIBLE headers',{headers:[{ready:false,signInLinks:1},{ready:true,signInLinks:1}]}],
 ['two hydrated VISIBLE headers',{headers:[{ready:true,signInLinks:1},{ready:true,signInLinks:1}]}],
 ['unhydrated sole header',{headers:[{ready:false,signInLinks:1}]}],
 ['missing sign in',{headers:[{ready:true,signInLinks:0}]}],
 ['duplicate sign in',{headers:[{ready:true,signInLinks:2}]}],
 ['visible logout button',{logoutButtons:1}],
 ['visible old account chip',{userChips:1}],
 ['login form at landing URL',{loginForms:[{emails:1,passwords:1,submitButtons:1}]}],
])test('refuses '+name,()=>assert.match(signedOutSnapshotState({...landing(),...patch},options),/^pending:/));
test('hidden streaming copy does not count as a duplicate rendered header',()=>{const snapshot={...landing(),totalHeaders:2};assert.equal(signedOutSnapshotState(snapshot,options),'ready:landing');});
for(const [name,patch] of [
 ['landing DOM at login URL',{headers:landing().headers}],
 ['missing login form',{loginForms:[]}],
 ['duplicate login forms',{loginForms:[login().loginForms[0],login().loginForms[0]]}],
 ['missing email',{loginForms:[{emails:0,passwords:1,submitButtons:1}]}],
 ['missing password',{loginForms:[{emails:1,passwords:0,submitButtons:1}]}],
 ['disabled submit',{loginForms:[{emails:1,passwords:1,submitButtons:0}]}],
 ['old account on login',{userChips:1}],
])test('refuses '+name,()=>assert.match(signedOutSnapshotState({...login(),...patch},options),/^pending:/));
test('explicit logout still requires / and cannot pass on /login',()=>assert.equal(signedOutSnapshotState(login(),{origin,expectedPath:'/'}),'pending:wrong-guest-destination'));
test('login-only observation cannot pass on a landing page',()=>assert.equal(signedOutSnapshotState(landing(),{origin,expectedPath:'/login'}),'pending:wrong-guest-destination'));
test('two consistent samples required, without expanding the allowed guest destinations',()=>{const read=createSignedOutStability(options);assert.match(read(landing()),/^pending:/);assert.equal(read(landing()),'ready:landing');});
test('redirect after landing sample checks the LOGIN form, not the old header selector',()=>{const read=createSignedOutStability(options);assert.match(read(landing()),/^pending:/);assert.match(read(login(),{navigationEpoch:1}),/^pending:/);assert.equal(read(login(),{navigationEpoch:1}),'ready:login');});
test('changed document identity resets a candidate at the same URL',()=>{const read=createSignedOutStability(options);read(landing());assert.match(read({...landing(),timeOrigin:200}),/^pending:/);assert.equal(read({...landing(),timeOrigin:200}),'ready:landing');});
test('provisional navigation blocks a visually ready old document',()=>{const read=createSignedOutStability(options);read(landing());assert.equal(read(landing(),{pendingDocuments:1}),'pending:document-navigation');assert.match(read(landing()),/^pending:/);assert.equal(read(landing()),'ready:landing');});
test('navigation epoch changes reset stability even with same URL/document',()=>{const read=createSignedOutStability(options);read(landing());assert.match(read(landing(),{navigationEpoch:1}),/^pending:/);assert.equal(read(landing(),{navigationEpoch:1}),'ready:landing');});
test('visible duplicate introduced between samples cannot be hidden by cached readiness',()=>{const read=createSignedOutStability(options);read(landing());assert.match(read({...landing(),headers:[...landing().headers,...landing().headers]}),/visible-header-count=2/);assert.match(read(landing()),/^pending:/);});

// Execute the TypeScript helper with controlled Page/expect adapters. These
// verify event lifetime and races; real browser cases are separately included.
function harness(snapshots){
 const page=new EventEmitter(),frame={},probes=[];let index=0,closed=false;
 page.mainFrame=()=>frame;page.isClosed=()=>closed;page.close=()=>{closed=true;};
 page.evaluate=async fn=>{assert.equal(fn,readSignedOutSnapshot);const item=snapshots[Math.min(index++,snapshots.length-1)];if(item instanceof Error)throw item;return item;};
 const expectation={poll(fn,settings){assert.equal(settings.timeout,5000,'keep the existing assertion deadline');return {async toMatch(pattern){for(let i=0;i<12;i++){const value=await fn();probes.push(value);if(pattern.test(value))return;}throw Error('Guest readiness did not pass');}};}};
 const {waitForSignedOutPage}=compileModule('../ui-tests/helpers/signed-out-page.ts',{imports:{'@playwright/test':{expect:expectation},'./signed-out-snapshot.mjs':{readSignedOutSnapshot,createSignedOutStability}}});
 const run=opts=>waitForSignedOutPage(page,opts);
 return{page,frame,probes,run};
}
const events=['request','requestfinished','requestfailed','framenavigated'];
function listenersClean(f){for(const name of events)assert.equal(f.page.listenerCount(name),0,name+' was leaked');}
test('helper follows the current guest route instead of capturing a one-time branch',async()=>{const f=harness([landing(),login(),login()]);await f.run();assert.equal(f.probes.at(-1),'ready:login');listenersClean(f);});
test('request observers are attached before Back/Refresh begins',async()=>{const f=harness([login(),login()]);await f.run({navigate:async()=>{for(const name of events)assert.equal(f.page.listenerCount(name),1);}});listenersClean(f);});
test('helper monitors unfinished main-document requests until they finish',async()=>{
 const f=harness([landing(),landing(),landing()]),req={isNavigationRequest:()=>true,resourceType:()=> 'document',frame:()=>f.frame};let calls=0;
 const original=f.page.evaluate;
 f.page.evaluate=async fn=>{calls++;if(calls===2)f.page.emit('requestfinished',req);return original(fn);};
 await f.run({navigate:async()=>f.page.emit('request',req)});assert.equal(f.probes[0],'pending:document-navigation');listenersClean(f);
});
test('unrelated API requests cannot block guest observation',async()=>{const f=harness([landing(),landing()]);await f.run({navigate:async()=>f.page.emit('request',{isNavigationRequest:()=>false})});assert.equal(f.probes.length,2);listenersClean(f);});
test('main-frame navigation during evaluation cannot pass on that stale sample',async()=>{const f=harness([landing(),landing(),landing()]),original=f.page.evaluate;let once=true;f.page.evaluate=async fn=>{const s=await original(fn);if(once){once=false;f.page.emit('framenavigated',f.frame);}return s;};await f.run();assert.equal(f.probes[0],'pending:document-navigation');assert.equal(f.probes.at(-1),'ready:landing');listenersClean(f);});
test('real Back/Refresh navigation errors are propagated, never ignored',async()=>{const f=harness([landing()]),error=Error('net::ERR_ABORTED');await assert.rejects(f.run({navigate:async()=>{throw error;}}),error);listenersClean(f);});
test('helper rejects persistent two-visible-header bug instead of first()/nth()',async()=>{const s={...landing(),headers:[...landing().headers,...landing().headers]},f=harness([s]);await assert.rejects(f.run(),/Guest readiness did not pass/);assert.ok(f.probes.every(x=>/visible-header-count=2/.test(x)));listenersClean(f);});
test('unrelated evaluation errors are not masked as navigation',async()=>{const f=harness([Error('Unrelated JavaScript failure')]);await assert.rejects(f.run(),/Unrelated JavaScript failure/);listenersClean(f);});
test('a context being replaced is re-observed; no action or request is replayed',async()=>{const f=harness([new Error('Execution context was destroyed, most likely because of a navigation.'),login(),login()]);let actions=0;await f.run({navigate:async()=>{actions++;}});assert.equal(actions,1);assert.equal(f.probes[0],'pending:document-context-replaced');assert.equal(f.probes.at(-1),'ready:login');listenersClean(f);});
test('page closure is a real error even if context-destroyed text is present',async()=>{const f=harness([new Error('Execution context was destroyed')]);await assert.rejects(f.run({navigate:async()=>f.page.close()}),/Execution context was destroyed/);listenersClean(f);});
