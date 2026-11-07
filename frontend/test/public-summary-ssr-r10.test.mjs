import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
import {proxyApi} from '../lib/server/apiProxy.mjs';

const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),{renderToString}=require('react-dom/server');
const env={NODE_ENV:'production',PUBLIC_SITE_URL:'https://academy.test',API_PROXY_TARGET:'https://api.academy.test'};
const site=compileModule('../lib/siteMetadata.ts');
const helpers=()=>compileModule('../lib/server/publicWebsiteContent.ts',{imports:{'./apiProxy.mjs':{proxyApi},'../siteMetadata':site,'../websiteConfig':{websiteConfig:value=>value}}});
const helper=()=>helpers().prefetchPublicContent;
const serverBootstrap=()=>compileModule('../components/PublicInitialData.tsx',{imports:{react:React,'react/jsx-runtime':jsx,'next/navigation':{usePathname:()=> '/'},'../lib/api':{publicApiScope:()=> 'server',subscribePublicApi:()=>()=>{}}}});
const plain=value=>JSON.parse(JSON.stringify(value));

test('public summary prefetch uses fixed anonymous paths and emits only the required public arrays',async()=>{
 const incoming=new Headers({cookie:'private-cookie',authorization:'private-token','x-sa-network':'untrusted','x-sa-network-signature':'untrusted','x-sa-portal':'super_admin'});
 for(const [path,body,expected] of [
  ['/content/landing',{sections:[{slug:'section'}],team:[{name:'Faculty'}],reviews:[],courses:[{slug:'unused'}],user:{email:'private'}},['sections','team','reviews']],
  ['/video-reviews',{items:[{_id:'review',title:'Public review',previewRendition:'b'.repeat(24)}],user:{email:'private'}},['items']],
  ['/page-sections/landing',{blocks:[{id:'hero',title:'Public content'}],revision:50},['blocks']]
 ]){
  const value=await helper()(path,incoming,{env,fetcher:async(url,options)=>{
   assert.equal(url,'https://api.academy.test/api'+path);assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'manual');
   for(const name of ['cookie','authorization','x-sa-network','x-sa-network-signature'])assert.equal(options.headers.get(name),null);
   return Response.json({success:true,...body});
  }});
  assert.deepEqual(Object.keys(value),expected);for(const field of expected)assert.deepEqual(plain(value[field]),body[field]);
  assert.doesNotMatch(JSON.stringify(value),/private|revision|unused/);
 }
});

test('private paths, incomplete arrays and reserved configured edge headers fall back without credential forwarding',async()=>{
 let calls=0;const never=async()=>{calls++;assert.fail('must not contact upstream');};
 for(const path of ['/courses','/payments/membership-status','/video-reviews?private=1','/page-sections/home'])assert.equal(await helper()(path,new Headers(),{env,fetcher:never}),null);
 for(const name of ['cookie','authorization','x-sa-network','X-SA-Network-Signature','x-sa-portal','idempotency-key','origin'])assert.equal(await helper()('/video-reviews',new Headers({[name]:'private'}),{env:{...env,SA_PROXY_CLIENT_IP_HEADER:name},fetcher:never}),null);
 assert.equal(calls,0);
 for(const body of [{success:true,items:{}},{success:false,items:[]},{success:true,sections:[],team:[]}])assert.equal(await helper()(body.items!==undefined?'/video-reviews':'/content/landing',new Headers(),{env,fetcher:async()=>Response.json(body)}),null);
});

test('parallel anonymous summary failures share one bounded wait instead of serial deadlines',async()=>{
 const keepAlive=setTimeout(()=>{},2500),started=performance.now();let calls=0;
 try{
  const values=await Promise.all(['/content/landing','/video-reviews','/page-sections/landing'].map(path=>helper()(path,new Headers(),{env,fetcher:async(_url,options)=>{
   calls++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
  }})));
  assert.equal(calls,3);assert.deepEqual(values,[null,null,null]);assert.ok(performance.now()-started<1800,'parallel fallbacks must not wait for three 800 ms deadlines in sequence');
 }finally{clearTimeout(keepAlive);}
});

