/** Pure normalization and real Team-page callback checks, not a browser/network test. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {compileModule,browserGlobals} from './compile.mjs';import {hookHarness} from './hooks.mjs';
const categories=compileModule('../lib/teamCategories.ts');
const normalize=x=>JSON.parse(JSON.stringify(x));
function nodes(t,type){if(!t||typeof t!=='object')return[];return[...(t.type===type?[t]:[]),...[t.props?.children].flat(Infinity).flatMap(x=>nodes(x,type))];}
test('frontend team category normalization preserves legacy and multiple memberships',()=>{
 assert.deepEqual(normalize(categories.teamCategories({category:'founder'})),['founder']);
 assert.deepEqual(normalize(categories.teamCategories({category:'core',categories:['board','founder','faculty']})),['founder','faculty','board']);
 assert.equal(categories.teamCategoryText({categories:['board','faculty']}),'Faculty · Board of Advisors');
});
test('same team member appears once in All and in each selected public tab',async t=>{
 const h=hookHarness(),members=[{_id:'a',name:'Multiple',category:'founder',categories:['founder','faculty','board'],role:'Mediator'},{_id:'b',name:'Core',category:'core'}];
 const page=compileModule('../app/team/page.tsx',{imports:{
  react:h.React,'react/jsx-runtime':h,'../../components/WebsiteContent':{useWebsiteContent:()=>({}),websiteText:(_w,_k,f)=>f},
  '../../lib/teamCategories':categories,'../../lib/imageSources':compileModule('../lib/imageSources.ts'),
  '../../components/AcademyImage':{default:'img'},'../../lib/usePublicResource':{usePublicResource:()=>({data:members,loading:false,error:''})},
  '../../components/ApiLoadError':{default:()=>null},'../../components/layout/PageShell':{default:'main'},'../../lib/api':{apiFetch:()=>{throw Error('No mutating API expected');}}
 },globals:{...browserGlobals(),...h.globals}});
 h.mount(()=>page.default());t.after(()=>h.cleanup());
 assert.equal(nodes(h.tree,'article').length,2);
 for(const name of ['The Founder','Faculty','Board of Advisors']){
  nodes(h.tree,'button').find(x=>x.props.children===name).props.onClick();await h.settle();
  assert.equal(nodes(h.tree,'article').length,1);assert.equal(nodes(h.tree,'h3')[0].props.children,'Multiple');
 }
 nodes(h.tree,'button').find(x=>x.props.children==='Core Team').props.onClick();await h.settle();assert.equal(nodes(h.tree,'h3')[0].props.children,'Core');
 nodes(h.tree,'button').find(x=>x.props.children==='All').props.onClick();await h.settle();assert.equal(nodes(h.tree,'article').length,2);
});
test('admin supports four named checkboxes with at least one team category, not authentication roles',()=>{
 const source=fs.readFileSync(new URL('../components/cms/ContentCollection.tsx',import.meta.url),'utf8');
 assert.match(source,/TEAM_CATEGORIES\.map/);assert.match(source,/type="checkbox"/);assert.match(source,/name="teamCategories"/);
 assert.match(source,/Select at least one team category/);assert.doesNotMatch(source,/REQUIRE_ADMIN_MFA|role:'super_admin'/);
});
test('both animated team tracks eagerly request sized images without changing the public stylesheet',()=>{
 const source=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.equal((source.match(/loading="eager" sizes=\{TEAM_MARQUEE_SIZES\}/g)||[]).length,2);
 assert.equal(compileModule('../lib/imageSources.ts').TEAM_MARQUEE_SIZES,'(max-width: 560px) 210px, (max-width: 900px) 230px, 290px');
});

function editorFixture(initial){
 const list=hookHarness(),edit=hookHarness();let active=list;const calls=[];
 const react=Object.fromEntries(Object.keys(list.React).map(name=>[name,(...args)=>active.React[name](...args)]));
 const field={Check:'check-field',Field:'field',MediaField:'media-field',UploadContext:{Provider:'upload-provider'},UploadFieldset:'fieldset',useDirty:()=>({mayClose:()=>true}),clean:value=>{const{_id,...body}=value;return body;}};
 const component=compileModule('../components/cms/ContentCollection.tsx',{imports:{
  react,'react/jsx-runtime':list,'next/dynamic':{default:()=>()=>null},
  '../../lib/teamCategories':categories,'../../lib/events':compileModule('../lib/events.ts'),'../AcademyImage':{default:'img'},
  '../../lib/api':{portalMediaUrl:x=>x,apiFetch:async(path,options)=>{if(options?.method){calls.push({path,body:JSON.parse(options.body)});return{success:true};}return{items:initial?[initial]:[],total:initial?1:0};}},
  './Fields':field,'./AdminConfirm':{default:'admin-confirm',adminSaved:()=>{}}
 },globals:{...browserGlobals(),setTimeout:(fn,ms)=>active.globals.setTimeout(fn,ms),clearTimeout:id=>active.globals.clearTimeout(id)}});
 list.mount(()=>component.default({kind:'Team'}));
 return{list,edit,calls,async open(){
  list.run(200);await list.settle();
  const button=nodes(list.tree,'button').find(n=>initial?n.props.children==='Edit':String(n.props.children).includes('Add '));
  assert.ok(button);button.props.onClick();await list.settle();let node=list.tree;
  while(node.type?.name==='FeedbackPresence')node=node.props.children;
  assert.equal(typeof node.type,'function');active=edit;edit.mount(()=>node.type(node.props));await edit.settle();
 },checkbox(category){return nodes(edit.tree,'input').find(n=>n.props.value===category);},async toggle(category,checked){this.checkbox(category).props.onChange({target:{checked}});await edit.settle();},
 cleanup(){list.cleanup();edit.cleanup();}};
}
for(const initial of [null,{_id:'legacy',name:'Legacy',category:'board',role:'Advisor'}])
test(`actual admin editor selects multiple categories and preserves legacy selection (${initial?'legacy':'new'})`,async t=>{
 const f=editorFixture(initial);t.after(()=>f.cleanup());await f.open();
 assert.equal(f.checkbox(initial?'board':'faculty').props.checked,true);
 for(const category of ['founder','faculty','board','core'])await f.toggle(category,true);
 for(const category of ['founder','faculty','board','core'])assert.equal(f.checkbox(category).props.checked,true);
 const confirmation=nodes(f.edit.tree,'admin-confirm')[0];await confirmation.props.onConfirm();await f.edit.settle();
 assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].body.categories,['founder','faculty','board','core']);assert.equal(f.calls[0].body.category,'founder');
 assert.equal(f.calls[0].path,initial?'/admin/content/team/legacy':'/admin/content/team');
});
test('actual admin editor cannot save zero team categories by unchecking its last selection',async t=>{
 const f=editorFixture(null);t.after(()=>f.cleanup());await f.open();await f.toggle('faculty',false);
 assert.equal(f.checkbox('faculty').props.checked,true);
 assert.ok(JSON.stringify(f.edit.tree).includes('Select at least one team category.'));
});
