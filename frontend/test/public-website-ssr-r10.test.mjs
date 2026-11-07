import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createServer} from 'node:http';import {once} from 'node:events';
import {compileModule,browserGlobals} from './compile.mjs';import {hookHarness} from './hooks.mjs';
import {proxyApi} from '../lib/server/apiProxy.mjs';
const require=createRequire(import.meta.url),React=require('react'),{renderToString}=require('react-dom/server');
const config=value=>({text:value?.text||{},images:value?.images||[]});
const initial={text:{title:'Saved public Academy'},images:[{key:'hero',src:'/old.jpg',url:'/saved.jpg'}]};
const changed={text:{title:'New public Academy'},images:[]};
const env={NODE_ENV:'production',PUBLIC_SITE_URL:'https://academy.test',API_PROXY_TARGET:'https://api.academy.test'};
function loader(){return compileModule('../lib/server/publicWebsiteContent.ts',{imports:{'./apiProxy.mjs':{proxyApi},'../siteMetadata':{publicSiteOrigin:value=>{try{const url=new URL(value);return url.protocol==='https:'&&url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password?url.origin:undefined;}catch{return undefined;}}},'../websiteConfig':{websiteConfig:config}}}).prefetchWebsiteContent;}
test('SSR prefetch fixes upstream/path and carries no account credentials or incoming proxy proof',async()=>{
 const incoming=new Headers({cookie:'private-cookie',authorization:'private-token','x-sa-portal':'super_admin','x-sa-network':'untrusted-proof','x-sa-network-signature':'untrusted-signature'});
 let calls=0;const value=await loader()(incoming,{env,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.academy.test/api/content/site');assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'manual');for(const key of ['cookie','authorization','x-sa-network','x-sa-network-signature'])assert.equal(options.headers.get(key),null);assert.equal(options.headers.get('x-sa-portal'),'student');return Response.json({success:true,content:{websiteContent:initial,membershipPlans:[{price:100}]}});}});
 assert.equal(calls,1);assert.equal(JSON.stringify(value),JSON.stringify(initial));
});
test('missing production origin or missing required edge proof falls back without a direct API retry',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not call');};
 assert.equal(await loader()(new Headers(),{env:{...env,PUBLIC_SITE_URL:undefined},fetcher}),null);
 assert.equal(await loader()(new Headers(),{env:{...env,SA_REQUIRE_PROXY_IDENTITY:'true'},fetcher}),null);
 assert.equal(calls,0);
});
test('public SSR reuses the verified edge signing protocol without exposing client attestation',async()=>{
 const networkEnv={...env,SA_PROXY_SHARED_SECRET:'synthetic-r10-secret-'.repeat(4),SA_PROXY_CLIENT_IP_HEADER:'x-fixture-edge-ip',SA_PROXY_CLIENT_IP_VERIFIED:'true'};
 let calls=0;
 await loader()(new Headers({'x-fixture-edge-ip':'198.51.100.24','x-sa-network':'spoof'}),{env:networkEnv,fetcher:async(url,options)=>{calls++;assert.notEqual(options.headers.get('x-sa-network'),'spoof');assert.ok(options.headers.get('x-sa-network-signature'));assert.equal(options.headers.get('cookie'),null);return Response.json({success:true,content:{websiteContent:initial}});}});
 assert.equal(calls,1);
 assert.equal(await loader()(new Headers({'x-fixture-edge-ip':'198.51.100.24, 127.0.0.1'}),{env:networkEnv,fetcher:async()=>assert.fail('ambiguous address must not forward')}),null);
});
test('redirect, malformed, incomplete and unavailable CMS replies use existing client fallback',async()=>{
 for(const response of [new Response(null,{status:302,headers:{location:'https://other.test'}}),new Response('invalid'),Response.json({success:false,content:{}}),Response.json({success:true,content:[]}),new Response(null,{status:503})])assert.equal(await loader()(new Headers(),{env,fetcher:async()=>response}),null);
 assert.equal(await loader()(new Headers(),{env,fetcher:async()=>{throw Error('offline');}}),null);
});
test('real HTTP slow headers and slow response body are both bounded by the SSR deadline',async()=>{
 let delayed;const server=createServer((req,res)=>{if(req.url.includes('body')){res.writeHead(200,{'content-type':'application/json'});res.write('{"success":true,"content":');}delayed=setTimeout(()=>res.end('{"websiteContent":{}}}'),5000);res.once('close',()=>clearTimeout(delayed));});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{for(const slow of ['headers','body']){const started=performance.now();assert.equal(await loader()(new Headers(),{env:{NODE_ENV:'development'},fetcher:(_url,options)=>fetch('http://127.0.0.1:'+server.address().port+'/'+slow,options)}),null);assert.ok(performance.now()-started<1800,'prefetch must not wait for slow upstream '+slow);}}finally{clearTimeout(delayed);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('saved CMS content renders in real SSR while different cached browser data cannot replace the hydration snapshot',()=>{
 const mod=compileModule('../components/WebsiteContent.tsx',{imports:{react:React,'react/jsx-runtime':require('react/jsx-runtime'),'./auth/AuthProvider':{useAuth:()=>({ready:true,user:null})},'../lib/api':{subscribePublicApi:()=>()=>{},publicApiScope:()=> 'server'},'../lib/publicSiteContent':{siteContentSnapshot:()=>({websiteContent:changed}),getPublicSiteContent:async()=>({websiteContent:changed})},'../lib/websiteConfig':{websiteConfig:config},'../lib/useHydrated':{useHydrated:()=>false}}});
 const child=()=>{const value=mod.useWebsiteContent();return React.createElement('p',null,value.text.title,React.createElement('img',{src:value.images[0]?.url,alt:''}));};
 const html=renderToString(React.createElement(mod.WebsiteContentProvider,{initialConfig:initial},React.createElement(child)));assert.match(html,/Saved public Academy/);assert.match(html,/src="\/saved.jpg"/);assert.doesNotMatch(html,/New public Academy|\/old.jpg/);
});
test('initial hydration snapshot is frozen while focus/admin refresh and account fences retain current behavior',async()=>{
 const h=hookHarness(),b=browserGlobals();let scope='student:one',seed=initial,reply=changed;const contexts=[];
 const mod=compileModule('../components/WebsiteContent.tsx',{imports:{react:{...h.React,createContext:value=>{const context={Provider:Symbol('context'),value};contexts.push(context);return context;},useSyncExternalStore:()=>null},'react/jsx-runtime':h,'./auth/AuthProvider':{useAuth:()=>({ready:true,user:{id:scope}})},'../lib/api':{subscribePublicApi:()=>()=>{},publicApiScope:()=>scope,invalidatePublicApi(){}},'../lib/publicSiteContent':{siteContentSnapshot:()=>null,getPublicSiteContent:async()=>({websiteContent:reply})},'../lib/websiteConfig':{websiteConfig:config},'../lib/useHydrated':{useHydrated:()=>true}},globals:{...b,...h.globals}});
 h.mount(()=>mod.WebsiteContentProvider({initialConfig:seed,children:'page'}));assert.equal(h.tree.props.value.text.title,initial.text.title);await h.settle();assert.equal(h.tree.props.value.text.title,changed.text.title);
 seed=changed;h.render();assert.equal(h.tree.props.children.props.value,initial,'prop changes do not replace the initial late-boundary hydration snapshot');
 reply={text:{title:'Admin saved update'},images:[]};b.window.dispatchEvent(new Event('sa-website-content'));await h.settle();assert.equal(h.tree.props.value.text.title,reply.text.title);
 reply={text:{title:'Focus update'},images:[]};b.window.dispatchEvent(new Event('focus'));await h.settle();assert.equal(h.tree.props.value.text.title,reply.text.title);
 scope='student:two';h.render();assert.equal(Object.keys(h.tree.props.value.text).length,0);await h.settle();h.cleanup();
});
