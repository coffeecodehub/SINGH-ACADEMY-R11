/** V60.11.1 targeted regression checks. Hook/Next doubles are NOT a full browser build. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const learner={id:'learner-one',role:'student',name:'Test Learner'};
const policy=compileModule('../lib/pagePolicy.ts');
function headerFixture({hydrated=false,user=learner,ready=true,signingOut=false,logout=async()=>{}}={}){
 const h=hookHarness(),b=browserGlobals();let currentHydration=hydrated,calls=0;
 const auth={user,ready,signingOut,logout:()=>{calls++;return logout();}};
 const mod=compileModule('../components/SiteHeader.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'next/link':{default:'a'},'next/navigation':{usePathname:()=>'/events'},'./AcademyImage':{default:'img'},'./auth/AuthProvider':{useAuth:()=>auth},'../lib/pagePolicy':policy,'../lib/useHydrated':{useHydrated:()=>currentHydration}},globals:{...b,...h.globals}});
 h.mount(()=>mod.default({}));
 return {h,auth,get calls(){return calls;},hydrate(){currentHydration=true;h.render();},logout:()=>nodes(h.tree).find(n=>n.props?.className==='authBtn logoutBtn'),menu:()=>nodes(h.tree).find(n=>n.props?.className==='menuButton')};
}
test('SSR-authenticated header does not expose an enabled inert Logout button',async t=>{
 const f=headerFixture();t.after(()=>f.h.cleanup());
 assert.equal(f.h.tree.props['data-auth-controls-ready'],'false');assert.equal(f.logout().props.disabled,true);assert.equal(f.logout().props.type,'button');
 await f.logout().props.onClick();assert.equal(f.calls,0);
});
test('server and first hydration render have identical account-control trees',t=>{
 const a=headerFixture(),b=headerFixture();t.after(()=>{a.h.cleanup();b.h.cleanup();});
 const snapshot=f=>JSON.stringify(f.h.tree,(_k,v)=>typeof v==='function'?undefined:v);
 assert.equal(snapshot(a),snapshot(b));
});
test('hydration enables Logout and the immediate first click calls the provider once',async t=>{
 const f=headerFixture();t.after(()=>f.h.cleanup());f.hydrate();
 assert.equal(f.h.tree.props['data-auth-controls-ready'],'true');assert.equal(f.logout().props.disabled,false);
 await f.logout().props.onClick();assert.equal(f.calls,1);
});
test('double logout click before a rerender is synchronously deduplicated',async t=>{
 let finish;const wait=new Promise(r=>finish=r);const f=headerFixture({hydrated:true,logout:()=>wait});t.after(()=>f.h.cleanup());
 const button=f.logout(),first=button.props.onClick(),second=button.props.onClick();assert.equal(f.calls,0);
 await f.h.settle();assert.equal(f.calls,1);assert.equal(f.logout().props.disabled,true);assert.equal(f.logout().props['aria-busy'],true);
 finish();await Promise.all([first,second]);
});
test('provider-level signing out also disables stale header controls',async t=>{
 const f=headerFixture({hydrated:true,signingOut:true});t.after(()=>f.h.cleanup());assert.equal(f.logout().props.disabled,true);await f.logout().props.onClick();assert.equal(f.calls,0);
});
test('menu hydration gate does not change the hydrated menu layout/classes',t=>{
 const f=headerFixture();t.after(()=>f.h.cleanup());assert.equal(f.menu().props.disabled,true);assert.equal(f.menu().props.className,'menuButton');f.hydrate();assert.equal(f.menu().props.disabled,false);f.menu().props.onClick();f.h.render();assert.equal(f.menu().props['aria-expanded'],true);
});
test('guest header still links to login with a preserved destination and offers no logout',t=>{
 const f=headerFixture({hydrated:true,user:null});t.after(()=>f.h.cleanup());assert.equal(f.logout(),undefined);
 const about=nodes(f.h.tree).find(n=>n.props?.children==='About');assert.equal(about.props.href,'/login?next=%2Fabout');
});
for(const mode of ['development','production'])test('Next config preserves raw middleware URLs in '+mode,()=>{
 const mod=compileModule('../next.config.ts',{globals:{process:{env:{NODE_ENV:mode,NEXT_PUBLIC_API_URL:'/api'}}}});
 assert.equal(mod.default.skipMiddlewareUrlNormalize,true);assert.equal(mod.default.reactStrictMode,true);
});
// Execute the application's real middleware with a page-session double. Actual
// NextURL/adapter rewriting is additionally checked by the real browser suite.
class NextResponse extends Response{static redirect(location){return new NextResponse(null,{status:307,headers:{Location:String(location)}});}static next(options){const res=new NextResponse(null);res.forwarded=options.request.headers;return res;}}
for(const origin of ['http://127.0.0.1:3108','http://localhost:3108','http://[::1]:3108','https://singhacademy.com','https://staging.example.invalid'])test('middleware auth redirect retains exact protocol, hostname and port: '+origin,async()=>{
 const mod=compileModule('../middleware.ts',{imports:{'next/server':{NextResponse},'./lib/server/pageSession':{SNAPSHOT_HEADER:'x-sa-verified-page-session',pageSession:async()=>({redirect:'/home'})}},globals:{btoa}});
 const res=await mod.middleware(new Request(origin+'/',{headers:{'x-forwarded-host':'attacker.example.invalid'}}));
 assert.equal(res.status,307);assert.equal(res.headers.get('location'),origin+'/home');assert.match(res.headers.get('cache-control'),/no-store/);
});
