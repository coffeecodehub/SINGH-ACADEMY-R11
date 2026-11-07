import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const rows=tree=>!tree?[]:Array.isArray(tree)?tree.flatMap(rows):typeof tree==='object'?[tree,...rows(tree.props?.children)]:[];
const text=tree=>tree==null?'':Array.isArray(tree)?tree.map(text).join(' '):typeof tree==='object'?text(tree.props?.children):String(tree);
function fixture({pending=false,remove=async()=>({removed:true,removalState:'removed',accessBlocked:true,message:'Student account removed. History retained.'})}={}){
 const h=hookHarness(),calls=[];let items=[{_id:'student-one',name:'Removal Student',email:'student@removal.invalid',country:'US',status:pending?'blocked':'active',removalState:pending?'pending':null}];
 const mod=compileModule('../components/business/AdminStudents.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'./StudentExportButton':{default:'export-students'},'./ui':{Loading:'loading',Notice:'notice',Empty:'empty',day:x=>x,stamp:x=>x,Badge:'badge',Dialog:'dialog'},'../../lib/api':{apiFetch:async(path,options)=>{
  calls.push({path,...options});if(path==='/auth/countries')return{countries:[{code:'US',name:'United States'}]};
  if(options?.method==='DELETE'){const result=await remove();if(result.removed)items=[];else if(result.removalState==='pending')items=items.map(item=>({...item,status:'blocked',removalState:'pending'}));return result;}
  return{items:items.map(item=>({...item})),total:items.length,pageSize:25};
 }}},globals:{...browserGlobals(),...h.globals}});
 h.mount(()=>mod.default());
 const nodes=()=>rows(h.tree),button=label=>nodes().find(node=>node.type==='button'&&node.props.children===label);
 const input=label=>rows(nodes().find(node=>node.type==='label'&&text(node).startsWith(label))).find(node=>['input','textarea'].includes(node.type));
 return{h,calls,nodes,button,input,async ready(){h.run(250);await h.settle();},async open(){(button('Retry removal')||button('Remove student')).props.onClick();await h.settle();},async fill(email='student@removal.invalid'){input('Type student email to confirm').props.onChange({target:{value:email}});input('Reason for removal').props.onChange({target:{value:'Repeated abusive conduct'}});input('Current admin password').props.onChange({target:{value:'SyntheticAdminPassword!'}});await h.settle();},submit:()=>nodes().find(node=>node.type==='form').props.onSubmit({preventDefault(){}})};
}
test('student removal is explicit and the export-all control remains reachable',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.ready();assert.ok(f.nodes().some(node=>node.type==='export-students'));assert.ok(f.button('Remove student'));
 await f.open();assert.ok(f.nodes().some(node=>node.type==='dialog'&&node.props.title==='Remove student account'));assert.equal(f.button('Confirm account removal').props.disabled,true);
 assert.match(text(f.h.tree),/Payment, invoice and audit history will be retained/);assert.equal(f.calls.some(call=>call.method==='DELETE'),false);
});
test('typing a different student email cannot submit removal even by invoking the callback',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.ready();await f.open();await f.fill('other@removal.invalid');await f.submit();await f.h.settle();
 assert.equal(f.calls.some(call=>call.method==='DELETE'),false);assert.match(text(f.h.tree),/Type the student email exactly/);
});
test('confirmed removal sends only the target identity, reason and current admin password',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.ready();await f.open();await f.fill();await f.submit();await f.h.settle();
 const writes=f.calls.filter(call=>call.method==='DELETE');assert.equal(writes.length,1);assert.equal(writes[0].path,'/academy-admin/students/student-one');
 assert.deepEqual(JSON.parse(writes[0].body),{confirmationEmail:'student@removal.invalid',reason:'Repeated abusive conduct',currentPassword:'SyntheticAdminPassword!'});
 assert.equal(f.calls.some(call=>/payments|invoices/.test(call.path)),false);f.h.run(250);await f.h.settle();assert.ok(f.nodes().some(node=>node.type==='empty'));assert.match(text(f.h.tree),/Student account removed/);
});
test('an in-flight removal cannot be double-submitted or hidden by the cancel action',async t=>{
 let finish;const f=fixture({remove:()=>new Promise(resolve=>{finish=resolve;})});t.after(()=>f.h.cleanup());await f.ready();await f.open();await f.fill();
 const first=f.submit(),second=f.submit();f.nodes().find(node=>node.type==='dialog').props.onClose();await f.h.settle();
 assert.equal(f.calls.filter(call=>call.method==='DELETE').length,1);assert.ok(f.nodes().some(node=>node.type==='dialog'));assert.equal(f.button('Removing…').props.disabled,true);
 finish({removed:true,removalState:'removed',accessBlocked:true});await Promise.all([first,second]);await f.h.settle();assert.equal(f.nodes().some(node=>node.type==='dialog'),false);
});
test('unknown provider closure shows a blocked retryable student rather than claiming removal',async t=>{
 const f=fixture({remove:async()=>({removed:false,removalState:'pending',accessBlocked:true})});t.after(()=>f.h.cleanup());await f.ready();await f.open();await f.fill();await f.submit();await f.h.settle();f.h.run(250);await f.h.settle();
 assert.ok(f.button('Retry removal'));assert.equal(f.button('Edit country').props.disabled,true);assert.match(text(f.h.tree),/Provider cancellation is pending/);assert.doesNotMatch(text(f.h.tree),/Student account removed/);
 await f.open();assert.ok(f.nodes().some(node=>node.type==='dialog'&&node.props.title==='Finish student removal'));assert.equal(f.button('Retry billing cancellation').props.disabled,true);
});
test('failed or incomplete removal response retains the confirmation dialog for review',async t=>{
 for(const remove of [async()=>{throw Error('Cancellation status unavailable');},async()=>({removed:false})]){
  const f=fixture({remove});t.after(()=>f.h.cleanup());await f.ready();await f.open();await f.fill();await f.submit();await f.h.settle();
  assert.ok(f.nodes().some(node=>node.type==='dialog'));assert.equal(f.button('Confirm account removal').props.disabled,false);assert.doesNotMatch(text(f.h.tree),/Student account removed/);
 }
});
