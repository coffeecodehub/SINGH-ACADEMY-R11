import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
import {COUNTRIES} from '../../backend/src/utils/countries.js';
import {countryPrices as validateServerCountryPrices} from '../../backend/src/utils/cmsValidation.js';
const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime');
function feedbackRuntime(h){const jsx=(type,props,key)=>typeof type==='function'&&type.name==='FeedbackNotice'?type(props):h.jsx(type,props,key);return {...h,jsx,jsxs:jsx};}
const rows=tree=>!tree?[]:Array.isArray(tree)?tree.flatMap(rows):typeof tree==='object'?[tree,...rows(tree.props?.children)]:[];
const pricing=compileModule('../components/cms/regionalPricing.ts');
const plain=value=>JSON.parse(JSON.stringify(value));

test('admin prices retain a chosen nine-month USD total and exact country overrides',()=>{
 const result=pricing.normalizeRegionalPricing({price:'100.50',accessMonths:'9',pricing:[{key:'term-nine',label:'Nine months',price:'100.50',durationMonths:'9',countryPrices:[{country:'pk',price:'35.95'},{country:'US',price:''}]}]});
 assert.deepEqual(plain(result),{currency:'USD',includeBaseOffer:true,price:100.5,accessMonths:9,countryPrices:[],pricing:[{key:'term-nine',label:'Nine months',price:100.5,durationMonths:9,countryPrices:[{country:'PK',price:35.95}]}]});
});
test('legacy USA overrides become the canonical default without seeding or replacing other country totals',()=>{
 const result=pricing.normalizeRegionalPricing({price:'170',accessMonths:'17',countryPrices:[{country:'US',price:'120'}],pricing:[{label:'Seventeen months',price:'170',durationMonths:'17',countryPrices:[{country:'US',price:'120'},{country:'DE',price:'80'},{country:'PK',price:'30'}]}]});
 assert.equal(result.price,120);assert.equal(result.pricing[0].price,120);assert.equal(result.pricing[0].durationMonths,17);
 assert.deepEqual(plain(result.pricing[0].countryPrices),[{country:'US',price:120},{country:'DE',price:80},{country:'PK',price:30}]);
 assert.equal(pricing.normalizeRegionalPricing({price:'',accessMonths:1,countryPrices:[{country:'US',price:'65'}]}).price,65);
 assert.deepEqual(plain(pricing.normalizeRegionalPricing({price:79,accessMonths:1}).pricing),[]);
});
test('editing or removing a US override cannot silently restore an older base price',()=>{
 const legacy={price:170,countryPrices:[{country:'US',price:120},{country:'PK',price:30}]};
 assert.equal(pricing.usaDefaultPrice(legacy),120);
 assert.deepEqual(plain(pricing.changeUsaDefault(legacy,'95')),{price:'95',currency:'USD',countryPrices:[{country:'US',price:'95'},{country:'PK',price:30}]});
 assert.deepEqual(plain(pricing.changeCountryPrices(legacy,[{country:'PK',price:30}])),{price:120,countryPrices:[{country:'PK',price:30}]});
 assert.equal(pricing.changeCountryPrices(legacy,[{country:'US',price:'90'}]).price,'90');
 assert.equal(pricing.changeCountryPrices(legacy,[{country:'US',price:''}]).price,120);
});
for(const duration of [0,121,1.5,'',NaN])test(`admin rejects invalid term ${duration} instead of changing its charge interval`,()=>{
 assert.throws(()=>pricing.normalizeRegionalPricing({price:20,accessMonths:duration}),/whole number/);
});
test('admin refuses blank and sub-cent prices and duplicate country entries',()=>{
 assert.throws(()=>pricing.normalizeRegionalPricing({price:'',accessMonths:1}),/required/);
 assert.throws(()=>pricing.normalizeRegionalPricing({price:'1.001',accessMonths:1}),/two decimal/);
 assert.throws(()=>pricing.normalizeCountryPrices([{country:'PK',price:5},{country:'pk',price:10}]),/more than one/);
 assert.deepEqual(plain(pricing.normalizeCountryPrices([{country:'PK',price:''} ])),[]);
});
function regionalEditorFixture(){
 const h=hookHarness(),changes=[],mod=compileModule('../components/cms/RegionalPricingEditor.tsx',{imports:{react:h.React,'react/jsx-runtime':feedbackRuntime(h),'../../lib/api':{apiFetch:async()=>({countries:COUNTRIES})},'./regionalPricing':pricing},globals:{...browserGlobals(),...h.globals}});
 return {h,changes,mod,nodes:()=>rows(h.tree)};
}
test('pricing editor shows the real USA default and keeps its stored US row in sync',async t=>{
 const f=regionalEditorFixture();t.after(()=>f.h.cleanup());
 f.h.mount(()=>f.mod.default({value:{price:99,accessMonths:1,pricing:[{label:'Six months',price:170,durationMonths:6,countryPrices:[{country:'US',price:120},{country:'PK',price:30}]}]},onChange:part=>f.changes.push(part)}));await f.h.settle();
 const usa=f.nodes().find(node=>node.type==='input'&&node.props.type==='number'&&node.props.value===120);assert.ok(usa);
 usa.props.onChange({target:{value:'95'}});
 assert.equal(f.changes[0].pricing[0].price,'95');assert.equal(f.changes[0].pricing[0].countryPrices.find(row=>row.country==='US').price,'95');
 assert.equal(f.changes[0].pricing[0].countryPrices.find(row=>row.country==='PK').price,30);
});
test('country override editor searches countries and adds only a blank explicit country price',async t=>{
 const f=regionalEditorFixture();t.after(()=>f.h.cleanup());
 f.h.mount(()=>f.mod.CountryPrices({value:[{country:'PK',price:30}],label:'Six months',countries:COUNTRIES,disabled:false,onChange:entries=>f.changes.push(entries)}));await f.h.settle();
 const select=()=>f.nodes().find(node=>node.type==='select'&&node.props['aria-label']==='Country for Six months override 1');
 assert.equal(COUNTRIES.length,249);assert.equal(rows(select()).filter(node=>node.type==='option'&&node.props.value).length,248);
 f.nodes().find(node=>node.type==='input'&&node.props.type==='search').props.onChange({target:{value:'Germany'}});await f.h.settle();
 assert.deepEqual(rows(select()).filter(node=>node.type==='option'&&node.props.value).map(node=>node.props.value).sort(),['DE','PK']);
 const add=f.nodes().find(node=>node.type==='button'&&String(node.props.children).includes('Add country price'));assert.ok(add);add.props.onClick();
 assert.deepEqual(plain(f.changes.at(-1)),[{country:'PK',price:30},{country:'',price:''}]);
 assert.deepEqual(plain(pricing.filterCountries(COUNTRIES,'USA')).map(row=>row.code),['US']);
 assert.ok(pricing.filterCountries(COUNTRIES,'Afghanistan').some(row=>row.code==='AF'));
 assert.equal(f.nodes().some(node=>node.type==='fieldset'||node.type==='details'),false);
});
test('region batches use explicit valid country lists and preserve individual overrides by default',()=>{
 const codes=new Set(COUNTRIES.map(country=>country.code));
 for(const region of pricing.PRICE_REGIONS){
  assert.equal(new Set(region.countries).size,region.countries.length);assert.ok(region.countries.every(code=>codes.has(code)));assert.equal(region.countries.includes('US'),false);
  const expanded=pricing.expandRegionPrices([{country:'US',price:120}],region.key,'19.50');assert.equal(expanded.added,region.countries.length);assert.equal(expanded.replaced,0);assert.equal(expanded.countryPrices.find(row=>row.country==='US').price,120);
  assert.doesNotThrow(()=>validateServerCountryPrices(plain(expanded.countryPrices)));
  assert.ok(region.countries.every(code=>expanded.countryPrices.find(row=>row.country===code).price===19.5));
 }
 const entries=[{country:'US',price:120},{country:'PK',price:30}],asia=pricing.expandRegionPrices(entries,'asia',20);
 assert.equal(asia.countryPrices.find(row=>row.country==='PK').price,30);assert.equal(asia.countryPrices.find(row=>row.country==='NP').price,20);assert.equal(asia.preserved,1);
 assert.deepEqual(entries,[{country:'US',price:120},{country:'PK',price:30}]);
 const replaced=pricing.expandRegionPrices(entries,'asia',20,{overwriteExisting:true});assert.equal(replaced.countryPrices.find(row=>row.country==='PK').price,20);assert.equal(replaced.replaced,1);assert.equal(replaced.countryPrices.find(row=>row.country==='US').price,120);
 const matching=pricing.expandRegionPrices([{country:'PK',price:20}],'asia',20,{overwriteExisting:true});assert.equal(matching.replaced,0);assert.equal(matching.preserved,1);assert.equal(matching.added+matching.preserved,pricing.PRICE_REGIONS.find(region=>region.key==='asia').countries.length);
 assert.throws(()=>pricing.expandRegionPrices([],'africa',''),/required/);assert.throws(()=>pricing.expandRegionPrices([],'africa','1.001'),/two decimal/);assert.throws(()=>pricing.expandRegionPrices([],'unknown',20),/valid region/);
});
test('country rows edit and remove one country without replacing other stored totals',async t=>{
 const f=regionalEditorFixture();t.after(()=>f.h.cleanup());
 f.h.mount(()=>f.mod.CountryPrices({value:[{country:'US',price:120},{country:'PK',price:30}],label:'Six months',countries:COUNTRIES,disabled:false,onChange:entries=>f.changes.push(entries)}));
 const input=label=>f.nodes().find(node=>node.props?.['aria-label']===label);
 input('Country total for Six months override 2').props.onChange({target:{value:'25'}});
 assert.deepEqual(plain(f.changes.at(-1)),[{country:'US',price:120},{country:'PK',price:'25'}]);
 f.nodes().filter(node=>node.type==='button'&&node.props.children==='Remove country price')[1].props.onClick();
 assert.deepEqual(plain(f.changes.at(-1)),[{country:'US',price:120}]);
});
test('country rows prevent duplicate choices and keep a selected country visible during search',async t=>{
 const f=regionalEditorFixture();t.after(()=>f.h.cleanup());let entries=[{country:'US',price:120},{country:'PK',price:30}];
 f.h.mount(()=>f.mod.CountryPrices({value:entries,label:'Six months',countries:COUNTRIES,disabled:false,onChange:next=>f.changes.push(next)}));
 const selects=f.nodes().filter(node=>node.type==='select');assert.equal(rows(selects[0]).find(node=>node.props?.value==='PK').props.disabled,true);
 f.nodes().find(node=>node.props?.['aria-label']==='Search countries for Six months').props.onChange({target:{value:'Nigeria'}});await f.h.settle();
 const selected=f.nodes().find(node=>node.props?.['aria-label']==='Country for Six months override 2');assert.deepEqual(rows(selected).filter(node=>node.type==='option'&&node.props.value).map(node=>node.props.value).sort(),['NG','PK']);assert.equal(f.changes.length,0);
});

