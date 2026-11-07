import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const controller=()=>compileModule('../lib/feedback.ts').createFeedbackController();
test('decisions fail closed until a host is connected',async()=>{const f=controller();assert.equal(await f.confirm({message:'Delete?'}),false);assert.equal(await f.prompt({message:'Name?'}),null);});
test('distinct decisions queue in order and duplicate clicks authorize only once',async()=>{
 const f=controller(),disconnect=f.connect('student:one'),first=f.confirm({message:'Delete one?'}),id=f.getSnapshot().id;
 const duplicate=f.confirm({message:'Delete one?'}),second=f.confirm({message:'Delete two?'});assert.equal(await duplicate,false);assert.equal(f.getSnapshot().id,id);
 f.resolve(id,true);assert.equal(await first,true);assert.equal(f.getSnapshot().options.message,'Delete two?');f.resolve(f.getSnapshot().id,false);assert.equal(await second,false);assert.equal(f.getSnapshot(),null);disconnect();
});
test('account or route changes reject approval before passive cleanup can run',async()=>{
 const f=controller();f.connect('student:one:/learn');const first=f.confirm({message:'Discard?'}),id=f.getSnapshot().id,queued=f.prompt({message:'Private note?'});
 f.markScope('student:two:/billing');f.resolve(id,true);assert.equal(await first,false);f.resolve(f.getSnapshot().id,'private');assert.equal(await queued,null);assert.equal(await f.confirm({message:'Stale click?'}),false);
 f.connect('student:two:/billing');const next=f.confirm({message:'Current action?'});f.resolve(f.getSnapshot().id,true);assert.equal(await next,true);
});
test('aborting an active or queued decision never resolves approval',async()=>{
 const f=controller();f.connect('site');const one=new AbortController(),two=new AbortController();const first=f.confirm({message:'One?',signal:one.signal}),second=f.confirm({message:'Two?',signal:two.signal});two.abort();assert.equal(await second,false);assert.equal(f.getSnapshot().options.message,'One?');one.abort();assert.equal(await first,false);assert.equal(f.getSnapshot(),null);
});
test('prompt cancellation, explicit empty response and disconnect remain distinct',async()=>{
 const f=controller(),disconnect=f.connect('site');const empty=f.prompt({message:'Optional note?'});f.resolve(f.getSnapshot().id,'');assert.equal(await empty,'');const cancel=f.prompt({message:'Name?'});f.resolve(f.getSnapshot().id,null);assert.equal(await cancel,null);const confirm=f.confirm({message:'Leave?'}),queued=f.prompt({message:'More?'});disconnect();assert.equal(await confirm,false);assert.equal(await queued,null);
});

