import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
function nodes(tree,type){if(!tree||typeof tree!=='object')return[];return[...(tree.type===type?[tree]:[]),...[tree.props?.children].flat(Infinity).flatMap(value=>nodes(value,type))];}
async function fixture(upload){
 const h=hookHarness(),browser=browserGlobals(),writes=[],calls=[];let notifications=0;function Crop(){}
 const Component=compileModule('../components/cms/CropMediaField.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'next/dynamic':{default:()=>Crop},'../../lib/api':{API_URL:'/api',requestHeaders:()=>new Headers({'X-SA-CSRF':'1'}),portalMediaUrl:x=>x},'../../lib/adminUpload':{adminUpload:async(url,options)=>{calls.push({url,options});return upload(calls.length,options);}}},globals:{...browser,...h.globals}}).default;
 h.mount(()=>Component({label:'Team photo',url:'',onChange:value=>writes.push(value),notify:delta=>notifications+=delta}));await h.settle();const original=new File(['original'],'source.png',{type:'image/png'}),cropped=new File(['cropped'],'crop.jpg',{type:'image/jpeg'});nodes(h.tree,'input')[0].props.onChange({target:{files:[original],value:'source.png'}});await h.settle();
 return{h,calls,writes,original,cropped,crop:()=>nodes(h.tree,Crop)[0],get notifications(){return notifications;}};
}
const response=value=>({ok:true,status:201,json:async()=>({success:true,...value})});
test('crop failure retains the committed original; manual retry transfers only the edited photo',async t=>{
 const f=await fixture(async attempt=>{if(attempt===1)return response({url:'/original',fileId:'original'});if(attempt===2)throw new Error('Crop connection lost; check upload status.');return response({url:'/crop',fileId:'crop'});});t.after(()=>f.h.cleanup());
 await assert.rejects(f.crop().props.onApply(f.cropped,{zoom:1}),/Crop connection/);await f.h.settle();assert.equal(f.writes.length,0);assert.equal(f.calls.length,2);assert.equal(f.crop().props.busy,false);assert.match(f.crop().props.error,/Crop connection/);
 await f.crop().props.onApply(f.cropped,{zoom:1});await f.h.settle();assert.equal(f.calls.length,3);assert.equal(f.calls[2].options.body.get('file').name,'crop.jpg');assert.equal(f.writes.length,1);assert.equal(f.writes[0].originalFileId,'original');assert.equal(f.writes[0].fileId,'crop');assert.equal(f.notifications,0);
});
test('uncertain original result never starts the crop or repeats automatically',async t=>{
 const f=await fixture(async()=>{throw new Error('Original final status is unknown.');});t.after(()=>f.h.cleanup());await assert.rejects(f.crop().props.onApply(f.cropped,{}),/unknown/);await f.h.settle();assert.equal(f.calls.length,1);assert.equal(f.writes.length,0);assert.equal(f.crop().props.busy,false);
});
test('real transfer phases reach the existing crop dialog and unmount aborts without saving',async()=>{
 let cancel;const f=await fixture(async(_attempt,options)=>new Promise((_resolve,reject)=>{options.onProgress({loaded:5,total:10,percent:50,processing:false});options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});cancel=()=>options.signal.aborted;}));
 const pending=f.crop().props.onApply(f.cropped,{});await f.h.settle();assert.equal(f.crop().props.uploadProgress.percent,50);assert.equal(f.crop().props.busy,true);f.h.cleanup();await assert.rejects(pending,{name:'AbortError'});assert.equal(cancel(),true);assert.equal(f.writes.length,0);assert.equal(f.calls.length,1);assert.equal(f.notifications,0);
});
test('existing crop footer exposes actual transfer progress and an indeterminate commit phase',async t=>{
 const h=hookHarness(),browser=browserGlobals();class Image{set src(_value){}}
 const Editor=compileModule('../components/cms/ImageCropEditor.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'react-dom':{createPortal:node=>node}},globals:{...browser,...h.globals,Image}}).default;
 let progress={loaded:58,total:100,percent:58,processing:false};h.mount(()=>Editor({source:'blob:local',busy:true,error:'',onCancel(){},onApply:async()=>{},uploadProgress:progress}));await h.settle();t.after(()=>h.cleanup());assert.equal(nodes(h.tree,'progress')[0].props.value,58);assert.match(nodes(h.tree,'span').find(node=>node.props.role==='status').props.children,/50%/);
 progress={...progress,loaded:100,percent:100,processing:true};h.render();await h.settle();assert.equal(nodes(h.tree,'progress')[0].props.value,undefined);assert.match(nodes(h.tree,'span').find(node=>node.props.role==='status').props.children,/scanning and saving/);
});