test('real SSR uses a seeded array or confirmed empty result while ignoring a different browser cache',()=>{
 const bootstrap=serverBootstrap(),mod=compileModule('../lib/usePublicResource.ts',{imports:{react:React,'../components/PublicInitialData':bootstrap,'./api':{subscribePublicApi:()=>()=>{},publicApiSnapshot:()=>({items:[{title:'Cached other document'}]}),publicApiScope:()=> 'server'}}});
 for(const [initial,expected] of [[[ {title:'Published server review'} ],'Published server review'],[[],'empty'],[null,'loading'],[{},'loading']]){
  const View=()=>{const state=mod.usePublicResource('/video-reviews','items');return React.createElement('p',null,state.loading?'loading':state.data[0]?.title||'empty');};
  const html=renderToString(React.createElement(bootstrap.PublicInitialDataProvider,{initialData:{'/video-reviews':{items:initial}}},React.createElement(View)));assert.equal(html,'<p>'+expected+'</p>');assert.doesNotMatch(html,/Cached other document/);
 }
});

function resourceFixture({initialData,cached=null,load=async()=>({items:[]})}={}){
 const h=hookHarness(),b=browserGlobals();let scope='student:one',seed=initialData,reads=0;
 const mod=compileModule('../lib/usePublicResource.ts',{imports:{react:{...h.React,useSyncExternalStore:(_subscribe,get)=>get()},'../components/PublicInitialData':{usePublicInitialArray:()=>Array.isArray(seed)?seed:null},'./api':{subscribePublicApi:()=>()=>{},publicApiScope:()=>scope,publicApiSnapshot:()=>cached,invalidatePublicApi:()=>{cached=null;},isAbortError:error=>error?.name==='AbortError',apiFetch:(...args)=>{reads++;return load(...args);}}},globals:{...b,...h.globals,navigator:{onLine:true}}});
 h.mount(()=>mod.usePublicResource('/video-reviews','items'));
 return {h,b,get reads(){return reads;},changeSeed(value){seed=value;h.render();},changeAccount(){scope='student:two';cached=null;h.render();}};
}

test('client navigation still prefers its account-bound cache and seeds never enter that cache',async()=>{
 const initial=[{title:'Server seed'}],cached={items:[{title:'Cached current owner'}]},f=resourceFixture({initialData:initial,cached,load:()=>new Promise(()=>{})});
 assert.equal(f.h.tree.data,cached.items);assert.equal(f.h.tree.loading,false);assert.deepEqual(cached,{items:[{title:'Cached current owner'}]});
 await f.h.settle();assert.equal(f.h.tree.data,cached.items);f.h.cleanup();
});

test('seed survives a failed refresh, is frozen on prop changes, and cannot reappear after an account boundary',async()=>{
 const initial=[{title:'Server seed'}];let fail=true,finish;
 const f=resourceFixture({initialData:initial,load:async()=>{if(fail)throw Error('temporary network failure');return new Promise(resolve=>finish=resolve);}});
 assert.equal(f.h.tree.data,initial);await f.h.settle();assert.equal(f.h.tree.data,initial);assert.match(f.h.tree.error,/network/);
 f.changeSeed([{title:'Replacement prop before a late boundary hydrates'}]);assert.equal(f.h.tree.data,initial);
 fail=false;f.changeAccount();assert.equal(f.h.tree.data.length,0);assert.equal(f.h.tree.loading,true);await f.h.settle();
 finish({items:[{title:'New owner response'}]});await f.h.settle();assert.equal(f.h.tree.data[0].title,'New owner response');f.h.cleanup();
});

test('focus and CMS invalidation still replace seeded content with fresh public results',async()=>{
 let title='First refresh';const f=resourceFixture({initialData:[{title:'Server seed'}],load:async()=>({items:[{title}]})});
 await f.h.settle();assert.equal(f.h.tree.data[0].title,'First refresh');
 title='Admin saved review';f.b.window.dispatchEvent(new Event('sa-website-content'));await f.h.settle();assert.equal(f.h.tree.data[0].title,title);
 title='Focus refresh';f.b.window.dispatchEvent(new Event('focus'));await f.h.settle();assert.equal(f.h.tree.data[0].title,title);f.h.cleanup();
});