function fieldsModule(react=React,runtime=jsx,globals={}){
 return compileModule('../components/cms/Fields.tsx',{imports:{react,'react/jsx-runtime':runtime,'../AcademyImage':{default:'img'},'./CropMediaField':{default:'crop-field'},'../../lib/api':{API_URL:'/api',requestHeaders:()=>new Headers(),portalMediaUrl:x=>x,portalMediaDownloadUrl:x=>x}},globals});
}
test('upload lock disables editor inputs and new uploads but keeps cancellation outside inherited disabling',()=>{
 const fields=fieldsModule();
 const tree=fields.UploadFieldset({uploading:true,children:jsx.jsxs('div',{children:[jsx.jsx('input',{value:'draft'}),jsx.jsx('button',{children:'Save'}),jsx.jsx(fields.Field,{label:'Title'}),jsx.jsx(fields.MediaField,{label:'Video'}),jsx.jsx('button',{'data-cms-upload-cancel':'true',children:'Cancel upload'})]})});
 assert.equal(tree.props.disabled,false);
 const nodes=rows(tree);assert.equal(nodes.find(n=>n.type==='input').props.disabled,true);
 assert.equal(nodes.find(n=>n.type===fields.Field).props.disabled,true);
 assert.equal(nodes.find(n=>n.type===fields.MediaField).props.disabled,true);
 assert.notEqual(nodes.find(n=>n.props?.['data-cms-upload-cancel']).props.disabled,true);
});
test('actual media Cancel aborts an active request and releases its editor upload lock',async t=>{
 const h=hookHarness(),notices=[];let request;
 class UploadRequest{constructor(){request=this;this.upload={};}open(){}setRequestHeader(){}send(){}abort(){this.aborted=true;this.onabort?.();}}
 const fields=fieldsModule({...React,...h.React,useContext:()=>delta=>notices.push(delta)},jsx,{...browserGlobals(),...h.globals,FormData:class{append(_key,value){this.file=value;}get(){return this.file;}},XMLHttpRequest:UploadRequest});
 h.mount(()=>fields.MediaField({kind:'video',label:'Video',disabled:true,onChange(){throw Error('Cancelled upload must not save media');}}));t.after(()=>h.cleanup());
 // The actual current upload started while enabled; parent subsequently locks other controls.
 rows(h.tree).find(n=>n.type==='input').props.onChange({target:{files:[{size:100,type:'video/mp4'}],value:'file'}});
 await h.settle();assert.deepEqual(notices,[1]);
 const cancel=rows(h.tree).find(n=>n.props?.['data-cms-upload-cancel']);assert.ok(cancel);assert.notEqual(cancel.props.disabled,true);
 cancel.props.onClick();await h.settle();assert.equal(request.aborted,true);assert.deepEqual(notices,[1,-1]);assert.equal(rows(h.tree).some(n=>n.props?.['data-cms-upload-cancel']),false);
});

