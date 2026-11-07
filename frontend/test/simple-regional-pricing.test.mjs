import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';

const pricing=compileModule('../components/cms/regionalPricing.ts');
const countries=[{code:'US',name:'United States'},{code:'PK',name:'Pakistan'},{code:'DE',name:'Germany'},{code:'BR',name:'Brazil'}];
function feedbackRuntime(h){const jsx=(type,props,key)=>typeof type==='function'&&type.name==='FeedbackNotice'?type(props):h.jsx(type,props,key);return {...h,jsx,jsxs:jsx};}
const nodes=tree=>!tree?[]:Array.isArray(tree)?tree.flatMap(nodes):typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
const text=tree=>tree==null||typeof tree==='boolean'?'':Array.isArray(tree)?tree.map(text).join(' '):typeof tree==='object'?text(tree.props?.children):String(tree);
const plain=value=>JSON.parse(JSON.stringify(value));
const initial=()=>({price:100,accessMonths:1,countryPrices:[{country:'PK',price:25}],pricing:[
 {key:'six-stable',label:'Six months',price:500,durationMonths:6,countryPrices:[{country:'PK',price:120}],features:['Stored benefit'],billing:'one-time',compareAtPrice:600},
 {key:'twelve-stable',label:'Twelve months',price:900,durationMonths:12,countryPrices:[{country:'BR',price:300}]}
]});
function editor({value=initial(),disabled=false,fetchCountries=async()=>({countries})}={}){
 const h=hookHarness(),changes=[],calls=[];let draft=structuredClone(value);
 const mod=compileModule('../components/cms/RegionalPricingEditor.tsx',{imports:{react:h.React,'react/jsx-runtime':feedbackRuntime(h),'../../lib/api':{apiFetch:async(path,options)=>{calls.push({path,options});return fetchCountries();}},'./regionalPricing':pricing},globals:{...browserGlobals(),...h.globals}});
 h.mount(()=>mod.default({value:draft,disabled,onChange:part=>{changes.push(part);draft={...draft,...part};h.render();}}));
 return{h,mod,changes,calls,get draft(){return draft;},nodes:()=>nodes(h.tree),countryTerms:()=>nodes(h.tree).filter(node=>node.type===mod.CountryPrices)};
}

test('default and additional terms show the same country-price flow without bulk or feature controls',async t=>{
 const f=editor();t.after(()=>f.h.cleanup());await f.h.settle();
 assert.deepEqual(f.countryTerms().map(node=>node.props.label),['Default term','Six months','Twelve months']);
 assert.ok(f.countryTerms().every(node=>node.props.countries.length===4));assert.equal(f.countryTerms()[0].props.value[0].price,25);
 assert.equal(f.nodes().filter(node=>node.type==='input'&&node.props.type==='number').length,6);
 assert.equal(f.nodes().some(node=>node.type==='textarea'||node.type==='fieldset'||node.type==='details'),false);
 assert.doesNotMatch(text(f.h.tree),/Review region|Apply region|Features \(one per line\)|Quick add/);
 assert.match(text(f.h.tree),/choose the default term or any additional term/);assert.equal(f.changes.length,0);
});

test('base and multiple term country edits stay independent and serialize every country map',async t=>{
 const f=editor();t.after(()=>f.h.cleanup());await f.h.settle();
 f.countryTerms()[0].props.onChange([{country:'PK',price:'30'},{country:'DE',price:'75.50'}]);
 f.countryTerms()[1].props.onChange([{country:'PK',price:'150'}]);
 const body=plain(pricing.normalizeRegionalPricing(f.draft));
 assert.equal(body.includeBaseOffer,true);assert.equal(body.price,100);assert.equal(body.accessMonths,1);
 assert.deepEqual(body.countryPrices,[{country:'PK',price:30},{country:'DE',price:75.5}]);
 assert.deepEqual(body.pricing[0].countryPrices,[{country:'PK',price:150}]);assert.deepEqual(body.pricing[1].countryPrices,[{country:'BR',price:300}]);
 assert.equal(body.pricing[0].key,'six-stable');assert.equal(body.pricing[1].key,'twelve-stable');
 assert.deepEqual(body.pricing[0].features,['Stored benefit']);assert.equal(body.pricing[0].billing,'one-time');assert.equal(body.pricing[0].compareAtPrice,600);
});