test('public page bundle starts fixed summary reads together and ignores every private page',async()=>{
 const pending=new Map(),calls=[],prefetch=helpers().prefetchPublicPageContent;
 const result=prefetch('/',new Headers(),{env,fetcher:url=>{calls.push(url);return new Promise(resolve=>pending.set(new URL(url).pathname,resolve));}});
 assert.deepEqual(calls,['/api/content/landing','/api/video-reviews','/api/page-sections/landing'].map(path=>'https://api.academy.test'+path));
 pending.get('/api/content/landing')(Response.json({success:true,sections:[],team:[],reviews:[]}));pending.get('/api/video-reviews')(Response.json({success:true,items:[{title:'Review'}]}));pending.get('/api/page-sections/landing')(Response.json({success:true,blocks:[{title:'CMS block'}]}));
 const initial=await result;assert.equal(initial['/video-reviews'].items[0].title,'Review');assert.equal(initial['/page-sections/landing'].blocks[0].title,'CMS block');
 for(const page of [null,'/billing','/learn/course','/admin','/video-reviews?private=1'])assert.deepEqual(plain(await prefetch(page,new Headers(),{env,fetcher:async()=>assert.fail('private pages must not prefetch summaries')})),{});
 let reviewReads=0;const reviews=await prefetch('/video-reviews',new Headers(),{env,fetcher:async url=>{reviewReads++;assert.equal(new URL(url).pathname,'/api/video-reviews');return Response.json({success:true,items:[]});}});assert.equal(reviewReads,1);assert.deepEqual(plain(reviews),{'/video-reviews':{items:[]}});
});

test('root layout starts CMS and page reads together before rendering with auth and loading boundaries unchanged',async()=>{
 const h=hookHarness(),calls=[],pending=new Map(),Auth=Symbol('Auth'),Feedback=Symbol('Feedback'),Gate=Symbol('Gate'),Website=Symbol('Website'),Initial=Symbol('Initial'),Suspense=Symbol('Suspense');
 const seed={'/video-reviews':{items:[{title:'Review'}]}},config={text:{title:'CMS'},images:[]};
 const layout=compileModule('../app/layout.tsx',{imports:{react:{Suspense},'react/jsx-runtime':h,'next/headers':{headers:async()=>new Headers({'x-sa-public-content-page':'/video-reviews','x-session':encodeURIComponent(JSON.stringify({portal:'student',user:null}))})},'../lib/siteMetadata':site,'../components/WebsiteContent':{WebsiteContentProvider:Website},'../components/PublicInitialData':{PublicInitialDataProvider:Initial},'../components/auth/AuthProvider':{AuthProvider:Auth},'../components/feedback/AccountFeedback':{default:Feedback},'../components/auth/SiteAccessGate':{default:Gate},'../components/NavigationFeedback':{default:Symbol('Navigation')},'../components/CatalogWarmup':{default:Symbol('Warmup')},'../lib/server/pageSession':{SNAPSHOT_HEADER:'x-session'},'../lib/server/publicWebsiteContent':{prefetchWebsiteContent:()=>{calls.push('site');return new Promise(resolve=>pending.set('site',resolve));},prefetchPublicPageContent:page=>{calls.push(page);return new Promise(resolve=>pending.set('page',resolve));}}}}).default;
 const result=layout({children:'existing page'});for(let i=0;i<5;i++)await Promise.resolve();assert.deepEqual(calls,['site','/video-reviews']);pending.get('site')(config);pending.get('page')(seed);
 const tree=await result,auth=tree.props.children.props.children;assert.equal(auth.type,Auth);assert.equal(auth.props.initialSession.portal,'student');
 const feedback=auth.props.children;assert.equal(feedback.type,Feedback);const gate=feedback.props.children[1],website=gate.props.children,initial=website.props.children,boundary=initial.props.children[0];
 assert.equal(gate.type,Gate);assert.equal(website.type,Website);assert.equal(website.props.initialConfig,config);assert.equal(initial.type,Initial);assert.equal(initial.props.initialData,seed);assert.equal(boundary.type,Suspense);assert.equal(boundary.props.children,'existing page');assert.equal(boundary.props.fallback.props.children,'Loading Singh Academy…');
});