function sectionEditor(initial){
 const h=hookHarness(),calls=[];
 const fields={Check:'check',Field:'field',MediaField:'media',UploadContext:{Provider:'uploads'},UploadFieldset:'fieldset',useDirty:()=>({mayClose:()=>true})};
 const mod=compileModule('../components/cms/SectionManager.tsx',{imports:{react:h.React,'react/jsx-runtime':feedbackRuntime(h),'../../lib/api':{portalMediaUrl:x=>x,apiFetch:async(path,options)=>{calls.push({path,...options});return{success:true,item:{...JSON.parse(options.body),_id:'section-one'}};}},'./Fields':fields,'./AdminConfirm':{default:'confirm',adminSaved(){}},'./RegionalPricingEditor':{default:'pricing-editor'},'./regionalPricing':pricing,'./catalog-admin.css':{}},globals:{...browserGlobals(),...h.globals}});
 let saved=0;h.mount(()=>mod.SectionEditor({initial,onSaved(){saved++;},onClose(){}}));
 return{h,calls,get saved(){return saved;},nodes:()=>rows(h.tree)};
}
test('section draft requires an admin-set total and sends complete normalized section pricing',async t=>{
 const f=sectionEditor({title:'Section',slug:'section',price:'',accessMonths:1,pricing:[],published:false});t.after(()=>f.h.cleanup());
 await f.nodes().find(n=>n.type==='confirm').props.onConfirm();await f.h.settle();assert.equal(f.calls.length,0);
 assert.ok(f.nodes().some(n=>n.props?.role==='alert'&&rows(n).some(child=>typeof child.props?.children==='string'&&/required/.test(child.props.children))));
 f.nodes().find(n=>n.type==='pricing-editor').props.onChange({price:'89.99',accessMonths:7,pricing:[{label:'Seven months',price:'89.99',durationMonths:7,countryPrices:[{country:'PK',price:'25'}]}]});await f.h.settle();
 await f.nodes().find(n=>n.type==='confirm').props.onConfirm();await f.h.settle();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/admin/sections');assert.equal(f.calls[0].method,'POST');
 const body=JSON.parse(f.calls[0].body);assert.equal(body.currency,'USD');assert.equal(body.pricing[0].countryPrices[0].price,25);assert.equal(body.accessMonths,7);assert.equal(body.published,false);assert.equal(f.saved,1);
});