function dialogFixture({busy=false,earlierCheckbox=false,explicitAutofocus=true,animate=false,reducedMotion=false}={}){
 const h=hookHarness(),b=browserGlobals(),element=new EventTarget();let cancelled=0,restored=0,open=true,scope='site';
 const opener={isConnected:true,focus(){restored++;b.document.activeElement=this;}},first={focus(){b.document.activeElement=this;}},last={focus(){b.document.activeElement=this;}},checkbox={focus(){b.document.activeElement=this;}};
 const controls=earlierCheckbox?[checkbox,first,last]:[first,last];
 Object.assign(element,{open:false,showModal(){this.open=true;},close(){this.open=false;},querySelector:selector=>selector.includes('[data-feedback-autofocus]')&&!selector.includes(',')?(explicitAutofocus?first:null):controls[0],querySelectorAll:()=>controls,contains:node=>controls.includes(node),focus(){b.document.activeElement=this;},getBoundingClientRect:()=>({left:10,right:100,top:10,bottom:100})});
 b.window.matchMedia=()=>({matches:reducedMotion});b.document.body={style:{overflow:'auto'}};b.document.activeElement=opener;b.document.querySelectorAll=()=>[element];
 let refCalls=0;const React={...h.React,useLayoutEffect:h.React.useEffect,useId:()=>h.React.useRef('id-'+refCalls).current,useRef(value){const ref=h.React.useRef(value);if(refCalls++===0)ref.current=element;return ref;}};
 const presenceTools=compileModule('../lib/feedbackPresence.ts',{globals:{...b,CSS:{supports:()=>animate}}});presenceTools.markFeedbackPresentationScope(scope);
 const Component=compileModule('../components/feedback/FeedbackDialog.tsx',{imports:{react:React,'react/jsx-runtime':h,'./FeedbackPresence':{useFeedbackPresence:()=>null,useFeedbackScope:()=>scope},'../../lib/feedbackPresence':presenceTools},globals:{...b,...h.globals,CSS:{supports:()=>animate}}}).default;
 const render=()=>{refCalls=0;return Component({open,title:'Discard changes?',message:'Your saved work stays available.',busy,onCancel:()=>{cancelled++;open=false;h.render();},children:earlierCheckbox?h.jsx('label',{children:[h.jsx('input',{type:'checkbox'}),'I understand cancellation ends access.']}):undefined,footer:[h.jsx('button',{'data-feedback-autofocus':explicitAutofocus?true:undefined,children:'Keep my access'}),h.jsx('button',{children:'Next'})]});};h.mount(render);
 return{h,b,element,first,last,checkbox,presenceTools,get cancelled(){return cancelled;},get restored(){return restored;},setBusy(value){busy=value;h.render();},setScope(value){scope=value;h.render();},key(key,shiftKey=false){const event=new Event('keydown',{cancelable:true});Object.defineProperties(event,{key:{value:key},shiftKey:{value:shiftKey}});element.dispatchEvent(event);return event;}};
}
test('shared modal uses browser top layer, traps focus, restores opener and scroll after Escape',async t=>{
 const f=dialogFixture();t.after(()=>f.h.cleanup());assert.equal(f.element.open,true);assert.equal(f.b.document.body.style.overflow,'hidden');assert.equal(f.b.document.activeElement,f.first);f.b.document.activeElement=f.last;assert.equal(f.key('Tab').defaultPrevented,true);assert.equal(f.b.document.activeElement,f.first);f.key('Tab',true);assert.equal(f.b.document.activeElement,f.last);f.key('Escape');await f.h.settle();assert.equal(f.cancelled,1);assert.equal(f.restored,1);assert.equal(f.element.open,false);assert.equal(f.b.document.body.style.overflow,'auto');
});
test('busy dialog ignores Escape and native cancel until action permits dismissal',async t=>{
 const f=dialogFixture({busy:true});t.after(()=>f.h.cleanup());f.key('Escape');assert.equal(f.cancelled,0);let prevented=0;f.h.tree.props.onCancel({preventDefault(){prevented++;}});assert.equal(prevented,1);assert.equal(f.cancelled,0);f.setBusy(false);f.key('Escape');await f.h.settle();assert.equal(f.cancelled,1);
});
test('inside card clicks stay open; true backdrop clicks cancel',async t=>{
 const f=dialogFixture();t.after(()=>f.h.cleanup());f.h.tree.props.onClick({target:f.element,currentTarget:f.element,clientX:50,clientY:50});assert.equal(f.cancelled,0);f.h.tree.props.onClick({target:f.element,currentTarget:f.element,clientX:2,clientY:2});await f.h.settle();assert.equal(f.cancelled,1);
});
test('explicit safe cancellation button receives initial focus before an earlier acknowledgement checkbox',t=>{
 const f=dialogFixture({earlierCheckbox:true});t.after(()=>f.h.cleanup());assert.equal(f.b.document.activeElement,f.first);assert.notEqual(f.b.document.activeElement,f.checkbox);
 const fallback=dialogFixture({earlierCheckbox:true,explicitAutofocus:false});t.after(()=>fallback.h.cleanup());assert.equal(fallback.b.document.activeElement,fallback.checkbox);
});

test('close releases modality, focus and scrolling immediately while retaining only the same inert hidden presentation',async t=>{
 const f=dialogFixture({animate:true});t.after(()=>f.h.cleanup());const original=f.element;f.key('Escape');await f.h.settle();assert.equal(f.cancelled,1);assert.equal(f.element,original);assert.equal(f.element.open,false);assert.equal(f.restored,1);assert.equal(f.b.document.body.style.overflow,'auto');assert.equal(f.h.tree.props['data-feedback-state'],'closing');assert.equal(f.h.tree.props.inert,true);assert.equal(f.h.tree.props['aria-hidden'],true);let blocked=0;f.h.tree.props.onClickCapture({preventDefault(){blocked++;},stopPropagation(){blocked++;}});assert.equal(blocked,2);f.h.run(215);await f.h.settle();assert.equal(f.h.tree,null);
});
test('reduced motion closes immediately and scope invalidation never retains private outgoing content',async t=>{
 const reduced=dialogFixture({animate:true,reducedMotion:true});t.after(()=>reduced.h.cleanup());reduced.key('Escape');await reduced.h.settle();assert.equal(reduced.h.tree,null);assert.equal(reduced.element.open,false);
 const scoped=dialogFixture({animate:true});t.after(()=>scoped.h.cleanup());scoped.key('Escape');await scoped.h.settle();assert.equal(scoped.h.tree.props['data-feedback-state'],'closing');scoped.setScope('another-owner:/billing');await scoped.h.settle();assert.equal(scoped.h.tree,null);assert.equal(scoped.element.open,false);
});

test('cleanup reads authoritative scope even when a discarded child never renders its new owner',()=>{
 const f=dialogFixture({animate:true});f.presenceTools.markFeedbackPresentationScope('owner-b:/billing');f.h.cleanup();assert.equal(f.element.open,false);assert.equal(f.restored,0);assert.equal(f.b.document.body.style.overflow,'auto');
});