test('video review page stays synchronous so summary fetching cannot trigger a page loading fallback',()=>{
 const h=hookHarness(),Shell=Symbol('Shell'),Reviews=Symbol('Reviews');
 const reviews=compileModule('../app/video-reviews/page.tsx',{imports:{'react/jsx-runtime':h,'../../components/layout/PageShell':{default:Shell},'../../components/video-reviews/VideoReviews':{default:Reviews},'../../lib/siteMetadata':site}}).default();assert.equal(reviews.type,Shell);assert.equal(reviews.props.children.type,Reviews);assert.equal(typeof reviews.then,'undefined');
});

test('request-local context seeds real SSR without a DOM wrapper or a shared cache',()=>{
 const bootstrap=serverBootstrap();
 const resource=compileModule('../lib/usePublicResource.ts',{imports:{react:React,'../components/PublicInitialData':bootstrap,'./api':{subscribePublicApi:()=>()=>{},publicApiSnapshot:()=>({items:[{title:'Different browser cache'}]}),publicApiScope:()=> 'server'}}});
 const View=()=>{const state=resource.usePublicResource('/video-reviews','items');return React.createElement('p',null,state.loading?'loading':state.data[0]?.title||'empty');};
 for(const title of ['First document','Second document','First document']){
  const html=renderToString(React.createElement(bootstrap.PublicInitialDataProvider,{initialData:{'/video-reviews':{items:[{title}]}}},React.createElement(View)));assert.equal(html,'<p>'+title+'</p>');
 }
});

function bootstrapFixture({hydrated=false,items=[{title:'Document seed'}]}={}){
 const h=hookHarness(),b=browserGlobals(),requests=[],seed={'/video-reviews':{items}};let prop=seed,context={},scope='student:one',pathname='/video-reviews';
 const api={subscribePublicApi:()=>()=>{},publicApiScope:()=>scope,publicApiSnapshot:()=>null,invalidatePublicApi(){},isAbortError:error=>error?.name==='AbortError',apiFetch:(_path,options)=>new Promise((resolve,reject)=>requests.push({resolve,reject,signal:options.signal}))};
 const bootstrap=compileModule('../components/PublicInitialData.tsx',{imports:{react:{...h.React,useSyncExternalStore:(_subscribe,get)=>get(),createContext:()=>({Provider:Symbol('public context')}),useContext:()=>context},'react/jsx-runtime':h,'next/navigation':{usePathname:()=>pathname},'../lib/api':api,'../lib/useHydrated':{useHydrated:()=>hydrated}},globals:{...b,...h.globals}});
 const resourceFor=owner=>compileModule('../lib/usePublicResource.ts',{imports:{react:{...owner.React,useSyncExternalStore:(_subscribe,get)=>get()},'../components/PublicInitialData':bootstrap,'./api':api},globals:{...b,...owner.globals,navigator:{onLine:true}}});
 const resource=resourceFor(h);
 h.mount(()=>{const provider=bootstrap.PublicInitialDataProvider({initialData:prop,children:'page'});context=provider.props.value;return {provider,array:bootstrap.usePublicInitialArray('/video-reviews','items'),state:resource.usePublicResource('/video-reviews','items')};});
 return {h,b,seed,requests,changeProp(){prop={'/video-reviews':{items:[{title:'Later root prop'}]}};h.render();},finishHydration(){hydrated=true;h.render();},changeAccount(){scope='student:two';h.render();},restoreAccount(){scope='student:one';h.render();},changePath(value){pathname=value;h.render();},mountConsumer(){const consumer=hookHarness(),resource=resourceFor(consumer);consumer.mount(()=>resource.usePublicResource('/video-reviews','items'));return consumer;}};
}

test('late hydration keeps its frozen document seed while refresh and account boundaries remain current',async()=>{
 const f=bootstrapFixture();assert.equal(f.h.tree.state.data,f.seed['/video-reviews'].items);f.changeProp();assert.equal(f.h.tree.provider.props.value,f.seed);assert.equal(f.h.tree.array,f.seed['/video-reviews'].items);
 f.finishHydration();assert.equal(f.h.tree.array,f.seed['/video-reviews'].items);assert.equal(f.h.tree.state.data,f.seed['/video-reviews'].items);await f.h.settle();
 f.changeAccount();assert.equal(f.h.tree.state.data.length,0);assert.equal(f.h.tree.state.loading,true);await f.h.settle();assert.equal(f.requests[0].signal.aborted,true);
 f.requests[0].resolve({items:[{title:'Old owner response'}]});await f.h.settle();assert.equal(f.h.tree.state.data.length,0);
 f.requests.at(-1).resolve({items:[{title:'Current owner response'}]});await f.h.settle();assert.equal(f.h.tree.state.data[0].title,'Current owner response');f.h.cleanup();
});

