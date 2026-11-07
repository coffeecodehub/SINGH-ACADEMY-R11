import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'?[t,...nodes(t.props?.children),...nodes(t.props?.footer),...nodes(t.props?.message)]:[];
const text=t=>t==null||typeof t==='boolean'?'':Array.isArray(t)?t.map(text).join(''):typeof t==='object'?text(t.props?.children)+text(t.props?.footer)+text(t.props?.message):String(t);
function fixture({action='enable',subject,open=true}={}){
 const h=hookHarness(),b=browserGlobals();let confirmed=0,cancelled=0;
 const Component=compileModule('../components/billing/BillingActionConfirmation.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../feedback/FeedbackDialog':{default:'shared-dialog'}},globals:{...b,...h.globals}}).default;
 const render=()=>Component({open,action,title:'Cross-cultural negotiation',subject,message:'Your confirmed paid access remains until its end date.',onCancel:()=>{cancelled++;open=false;h.render();},onConfirm:()=>confirmed++});h.mount(render);
 return{h,get confirmed(){return confirmed;},get cancelled(){return cancelled;},button:name=>nodes(h.tree).find(n=>n.type==='button'&&text(n)===name),setOpen(value){open=value;h.render();}};
}
for(const action of ['enable','disable','cancel'])test(action+' delegates selected subject and consent to the shared accessible modal',async t=>{
 const f=fixture({action});t.after(()=>f.h.cleanup());await f.h.settle();assert.equal(f.h.tree.type,'shared-dialog');assert.match(f.h.tree.props.title,new RegExp('Are you sure you want to '+action+' this course'));assert.match(text(f.h.tree),/Cross-cultural negotiation/);assert.match(text(f.h.tree),/paid access remains until its end date/);assert.equal(f.confirmed,0);assert.equal(f.cancelled,0);
});
test('automatic renewal wording remains separate from paid access cancellation',async t=>{const f=fixture({action:'disable',subject:'automatic renewal'});t.after(()=>f.h.cleanup());assert.match(f.h.tree.props.title,/disable automatic renewal/);assert.doesNotMatch(f.h.tree.props.title,/disable this course/);assert.match(text(f.h.tree),/paid access remains/);});
test('only Confirm submits and repeated clicks authorize one action',async t=>{const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();const confirm=f.button('Confirm');confirm.props.onClick();confirm.props.onClick();await f.h.settle();assert.equal(f.confirmed,1);assert.equal(f.button('Confirming…').props.disabled,true);assert.equal(f.button('Cancel').props.disabled,true);f.h.tree.props.onCancel();assert.equal(f.cancelled,0);});
test('Cancel and shared Escape/backdrop callback never submit billing',async t=>{for(const callback of ['button','shared']){const f=fixture();t.after(()=>f.h.cleanup());if(callback==='button')f.button('Cancel').props.onClick();else f.h.tree.props.onCancel();await f.h.settle();assert.equal(f.confirmed,0);assert.equal(f.cancelled,1);assert.equal(f.h.tree.props.open,false);}});
test('reopening clears submission lock without triggering a provider action',async t=>{const f=fixture({open:false});t.after(()=>f.h.cleanup());assert.equal(f.h.tree.props.open,false);f.setOpen(true);await f.h.settle();f.button('Confirm').props.onClick();await f.h.settle();assert.equal(f.confirmed,1);f.setOpen(false);f.setOpen(true);await f.h.settle();assert.ok(f.button('Confirm'));assert.equal(f.confirmed,1);f.button('Confirm').props.onClick();assert.equal(f.confirmed,2);});
