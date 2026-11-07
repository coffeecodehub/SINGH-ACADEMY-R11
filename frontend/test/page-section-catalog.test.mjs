import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const section={_id:'section-one',slug:'mediation',title:'Published mediation section',shortDescription:'Structured learning.',price:27,accessMonths:5};
const presentation=compileModule('../lib/catalogPresentation.ts'),photos=compileModule('../lib/learningPhotos.ts');
function pageFixture(page,{data=[section],loading=false,error='',ownedSection=''}={}){
 const h=hookHarness(),b=browserGlobals(),Card={},ErrorCard={},reads=[];
 const prefix=page==='landing'?'../':'../../';
 const resources={usePublicResource:(path,field)=>{reads.push({path,field});if(field==='sections')return{data,loading,error,retry(){}};return{data:field==='courses'?[{slug:'old-course',title:'Do not sell this course here'}]:[],loading:false,error:'',retry(){}};}};
 const imports={[prefix+'components/content/PageSections']:{default:()=>null},react:h.React,'react/jsx-runtime':h,[prefix+'components/video-reviews/VideoReviews']:{default:()=>null},[prefix+'components/WebsiteContent']:{useWebsiteContent:()=>({}),websiteText:(_w,_k,value)=>value},[prefix+'lib/imageSources']:compileModule('../lib/imageSources.ts'),[prefix+'lib/learningPhotos']:photos,[prefix+'lib/usePublicResource']:resources,[prefix+'lib/useCatalogAccess']:{useCatalogAccess:()=>({checking:false,unavailable:false,sectionAccess:section=>section.slug===ownedSection?{type:'section',label:'Section Access'}:null})},[prefix+'components/AcademyImage']:{default:'img'},[prefix+'components/catalog/CatalogCard']:{default:Card},[prefix+'components/ApiLoadError']:{default:ErrorCard},[prefix+'components/SiteHeader']:{},[prefix+'components/layout/SiteFooter']:{},[prefix+'components/layout/PageShell']:{},[prefix+'components/content/FounderProfile']:{},[prefix+'components/auth/LandingAuthGate']:{}};
 const path=page==='landing'?'../app/page.tsx':`../app/${page}/page.tsx`,Page=compileModule(path,{imports,globals:{...b,...h.globals}}).default;
 h.mount(()=>Page());return{h,reads,Card,ErrorCard};
}
for(const page of ['landing','home','about']){
 test(page+' displays published sections through the intended DTO without course sales cards',t=>{
  const f=pageFixture(page);t.after(()=>f.h.cleanup());const cards=nodes(f.h.tree).filter(node=>node.type===f.Card);
  assert.ok(cards.length>0);for(const card of cards){assert.equal(card.props.kind,'section');assert.equal(card.props.product.slug,'mediation');}
  assert.ok(f.reads.some(read=>read.path===(page==='landing'?'/content/landing':'/sections')&&read.field==='sections'));assert.equal(f.reads.some(read=>read.field==='courses'),false);
  assert.equal(nodes(f.h.tree).some(node=>node.props?.href?.startsWith('/courses/')),false);
 });
 test(page+' shows real loading, empty and error states instead of falling back to courses',()=>{
  for(const state of [{data:[],loading:true,error:''},{data:[],loading:false,error:''},{data:[],loading:false,error:'Sections unavailable'},{data:[section],loading:false,error:'Refresh failed'}]){
   const f=pageFixture(page,state),tree=nodes(f.h.tree);assert.equal(tree.some(node=>node.type===f.Card),state.data.length>0);assert.equal(tree.some(node=>node.type===f.ErrorCard),!!state.error);if(!state.data.length&&!state.error&&!state.loading)assert.match(JSON.stringify(f.h.tree),/No (published )?sections/);f.h.cleanup();
  }
 });
}
function cardFixture(){
 const h=hookHarness(),Image={},Prices={},Card=compileModule('../components/catalog/CatalogCard.tsx',{imports:{'react/jsx-runtime':h,'next/link':{default:'a'},'../AcademyImage':{default:Image},'../../lib/imageSources':compileModule('../lib/imageSources.ts'),'../../lib/catalogPresentation':presentation,'../../lib/money':{money:value=>'$'+value},'./PriceOptions':{default:Prices}}}).default;
 return {Card,Image,Prices};
}
test('landing section cards preserve the original card and pricing structures without guest prices',()=>{
 const f=cardFixture(),product={...section,countryPrices:[{country:'OTHER',price:999}]};
 const card=f.Card({product,kind:'section',variant:'landing',index:2});assert.equal(card.props.className,'card courseLiveCard');assert.ok(nodes(card).some(node=>node.props?.className==='courseLiveImage'));assert.ok(nodes(card).some(node=>node.props?.href==='/sections/mediation'));assert.equal(nodes(card).some(node=>node.type===f.Prices),false);assert.equal(JSON.stringify(card).includes('999'),false);
 const price=f.Card({product,kind:'section',variant:'pricing',index:1});assert.equal(price.props.className,'featured');assert.ok(nodes(price).some(node=>node.props?.className==='button'&&node.props.href==='/sections/mediation'));assert.equal(JSON.stringify(price).includes('999'),false);
});
test('home and about section cards retain original visual structure and show server total per duration',()=>{
 const f=cardFixture(),card=f.Card({product:section,kind:'section',variant:'compact',priority:true});assert.equal(card.props.className,'courseVisualCard');assert.ok(nodes(card).some(node=>node.props?.className==='courseCardBody'));assert.ok(nodes(card).some(node=>node.props?.className==='courseMeta'));assert.ok(nodes(card).some(node=>node.props?.children==='$27'));assert.ok(nodes(card).some(node=>node.props?.children==='5 months access'));
 const image=nodes(card).find(node=>node.type===f.Image);assert.equal(image.props.priority,true);assert.equal(image.props.style.objectFit,'contain');
});
test('landing has two automatic faculty rows and no opt-in motion control',t=>{
 const f=pageFixture('landing');t.after(()=>f.h.cleanup());const tree=nodes(f.h.tree);assert.equal(tree.filter(node=>String(node.props?.className||'').startsWith('teamMarquee')).length,2);assert.equal(tree.some(node=>node.props?.className==='facultyMotionToggle'),false);assert.equal(tree.some(node=>typeof node.props?.children==='string'&&/^(Play|Pause) faculty animation$/.test(node.props.children)),false);
});

for(const page of ['home','about'])test(page+' marks only the owned section as covered',t=>{const f=pageFixture(page,{data:[section,{...section,slug:'other'}],ownedSection:'mediation'});t.after(()=>f.h.cleanup());const cards=nodes(f.h.tree).filter(node=>node.type===f.Card);assert.equal(cards[0].props.covered,true);assert.equal(cards[0].props.coverageLabel,'Section Access');assert.equal(cards[1].props.covered,false);});