function coupons(){
 const h=hookHarness(),calls=[];
 const mod=compileModule('../components/cms/CouponManager.tsx',{imports:{react:h.React,'react/jsx-runtime':feedbackRuntime(h),'../../lib/api':{apiFetch:async(path,options)=>{calls.push({path,...options});if(options?.method==='POST')return{success:true,item:{_id:'coupon-one',code:'SERVERGENERATED',...JSON.parse(options.body)}};return{items:path.startsWith('/admin/content/courses')?[{_id:'course-one',slug:'course-one',title:'Course one'}]:[],total:0,pageSize:20};}},'./Fields':{useDirty:()=>({markSaved(){},mayClose:()=>true})},'./AdminConfirm':{default:'confirm',adminSaved(){}},'./catalog-admin.css':{}},globals:{...browserGlobals(),...h.globals}});
 h.mount(()=>mod.default({}));return {h,calls,mod,nodes:()=>rows(h.tree)};
}
test('coupon status distinguishes reservation, expiry, revocation and completed redemption',()=>{
 const f=coupons();try{const status=f.mod.couponStatus;assert.equal(status({claimedOrder:'order'}),'reserved');assert.equal(status({active:false}),'revoked');assert.equal(status({expiresAt:'2000-01-01'}),'expired');assert.equal(status({redeemedAt:'2026-01-01',active:false}),'redeemed');}finally{f.h.cleanup();}
});
test('coupon creation leaves generation on the server and binds one product, percent and expiry',async t=>{
 const f=coupons();t.after(()=>f.h.cleanup());await f.h.settle();
 f.nodes().find(n=>n.type==='button'&&String(n.props.children).includes('Create coupon')).props.onClick();await f.h.settle();f.h.run(200);await f.h.settle();
 const select=f.nodes().find(n=>n.type==='select'&&n.props.required);select.props.onChange({target:{value:'course-one'}});
 f.nodes().find(n=>n.type==='input'&&n.props.type==='datetime-local').props.onChange({target:{value:'2099-01-01T12:00'}});await f.h.settle();
 const form=f.nodes().find(n=>n.type==='form'),event={preventDefault(){}};await Promise.all([form.props.onSubmit(event),form.props.onSubmit(event)]);await f.h.settle();
 const creates=f.calls.filter(call=>call.method==='POST');assert.equal(creates.length,1);assert.equal(creates[0].path,'/admin/coupons');
 const body=JSON.parse(creates[0].body);assert.equal(body.kind,'course');assert.equal(body.productSlug,'course-one');assert.equal(body.percentOff,10);assert.ok(body.expiresAt.endsWith('Z'));assert.equal('code' in body,false);
 assert.ok(f.nodes().some(n=>n.type==='code'&&n.props.children==='SERVERGENERATED'));
});