test('an existing USA override stays in sync when editing the simple default price',async t=>{
 const value=initial();value.countryPrices.unshift({country:'US',price:95});const f=editor({value});t.after(()=>f.h.cleanup());await f.h.settle();
 const defaultPrice=f.nodes().find(node=>node.type==='input'&&node.props.type==='number'&&node.props.value===95);assert.ok(defaultPrice);defaultPrice.props.onChange({target:{value:'80'}});
 assert.equal(f.draft.price,'80');assert.equal(f.draft.countryPrices.find(row=>row.country==='US').price,'80');assert.equal(f.draft.countryPrices.find(row=>row.country==='PK').price,25);
 f.countryTerms()[0].props.onChange([{country:'PK',price:25}]);assert.equal(f.draft.price,'80');assert.equal(pricing.normalizeRegionalPricing(f.draft).price,80);
});

test('adding and completing another month option never invents a price or changes existing terms',async t=>{
 const f=editor();t.after(()=>f.h.cleanup());await f.h.settle();const before=structuredClone(f.draft);
 f.nodes().find(node=>node.type==='button'&&text(node)==='＋ Add another term').props.onClick();
 assert.deepEqual(plain(f.draft.pricing.slice(0,2)),before.pricing);assert.deepEqual(plain(f.draft.pricing[2]),{label:'',price:'',durationMonths:1,countryPrices:[]});assert.equal(f.draft.price,before.price);
 assert.throws(()=>pricing.normalizeRegionalPricing(f.draft),/needs a label/);
 let added=f.nodes().filter(node=>node.type==='article').at(-1);nodes(added).find(node=>node.type==='input'&&node.props.type!=='number').props.onChange({target:{value:'Seventeen months'}});
 added=f.nodes().filter(node=>node.type==='article').at(-1);const numberFields=nodes(added).filter(node=>node.type==='input'&&node.props.type==='number');numberFields[0].props.onChange({target:{value:'17'}});
 added=f.nodes().filter(node=>node.type==='article').at(-1);nodes(added).filter(node=>node.type==='input'&&node.props.type==='number')[1].props.onChange({target:{value:'170.25'}});
 f.countryTerms().at(-1).props.onChange([{country:'BR',price:'65'}]);const body=plain(pricing.normalizeRegionalPricing(f.draft));
 assert.deepEqual(body.pricing[2],{label:'Seventeen months',currency:'USD',price:170.25,durationMonths:17,countryPrices:[{country:'BR',price:65}]});assert.deepEqual(body.pricing.slice(0,2),before.pricing);
});

test('removing one additional term retains the default and other saved term data',async t=>{
 const f=editor();t.after(()=>f.h.cleanup());await f.h.settle();const before=structuredClone(f.draft);
 f.nodes().filter(node=>node.type==='button'&&text(node)==='Remove access term')[0].props.onClick();
 assert.equal(f.draft.price,before.price);assert.deepEqual(plain(f.draft.countryPrices),before.countryPrices);assert.deepEqual(plain(f.draft.pricing),[before.pricing[1]]);
});

test('disabled editor passes its lock to every country section and disables direct term edits',async t=>{
 const f=editor({disabled:true});t.after(()=>f.h.cleanup());await f.h.settle();assert.ok(f.countryTerms().every(node=>node.props.disabled));assert.ok(f.nodes().filter(node=>['input','button'].includes(node.type)).every(node=>node.props.disabled));
 const h=hookHarness();t.after(()=>h.cleanup());const mod=compileModule('../components/cms/RegionalPricingEditor.tsx',{imports:{react:h.React,'react/jsx-runtime':feedbackRuntime(h),'../../lib/api':{},'./regionalPricing':pricing},globals:{...browserGlobals(),...h.globals}});
 h.mount(()=>mod.CountryPrices({value:[{country:'PK',price:25}],label:'Default term',countries,disabled:true,onChange(){throw Error('No edit expected');}}));
 assert.ok(nodes(h.tree).filter(node=>['input','select','button'].includes(node.type)).every(node=>node.props.disabled));
});