test('a first consumer after hydration still captures the document seed and retains it on failed refresh',async()=>{
 const f=bootstrapFixture({hydrated:true});assert.equal(f.h.tree.array,f.seed['/video-reviews'].items);assert.equal(f.h.tree.state.data,f.seed['/video-reviews'].items);assert.equal(f.h.tree.state.loading,false);await f.h.settle();
 f.requests[0].reject(Error('Published reviews temporarily unavailable'));await f.h.settle();assert.equal(f.h.tree.state.data,f.seed['/video-reviews'].items);assert.equal(f.h.tree.state.loaded,true);assert.match(f.h.tree.state.error,/temporarily unavailable/);f.h.cleanup();
});

test('a late first consumer preserves a confirmed empty document response through failed refresh',async()=>{
 const f=bootstrapFixture({hydrated:true,items:[]});assert.equal(f.h.tree.state.loading,false);assert.equal(f.h.tree.state.loaded,true);await f.h.settle();f.requests[0].reject(Error('offline'));await f.h.settle();assert.equal(f.h.tree.state.loading,false);assert.equal(f.h.tree.state.loaded,true);assert.equal(f.h.tree.state.data.length,0);f.h.cleanup();
});

test('new consumers after navigation cannot replay the document seed, including Back to the first path',async()=>{
 const f=bootstrapFixture({hydrated:true});await f.h.settle();f.changePath('/about');assert.equal(f.h.tree.array,null);f.changePath('/video-reviews');assert.equal(f.h.tree.array,null);
 const consumer=f.mountConsumer();assert.equal(consumer.tree.data.length,0);assert.equal(consumer.tree.loading,true);await consumer.settle();f.requests.at(-1).resolve({items:[{title:'Client navigation response'}]});await consumer.settle();assert.equal(consumer.tree.data[0].title,'Client navigation response');consumer.cleanup();f.h.cleanup();
});

test('account boundaries permanently retire document seeds for newly mounted consumers',async()=>{
 const f=bootstrapFixture({hydrated:true});await f.h.settle();f.changeAccount();assert.equal(f.h.tree.array,null);f.restoreAccount();assert.equal(f.h.tree.array,null);
 const consumer=f.mountConsumer();assert.equal(consumer.tree.data.length,0);assert.equal(consumer.tree.loading,true);await consumer.settle();consumer.cleanup();f.h.cleanup();
});

test('CMS invalidation retires the document seed without clearing a consumer existing successful content',async()=>{
 const f=bootstrapFixture({hydrated:true});await f.h.settle();f.b.window.dispatchEvent(new Event('sa-website-content'));await f.h.settle();assert.equal(f.h.tree.array,null);assert.equal(f.h.tree.state.data,f.seed['/video-reviews'].items);
 const consumer=f.mountConsumer();assert.equal(consumer.tree.data.length,0);assert.equal(consumer.tree.loading,true);await consumer.settle();f.requests.at(-1).reject(Error('refresh failed'));await consumer.settle();assert.equal(consumer.tree.data.length,0);assert.match(consumer.tree.error,/refresh failed/);consumer.cleanup();f.h.cleanup();
});

