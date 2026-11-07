import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const reviewHelpers=compileModule('../lib/videoReviews.ts',{imports:{'./video':{resolveVideoSource:()=>null}}});
function Preview(){}
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'?[t,...nodes(t.props?.children)]:[];
function fixture({ready=true,hosted=false,success=false,items=[]}={}){
 const h=hookHarness(),api=[],uploads=[],saved=[];const status={configurationReady:ready,localDevelopment:!hosted,code:ready?'SCANNER_CHECK_REQUIRED':'UPLOAD_SCAN_CONFIGURATION',message:'Scanner configuration needs attention.'};
 const mod=compileModule('../components/cms/VideoReviewsEditor.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../../lib/api':{API_URL:'/api',portalMediaUrl:u=>u,requestHeaders:()=>new Headers(),apiFetch:async(url,options={})=>{api.push({url,options});if(url.endsWith('upload-status'))return {upload:status};if(options.method==='POST')return {item:{...JSON.parse(options.body),_id:'a'.repeat(24),revision:1}};return {items};}},'../../lib/videoReviews':{...reviewHelpers,reviewVideoSource:u=>u?{kind:'native'}:null},'./Fields':{Field:()=>null,Check:()=>null,useDirty:()=>({dirty:true,markSaved(){}})},'../content/PageSectionVideo':{default:Preview},'../../lib/feedback':{feedback:{confirm:async()=>true}},'../feedback/FeedbackNotice':{default:'notice'},'./AdminConfirm':{adminSaved:m=>saved.push(m)}},globals:{...browserGlobals(),setInterval:()=>1,clearInterval:()=>{},fetch:async(url,options)=>{uploads.push({url,options});return {ok:success,status:success?201:503,json:async()=>success?{success:true,url:'/api/media/'+'b'.repeat(24),fileId:'b'.repeat(24)}:{success:false,code:'UPLOAD_SCAN_UNAVAILABLE',requestId:'safe-fixture-id',message:'The configured scanner could not be reached.'}};}}});
 h.mount(()=>mod.default({}));const find=label=>nodes(h.tree).find(n=>n.props?.label===label),choose=()=>nodes(h.tree).find(n=>n.type==='input'&&n.props?.type==='file').props.onChange({target:{files:[new File(['video-fixture'], 'original.webm',{type:'video/webm'})],value:'original.webm'}});
 return {h,api,uploads,saved,find,choose};
}
test('known scanner configuration failure is explained before sending original bytes; draft text is retained',async t=>{
 const f=fixture({ready:false});t.after(()=>f.h.cleanup());await f.h.settle();f.find('Review title').props.onChange('My retained title');f.find('Review description').props.onChange('My retained description');await f.h.settle();f.choose();await f.h.settle();assert.equal(f.uploads.length,0);assert.equal(f.find('Review title').props.value,'My retained title');assert.equal(f.find('Review description').props.value,'My retained description');assert.ok(nodes(f.h.tree).some(n=>n.type==='code'&&n.props.children==='npm.cmd run setup'));assert.equal(f.saved.length,0);
});
test('actual scanner503 is truthful/actionable and never turns into an uploaded or published review',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();f.find('Review title').props.onChange('Still my original title');await f.h.settle();f.choose();await f.h.settle();assert.equal(f.uploads.length,1);assert.equal(f.find('Video or social URL').props.value,'');assert.equal(f.find('Review title').props.value,'Still my original title');assert.ok(nodes(f.h.tree).some(n=>n.type==='code'));assert.equal(f.api.filter(c=>c.options.method==='POST').length,0);assert.equal(f.saved.length,0);assert.equal(f.find('Review title').props.disabled,false);assert.equal(nodes(f.h.tree).some(n=>n.type==='button'&&n.props.children==='Cancel video upload'),false);assert.equal(nodes(f.h.tree).some(n=>n.type==='progress'),false);
});
test('hosted scanner error never offers disabling required scanning; successful upload does not publish until explicit save',async t=>{
 const blocked=fixture({hosted:true});t.after(()=>blocked.h.cleanup());await blocked.h.settle();blocked.choose();await blocked.h.settle();assert.equal(nodes(blocked.h.tree).some(n=>n.type==='code'),false);
 const good=fixture({success:true});t.after(()=>good.h.cleanup());await good.h.settle();good.find('Review title').props.onChange('A full length original');await good.h.settle();good.choose();await good.h.settle();assert.equal(good.find('Video or social URL').props.value,'/api/media/'+'b'.repeat(24));assert.equal(good.saved.length,0);const save=nodes(good.h.tree).find(n=>n.type==='button'&&n.props.children==='Save video review');save.props.onClick();await good.h.settle();assert.equal(good.saved.length,1);assert.equal(good.api.filter(c=>c.options.method==='POST').length,1);
});
test('an uploaded review immediately exposes its automatic fifteen-second preview without a manual preview toggle',async t=>{
 const f=fixture({success:true});t.after(()=>f.h.cleanup());await f.h.settle();f.choose();await f.h.settle();const preview=nodes(f.h.tree).find(node=>node.type===Preview);
 assert.ok(preview);assert.equal(preview.props.seconds,15);assert.equal(preview.props.url,'/api/media/'+'b'.repeat(24));assert.equal(nodes(f.h.tree).some(node=>node.type==='summary'&&node.props.children==='Full review preview'),false);
});
test('opening a legacy short draft normalizes its editable teaser without changing stored records',async t=>{
 const legacy={_id:'c'.repeat(24),title:'Legacy review',description:'Retained copy',videoUrl:'/api/media/'+'b'.repeat(24),videoFileId:'b'.repeat(24),teaserSeconds:10,revision:1};const f=fixture({items:[legacy]});t.after(()=>f.h.cleanup());await f.h.settle();
 const edit=nodes(f.h.tree).find(node=>node.type==='button'&&[node.props.children].flat().join('')==='Edit Legacy review');edit.props.onClick();await f.h.settle();assert.equal(f.find('Preview loop (seconds)').props.value,15);assert.equal(legacy.teaserSeconds,10);assert.equal(f.api.filter(call=>call.options.method==='POST'||call.options.method==='PATCH').length,0);
});
