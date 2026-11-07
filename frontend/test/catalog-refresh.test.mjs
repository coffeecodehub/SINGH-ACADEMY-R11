import test from 'node:test';import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';import {hookHarness} from './hooks.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),React=require('react'),{renderToString}=require('react-dom/server');
function fixture({cached,load=async()=>({courses:[]})}={}){
 const h=hookHarness(),b=browserGlobals(),navigator={onLine:true};let reads=0,invalidations=0,scope='student:US:one';
 const mod=compileModule('../lib/usePublicResource.ts',{imports:{react:{...h.React,useSyncExternalStore:(_subscribe,getSnapshot)=>getSnapshot()},'./api':{apiFetch:(...args)=>{reads++;return load(...args);},isAbortError:e=>e?.name==='AbortError',invalidatePublicApi:()=>invalidations++,publicApiSnapshot:()=>cached,publicApiScope:()=>scope,subscribePublicApi:()=>()=>{}}},globals:{...h.globals,...b,navigator}});
 h.mount(()=>mod.usePublicResource('/courses','courses'));return {h,b,navigator,changeAccount(){scope='student:PK:two';cached=null;h.render();},get reads(){return reads;},get invalidations(){return invalidations;}};
}
test('server rendering keeps a deterministic empty snapshot even if another browser has cached data',()=>{
 const mod=compileModule('../lib/usePublicResource.ts',{imports:{react:React,'./api':{apiFetch:async()=>({}),publicApiScope:()=> 'server',subscribePublicApi:()=>()=>{},publicApiSnapshot:()=>({courses:[{title:'Other client cache'}]})}}});
 const html=renderToString(React.createElement(()=>{const state=mod.usePublicResource('/courses','courses');return React.createElement('p',null,state.loading?'loading':state.data[0]?.title);}));assert.equal(html,'<p>loading</p>');
});
test('client navigation reuses prefetched empty or populated content on the first render before the network completes',async()=>{for(const courses of [[],[{slug:'prefetched'}]]){let finish;const f=fixture({cached:{courses},load:()=>new Promise(r=>finish=r)});assert.equal(f.h.tree.loading,false);assert.equal(f.h.tree.loaded,true);assert.equal(f.h.tree.data,courses);await f.h.settle();finish({courses});await f.h.settle();assert.equal(f.h.tree.loading,false);f.h.cleanup();}});
test('transient catalog refresh failure keeps real previous courses visible',async()=>{let calls=0;const f=fixture({load:async()=>{if(++calls===1)return {courses:[{slug:'real'}]};throw Error('network unavailable');}});await f.h.settle();f.h.run(30000);await f.h.settle();assert.equal(f.h.tree.data[0].slug,'real');assert.match(f.h.tree.error,/network/);assert.equal(f.h.tree.loading,false);f.h.cleanup();});
test('catalog background refresh pauses while hidden and offline',async()=>{const f=fixture();await f.h.settle();assert.equal(f.reads,1);f.b.document.visibilityState='hidden';f.h.run(30000);await f.h.settle();assert.equal(f.reads,1);f.b.document.visibilityState='visible';f.navigator.onLine=false;f.h.run(30000);await f.h.settle();assert.equal(f.reads,1);f.navigator.onLine=true;f.b.window.dispatchEvent(new Event('online'));await f.h.settle();assert.equal(f.reads,2);f.h.cleanup();});
test('malformed team/catalog response is an error, not a successful empty library',async()=>{const f=fixture({load:async()=>({success:true})});await f.h.settle();assert.equal(f.h.tree.loaded,false);assert.match(f.h.tree.error,/incomplete/);f.h.cleanup();});
test('manual retry invalidates only catalog reuse then re-reads',async()=>{const f=fixture();await f.h.settle();f.h.tree.retry();await f.h.settle();assert.equal(f.invalidations,1);assert.equal(f.reads,2);f.h.cleanup();});
test('account/country boundary immediately hides the previous owner data while the next read is pending',async()=>{
 let finish,calls=0;const f=fixture({load:()=>++calls===1?Promise.resolve({courses:[{title:'US owner',price:99}]}):new Promise(resolve=>finish=resolve)});await f.h.settle();assert.equal(f.h.tree.data[0].price,99);
 f.changeAccount();assert.equal(f.h.tree.data.length,0);assert.equal(f.h.tree.loading,true);await f.h.settle();finish({courses:[{title:'PK owner',price:20}]});await f.h.settle();assert.equal(f.h.tree.data[0].price,20);f.h.cleanup();
});
