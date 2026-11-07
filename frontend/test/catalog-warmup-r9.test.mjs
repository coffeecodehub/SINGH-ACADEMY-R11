import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';

function fixture({pathname='/home',user={id:'student'},portal='student',allowed=true,load=async path=>({path})}={}){
 const h=hookHarness(),b=browserGlobals(),reads=[],pictures=[];let epoch=0;
 class Element{constructor(path){this.path=path;}closest(){return{getAttribute:()=>this.path};}}
 const component=compileModule('../components/CatalogWarmup.tsx',{imports:{react:h.React,'next/navigation':{usePathname:()=>pathname},'./auth/AuthProvider':{useAuth:()=>({user,ready:true,portal})},'./WebsiteContent':{useWebsiteContent:()=>({images:[]})},'../lib/pageSections':compileModule('../lib/pageSections.ts'),'../lib/api':{accountEpoch:()=>epoch,apiFetch:async(path,options)=>{reads.push({path,options});return load(path);}},'../lib/imageWarmup':{canWarmCatalogImages:()=>allowed,warmCatalogImages:(...args)=>pictures.push(args)}},globals:{...b,...h.globals,Element}});
 h.mount(()=>component.default());
 return {h,b,reads,pictures,revoke(){epoch++;},intent(path){const event=new Event('pointerover');Object.defineProperty(event,'target',{value:new Element(path)});b.document.dispatchEvent(event);}};
}
test('foreground catalog warmup includes Academy Plans sections and Events and deduplicates intent',async()=>{
 const f=fixture();f.h.run(800);await f.h.settle();
 assert.deepEqual(f.reads.map(x=>x.path).sort(),['/content/events','/content/team','/courses','/page-sections/home','/sections']);
 f.intent('/academy');f.intent('/events');await f.h.settle();assert.equal(f.reads.length,7);assert.equal(f.pictures.length,7);f.h.cleanup();
});
test('Academy Plans and Events navigation intent prefetch before the scheduled background warmup',async()=>{
 const f=fixture();f.intent('/academy');f.intent('/events');await f.h.settle();
 assert.deepEqual(f.reads.map(x=>x.path),['/sections','/courses','/page-sections/academy','/content/events','/page-sections/events']);f.h.cleanup();
});
test('speculative data and photos stay off private staff/payment routes and data-saving contexts',()=>{
 for(const options of [{pathname:'/billing'},{pathname:'/checkout/course'},{portal:'super_admin'},{allowed:false}]){
  const f=fixture(options);f.h.run(800);f.intent('/academy');assert.equal(f.reads.length,0);f.h.cleanup();
 }
});
test('guest landing and video-review intent prepare public content without reading protected full catalogs',async()=>{
 const f=fixture({pathname:'/',user:null});f.h.run(800);f.intent('/video-reviews');await f.h.settle();
 assert.equal(f.reads.some(({path})=>path==='/courses'||path==='/sections'),false);
 for(const path of ['/content/landing','/content/team','/content/events','/video-reviews','/page-sections/landing'])assert.ok(f.reads.some(read=>read.path===path));f.h.cleanup();
});
test('account revocation or unmount while data is in flight cannot launch photo requests',async()=>{
 let finish;const f=fixture({load:()=>new Promise(resolve=>finish=resolve)});f.intent('/events');f.revoke();finish({events:[]});await f.h.settle();assert.equal(f.pictures.length,0);f.h.cleanup();
});
