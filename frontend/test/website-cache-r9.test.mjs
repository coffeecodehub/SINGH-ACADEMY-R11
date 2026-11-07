import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {compileModule,browserGlobals} from './compile.mjs';import {hookHarness} from './hooks.mjs';
const require=createRequire(import.meta.url),React=require('react'),{renderToString}=require('react-dom/server');
const config=value=>({text:value?.text||{},images:value?.images||[]});
const saved={websiteContent:{text:{title:'Saved Academy title'},images:[{key:'image',src:'/original.jpg',url:'/saved.jpg'}]}};
test('real SSR WebsiteContent remains deterministic even when a client cache exists',()=>{
 const mod=compileModule('../components/WebsiteContent.tsx',{imports:{react:React,'react/jsx-runtime':require('react/jsx-runtime'),'./auth/AuthProvider':{useAuth:()=>({ready:true,user:null})},'../lib/api':{subscribePublicApi:()=>()=>{},publicApiScope:()=> 'server'},'../lib/publicSiteContent':{siteContentSnapshot:()=>saved,getPublicSiteContent:async()=>saved},'../lib/websiteConfig':{websiteConfig:config},'../lib/useHydrated':{useHydrated:()=>false}}});
 const child=()=>React.createElement('p',null,mod.useWebsiteContent().text.title||'Original Academy title');
 assert.equal(renderToString(React.createElement(mod.WebsiteContentProvider,null,React.createElement(child))),'<p>Original Academy title</p>');
});
test('cached website copy and hero are available on the first client navigation render and fenced on account change',async()=>{
 const h=hookHarness(),b=browserGlobals();let cached=saved,scope='student:one';
 const mod=compileModule('../components/WebsiteContent.tsx',{imports:{react:{...h.React,createContext:()=>({Provider:'provider'}),useSyncExternalStore:(_subscribe,get)=>get()},'react/jsx-runtime':h,'./auth/AuthProvider':{useAuth:()=>({ready:true,user:{id:'one'}})},'../lib/api':{subscribePublicApi:()=>()=>{},publicApiScope:()=>scope},'../lib/publicSiteContent':{siteContentSnapshot:()=>cached,getPublicSiteContent:()=>new Promise(()=>{}),invalidatePublicSiteContent(){}},'../lib/websiteConfig':{websiteConfig:config},'../lib/useHydrated':{useHydrated:()=>true}},globals:{...b,...h.globals}});
 h.mount(()=>mod.WebsiteContentProvider({children:'page'}));assert.equal(h.tree.props.value.images[0].url,'/saved.jpg');assert.equal(h.tree.props.value.text.title,saved.websiteContent.text.title);
 const first=h.tree.props.value;h.render();assert.equal(h.tree.props.value,first,'unchanged cache snapshot yields a stable config object');
 scope='student:two';cached=null;h.render();assert.equal(h.tree.props.value.images.length,0);assert.equal(Object.keys(h.tree.props.value.text).length,0);h.cleanup();
});
