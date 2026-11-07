import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'?[t,...nodes(t.props?.children)]:[];

function fixture(){
 const b=browserGlobals(),h=hookHarness(),routes=[];let allowed=false,prompts=0,latest;
 b.window.location.href='http://academy.local/learn/demo';b.window.location.pathname='/learn/demo';b.window.history={length:2};const themed={feedback:{confirm:async()=>{prompts++;return allowed;}}};
 const guard=compileModule('../lib/leaveGuard.ts',{globals:b});
 const api={apiFetch:async(_path,options)=>options?.method?{answers:JSON.parse(options.body).answers}:{answers:{},attempt:{number:1,status:'in_progress'},assessment:{version:1,fields:[{}]},revision:1}};
 const sheet=compileModule('../components/learning/AnswerSheet.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../../lib/api':api,'../../lib/leaveGuard':guard,'../../lib/feedback':themed},globals:{...b,...h.globals}});
 const Back=compileModule('../components/layout/BackButton.tsx',{imports:{'react/jsx-runtime':h,'../../lib/leaveGuard':guard,'next/navigation':{useRouter:()=>({back:()=>routes.push('back'),push:href=>routes.push(href),replace:href=>routes.push(href)})}},globals:b}).default;
 h.mount(()=>{latest=sheet.useAnswerSheet('demo','lesson',1);return null;});
 return {b,h,guard,routes,Back,get sheet(){return latest;},get prompts(){return prompts;},allow(value){allowed=value;}};
}
function linkEvent(href,extra={}){
 const event=new Event('click',{cancelable:true});const anchor={href,target:'',hasAttribute:()=>false};
 Object.defineProperties(event,{button:{value:0},target:{value:{closest:()=>anchor}},...Object.fromEntries(Object.entries(extra).map(([key,value])=>[key,{value}]))});return event;
}
test('dirty response cancels Back without losing text; explicit discard allows navigation',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();f.sheet.change('answer','Unsaved response');await f.h.settle();
 await f.Back({fallback:'/my-course'}).props.onClick();assert.deepEqual(f.routes,[]);assert.equal(f.sheet.answers.answer,'Unsaved response');assert.equal(f.prompts,1);
 f.allow(true);await f.Back({fallback:'/my-course'}).props.onClick();assert.deepEqual(f.routes,['back']);
});
test('dirty response cancels a captured Next/header link, but ignores anchors and new tabs',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();f.sheet.change('answer','Keep this');await f.h.settle();
 const header=linkEvent('http://academy.local/courses');f.b.document.dispatchEvent(header);assert.equal(header.defaultPrevented,true);assert.equal(f.sheet.answers.answer,'Keep this');
 for(const event of [linkEvent('http://academy.local/learn/demo#notes'),linkEvent('http://academy.local/courses',{ctrlKey:true})]){f.b.document.dispatchEvent(event);assert.equal(event.defaultPrevented,false);}
 assert.equal(f.prompts,1);
});
test('successful save removes client and document leave guards',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();f.sheet.change('answer','Saved response');await f.h.settle();
 const before=new Event('beforeunload',{cancelable:true});f.b.window.dispatchEvent(before);assert.equal(before.defaultPrevented,true);
 await f.sheet.submit(false);await f.h.settle();assert.equal(f.sheet.dirty,false);
 const link=linkEvent('http://academy.local/courses');f.b.document.dispatchEvent(link);assert.equal(link.defaultPrevented,false);await f.Back({}).props.onClick();assert.deepEqual(f.routes,['back']);assert.equal(f.prompts,0);
});
test('header logout respects the same dirty-response guard before revoking the session',async t=>{
 const f=fixture(),h=hookHarness();let logouts=0;t.after(()=>{f.h.cleanup();h.cleanup();});await f.h.settle();f.sheet.change('answer','Keep me');await f.h.settle();
 const Header=compileModule('../components/SiteHeader.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'next/link':{default:'a'},'next/navigation':{usePathname:()=>'/learn/demo'},'./AcademyImage':{},'./auth/AuthProvider':{useAuth:()=>({user:{id:'student',name:'Learner',role:'student'},ready:true,logout:async()=>{logouts++;}})},'../lib/pagePolicy':{loginDestination:p=>p},'../lib/useHydrated':{useHydrated:()=>true},'../lib/leaveGuard':f.guard},globals:{...f.b,...h.globals}}).default;
 h.mount(()=>Header({}));const logout=()=>nodes(h.tree).find(node=>node.props?.className==='authBtn logoutBtn');
 await logout().props.onClick();assert.equal(logouts,0);assert.equal(f.sheet.answers.answer,'Keep me');f.allow(true);await logout().props.onClick();assert.equal(logouts,1);
});