test('country loading failures can be retried without dropping the saved prices',async t=>{
 let count=0;const f=editor({fetchCountries:async()=>{if(++count===1)throw Error('Country service unavailable');return{countries};}});t.after(()=>f.h.cleanup());await f.h.settle();
 assert.ok(f.nodes().some(node=>node.props?.role==='alert'&&text(node).includes('Country service unavailable')));assert.equal(f.draft.countryPrices[0].price,25);
 f.nodes().find(node=>node.type==='button'&&text(node)==='Retry country list').props.onClick();await f.h.settle();
 assert.equal(f.calls.length,2);assert.ok(f.calls.every(call=>call.path==='/auth/countries'));assert.equal(f.nodes().some(node=>node.props?.role==='alert'),false);assert.equal(f.countryTerms()[0].props.countries.length,4);assert.equal(f.changes.length,0);
});

test('normalization retains explicit zero prices and max terms but rejects reserved default keys',()=>{
 const body=plain(pricing.normalizeRegionalPricing({price:'0',accessMonths:'120',countryPrices:[{country:'PK',price:'0'},{country:'DE',price:''}],pricing:[{key:'long',label:'Long term',price:'12.50',durationMonths:119,countryPrices:[{country:'BR',price:'2.25'}]}]}));
 assert.equal(body.price,0);assert.equal(body.accessMonths,120);assert.deepEqual(body.countryPrices,[{country:'PK',price:0}]);assert.equal(body.pricing[0].durationMonths,119);
 const legacy={price:20,accessMonths:1,pricing:[{key:'base',label:'Legacy option',price:15,durationMonths:2}]};assert.throws(()=>pricing.normalizeRegionalPricing(legacy),/reserved for the default term/);assert.equal(legacy.pricing[0].key,'base');
 assert.throws(()=>pricing.normalizeRegionalPricing({price:20,accessMonths:1,countryPrices:[{country:'',price:5}]}),/Select a country/);
});

for(const kind of ['course','section'])test(kind+' save sends the base country total and every additional term through the actual editor',async t=>{
 const h=hookHarness(),calls=[],value={...initial(),title:'Configured product',slug:'configured-product',published:false},fields={Check:'check',Field:'field',MoneyField:'money',MediaField:'media',UploadContext:{Provider:'uploads'},UploadFieldset:'fieldset',clean:x=>x,useDirty:()=>({dirty:false,markSaved(){},mayClose:()=>true})};let saved=0;
 t.after(()=>h.cleanup());
 const mod=compileModule(kind==='course'?'../components/cms/CourseEditor.tsx':'../components/cms/SectionManager.tsx',{imports:{react:h.React,'react/jsx-runtime':feedbackRuntime(h),'../../lib/api':{portalMediaUrl:x=>x,apiFetch:async(path,options)=>{calls.push({path,options});if(!options?.method)return{items:[],modules:[]};return{success:true,item:{...JSON.parse(options.body),_id:'saved-product'}};}},'../AcademyImage':{default:'img'},'./LessonEditor':{default:'lesson'},'./Fields':fields,'./AdminConfirm':{default:'confirm',adminSaved(){}},'./RegionalPricingEditor':{default:'pricing-editor'},'./regionalPricing':pricing},globals:{...browserGlobals(),...h.globals}});
 const Component=kind==='course'?mod.default:mod.SectionEditor;h.mount(()=>Component({initial:value,onClose(){},onSaved(){saved++;}}));await h.settle();
 const confirmation=nodes(h.tree).find(node=>node.type==='confirm'&&node.props.title===(kind==='course'?'Save course changes?':'Save section draft?'));assert.ok(confirmation);await confirmation.props.onConfirm();await h.settle();
 const writes=calls.filter(call=>call.options?.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].path,kind==='course'?'/admin/content/courses':'/admin/sections');const body=JSON.parse(writes[0].options.body);
 assert.equal(body.includeBaseOffer,true);assert.equal(body.currency,'USD');assert.equal(body.accessMonths,1);assert.equal(body.price,100);assert.deepEqual(body.countryPrices,[{country:'PK',price:25}]);
 assert.equal(body.pricing.length,2);assert.deepEqual(body.pricing.map(option=>option.key),['six-stable','twelve-stable']);assert.deepEqual(body.pricing[0].countryPrices,[{country:'PK',price:120}]);assert.deepEqual(body.pricing[1].countryPrices,[{country:'BR',price:300}]);assert.deepEqual(body.pricing[0].features,['Stored benefit']);assert.equal(body.published,false);assert.equal(saved,1);
});