test('original landing client page renders all public context summaries synchronously in real SSR',()=>{
 const bootstrap=serverBootstrap(),resource=compileModule('../lib/usePublicResource.ts',{imports:{react:React,'../components/PublicInitialData':bootstrap,'./api':{subscribePublicApi:()=>()=>{},publicApiSnapshot:()=>null,publicApiScope:()=> 'server'}}});
 const nothing=()=>null;
 const Landing=compileModule('../app/page.tsx',{imports:{react:React,'react/jsx-runtime':jsx,'../lib/usePublicResource':resource,'../components/WebsiteContent':{useWebsiteContent:()=>({}),websiteText:(_config,_key,fallback)=>fallback},'../lib/imageSources':compileModule('../lib/imageSources.ts'),'../lib/learningPhotos':compileModule('../lib/learningPhotos.ts'),'../components/AcademyImage':{default:({src,alt})=>React.createElement('img',{src,alt})},'../components/ApiLoadError':{default:nothing},'../components/SiteHeader':{default:nothing},'../components/layout/SiteFooter':{default:nothing},'../components/auth/LandingAuthGate':{default:nothing},'../components/content/FounderProfile':{default:nothing},'../components/content/PageSections':{default:nothing},'../components/catalog/CatalogCard':{default:({product})=>React.createElement('article',null,product.title)},'../components/video-reviews/VideoReviews':{default:()=>{const {data}=resource.usePublicResource('/video-reviews','items');return React.createElement('p',null,data[0]?.title);}}}}).default;
 const seed={'/content/landing':{sections:[{_id:'section',slug:'public-section',title:'Seeded public section'}],team:[{_id:'faculty',name:'Seeded public faculty',role:'Faculty',image:'/faculty.jpg'}],reviews:[{_id:'review',message:'Seeded public feedback',rating:5}]},'/video-reviews':{items:[{title:'Seeded public video'}]}};
 const html=renderToString(React.createElement(bootstrap.PublicInitialDataProvider,{initialData:seed},React.createElement(Landing)));
 for(const title of ['Seeded public section','Seeded public faculty','Seeded public feedback','Seeded public video'])assert.ok(html.includes(title),title+' must render before client effects');
 assert.doesNotMatch(html,/Loading published sections|Loading team|Loading reviews/);
});

test('actual video review cards render in SSR from initial items without changing preview renditions',()=>{
 const bootstrap=serverBootstrap(),resource=compileModule('../lib/usePublicResource.ts',{imports:{react:React,'../components/PublicInitialData':bootstrap,'./api':{subscribePublicApi:()=>()=>{},publicApiSnapshot:()=>null,publicApiScope:()=> 'server'}}});
 const rendition='b'.repeat(24),seen=[];
 const VideoReviews=compileModule('../components/video-reviews/VideoReviews.tsx',{imports:{react:React,'react/jsx-runtime':jsx,'next/link':{default:'a'},'../../lib/usePublicResource':resource,'../../lib/videoReviews':{reviewVideoSource:()=>({kind:'native'}),reviewPreviewSeconds:compileModule('../lib/videoReviews.ts',{imports:{'./video':{resolveVideoSource:()=>null}}}).reviewPreviewSeconds},'./ReviewVideo':{default:props=>{seen.push(props);return React.createElement('div',{'data-preview':props.previewRendition});}}}}).default;
 const html=renderToString(React.createElement(bootstrap.PublicInitialDataProvider,{initialData:{'/video-reviews':{items:[{_id:'one',title:'Published review',videoUrl:'/video.mp4',teaserSeconds:15,previewRendition:rendition}]}}},React.createElement(VideoReviews)));
 assert.match(html,/Published review/);assert.doesNotMatch(html,/Loading video reviews/);assert.equal(seen[0].previewRendition,rendition);
});

test('actual landing CMS anchors render seeded published blocks in their existing placement during SSR',()=>{
 const bootstrap=serverBootstrap(),resource=compileModule('../lib/usePublicResource.ts',{imports:{react:React,'../components/PublicInitialData':bootstrap,'./api':{subscribePublicApi:()=>()=>{},publicApiSnapshot:()=>null,publicApiScope:()=> 'server'}}});
 const PageSections=compileModule('../components/content/PageSections.tsx',{imports:{react:React,'react/jsx-runtime':jsx,'next/navigation':{usePathname:()=> '/'},'../../lib/api':{portalMediaUrl:value=>value},'../../lib/usePublicResource':resource,'../../lib/pageSections':{contentPageKey:()=> 'landing',pageHasContentAnchors:()=>true},'./PageGallery':{default:()=>null},'./PageSectionVideo':{default:()=>null},'../AcademyImage':{default:()=>null}}}).default;
 const blocks=[{id:'start',title:'Published start block',placement:'start'},{id:'end',title:'Published end block',placement:'end'}];
 const html=renderToString(React.createElement(bootstrap.PublicInitialDataProvider,{initialData:{'/page-sections/landing':{blocks}}},React.createElement(PageSections,{placement:'start'})));assert.match(html,/Published start block/);assert.doesNotMatch(html,/Published end block/);
});
