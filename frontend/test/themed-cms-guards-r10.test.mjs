import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';

const nodes=tree=>!tree?[]:Array.isArray(tree)?tree.flatMap(nodes):typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
function dirtyFixture(){
 const h=hookHarness(),listeners=new Map(),pending=[];let value={title:'saved'},blocking=false,present=true;
 const window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 const {useDirty}=compileModule('../components/cms/Fields.tsx',{imports:{react:{...h.React,createContext:()=>({Provider:'provider'})},'react/jsx-runtime':h,'../AcademyImage':{default:'image'},'./CropMediaField':{default:'crop'},'../../lib/api':{},'../../lib/adminUpload':{},'../../lib/feedback':{feedback:{confirm:options=>new Promise(resolve=>pending.push({options,resolve}))}},'../feedback/FeedbackNotice':{default:'notice'},'../feedback/FeedbackPresence':{useFeedbackPresence:()=>({present})}},globals:{window}});
 h.mount(()=>useDirty(value,undefined,blocking));
 return {h,pending,listeners,edit(title){value={title};h.render();},block(next){blocking=next;h.render();},setPresent(next){present=next;h.render();},get state(){return h.tree;}};
}

test('Cancel preserves an edited CMS draft and its native unload protection',async t=>{
 const f=dirtyFixture();t.after(()=>f.h.cleanup());f.edit('unsaved draft');
 const closing=f.state.mayClose();assert.equal(f.pending.length,1);assert.equal(f.pending[0].options.message,'Discard unsaved changes?');f.pending.shift().resolve(false);
 assert.equal(await closing,false);assert.equal(f.state.dirty,true);
 const event={prevented:false,preventDefault(){this.prevented=true;},returnValue:undefined};f.listeners.get('beforeunload')(event);assert.equal(event.prevented,true);assert.equal(event.returnValue,'');
});

test('Confirm approves only the unchanged CMS draft; a saved form needs no dialog',async t=>{
 const f=dirtyFixture();t.after(()=>f.h.cleanup());assert.equal(await f.state.mayClose(),true);assert.equal(f.pending.length,0);
 f.edit('unsaved draft');const closing=f.state.mayClose();f.pending.shift().resolve(true);assert.equal(await closing,true);assert.equal(f.state.dirty,true);
});

test('approval of an older CMS draft cannot discard text entered while confirmation was pending',async t=>{
 const f=dirtyFixture();t.after(()=>f.h.cleanup());f.edit('first draft');const closing=f.state.mayClose();f.edit('newer draft');f.pending.shift().resolve(true);assert.equal(await closing,false);assert.equal(f.state.dirty,true);
});

test('an active upload or save blocks CMS closing before and after delayed confirmation',async t=>{
 const f=dirtyFixture();t.after(()=>f.h.cleanup());f.edit('draft');f.block(true);assert.equal(await f.state.mayClose(),false);assert.equal(f.pending.length,0);
 f.block(false);const closing=f.state.mayClose();f.block(true);f.pending.shift().resolve(true);assert.equal(await closing,false);
});

test('a detached CMS editor cannot be closed by a late confirmation',async()=>{
 const f=dirtyFixture();f.edit('draft');const closing=f.state.mayClose();f.h.cleanup();f.pending.shift().resolve(true);assert.equal(await closing,false);assert.equal(f.listeners.has('beforeunload'),false);
});

async function reviewsFixture(){
 const h=hookHarness(),pending=[],writes=[],browser=browserGlobals();let reads=0;
 const Component=compileModule('../components/business/AdminReviews.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'./AdminExportButton':{default:'export'},'../../lib/api':{apiFetch:async(path,options={})=>{if(options.method){writes.push({path,options});return {};}return {items:[{_id:'review-one',name:'Synthetic reviewer',rating:5,message:'Synthetic valid review text',status:'pending',revision:reads++}],total:1};}},'../../lib/feedback':{feedback:{confirm:options=>new Promise(resolve=>pending.push({options,resolve}))}},'./ui':{Badge:'badge',Dialog:'dialog',Empty:'empty',Loading:'loading',Notice:'notice',stamp:()=>''}},globals:{...browser,...h.globals}}).default;
 h.mount(()=>Component({}));h.run(180);await h.settle();
 return {h,pending,writes,button(label){return nodes(h.tree).find(node=>node.type==='button'&&node.props.children===label);},async refresh(){this.button('Refresh').props.onClick();await h.settle();h.run(180);await h.settle();}};
}

test('review moderation waits for explicit confirmation and repeated clicks create one dialog',async t=>{
 const f=await reviewsFixture();t.after(()=>f.h.cleanup());const approve=f.button('Approve').props.onClick;approve();approve();assert.equal(f.pending.length,1);assert.equal(f.writes.length,0);f.pending.shift().resolve(false);await f.h.settle();assert.equal(f.writes.length,0);
 f.button('Approve').props.onClick();f.pending.shift().resolve(true);await f.h.settle();assert.equal(f.writes.length,1);assert.equal(f.writes[0].path,'/admin/reviews/review-one/status');assert.equal(JSON.parse(f.writes[0].options.body).status,'approved');
});

test('a refreshed review record invalidates an older moderation confirmation',async t=>{
 const f=await reviewsFixture();t.after(()=>f.h.cleanup());f.button('Approve').props.onClick();await f.refresh();f.pending.shift().resolve(true);await f.h.settle();assert.equal(f.writes.length,0);
});

test('late deletion confirmation cannot delete a closed review editor',async t=>{
 const f=await reviewsFixture();t.after(()=>f.h.cleanup());f.button('Edit').props.onClick();await f.h.settle();f.button('Delete review').props.onClick();f.button('Cancel').props.onClick();await f.h.settle();f.pending.shift().resolve(true);await f.h.settle();assert.equal(f.writes.length,0);
});

test('an unmounted review owner rejects its outstanding moderation confirmation',async()=>{
 const f=await reviewsFixture();f.button('Approve').props.onClick();f.h.cleanup();f.pending.shift().resolve(true);await f.h.settle();assert.equal(f.writes.length,0);
});

test('a visually retained closing editor cannot extend its dirty navigation or unload guard',async t=>{
 const f=dirtyFixture();t.after(()=>f.h.cleanup());f.edit('discarded editor draft');assert.equal(f.state.dirty,true);f.setPresent(false);assert.equal(f.state.dirty,false);assert.equal(await f.state.mayClose(),false);assert.equal(f.pending.length,0);const event={prevented:false,preventDefault(){this.prevented=true;},returnValue:undefined};f.listeners.get('beforeunload')(event);assert.equal(event.prevented,false);
});