test('admin country correction sends a country code with reauthentication and does not edit price history',async t=>{
 const h=hookHarness(),calls=[];
 const mod=compileModule('../components/business/AdminStudents.tsx',{imports:{react:h.React,'react/jsx-runtime':feedbackRuntime(h),'./StudentExportButton':{default:'student-export'},'../../lib/api':{apiFetch:async(path,options)=>{calls.push({path,...options});if(path==='/auth/countries')return{countries:[{code:'PK',name:'Pakistan'},{code:'US',name:'United States'}]};if(options?.method==='PATCH')return{success:true,message:'Country corrected'};return{items:[{_id:'student-one',name:'Student one',email:'student@example.invalid',country:'PK'}],total:1,pageSize:25};}},'./ui':{Loading:'loading',Notice:'notice',Empty:'empty',day:x=>x,stamp:x=>x,Badge:'badge',Dialog:'dialog'}},globals:{...browserGlobals(),...h.globals}});
 h.mount(()=>mod.default());t.after(()=>h.cleanup());h.run(250);await h.settle();
 rows(h.tree).find(n=>n.type==='button'&&n.props.children==='Edit country').props.onClick();await h.settle();
 rows(h.tree).find(n=>n.type==='select').props.onChange({target:{value:'US'}});
 rows(h.tree).find(n=>n.type==='input'&&n.props.type==='password').props.onChange({target:{value:'FixtureAdminPassword!'}});await h.settle();
 await rows(h.tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await h.settle();
 const patch=calls.find(call=>call.method==='PATCH');assert.equal(patch.path,'/academy-admin/students/student-one/country');assert.deepEqual(JSON.parse(patch.body),{country:'US',currentPassword:'FixtureAdminPassword!'});assert.equal(calls.some(call=>/payments|invoices/.test(call.path)),false);
});
