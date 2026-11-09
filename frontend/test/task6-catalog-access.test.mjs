import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';

const nodes=value=>!value?[]:Array.isArray(value)?value.flatMap(nodes):typeof value==='object'?[value,...nodes(value.props?.children)]:[];
const plain=value=>JSON.parse(JSON.stringify(value));
const start=Date.parse('2026-11-07T12:00:00Z');
const term=(slug,endsAt=new Date(start+1000).toISOString(),kind='course')=>({[kind+'Slug']:slug,startsAt:new Date(start-1000).toISOString(),endsAt});
const snapshot=patch=>({membershipActive:false,membershipEndsAt:null,courseAccesses:[],sectionAccesses:[],serverNow:new Date(start).toISOString(),...patch});

function accessFixture({reply=snapshot(),load}={}){
 const h=hookHarness(),b=browserGlobals(),requests=[];let now=start,user={id:'one',role:'student',country:'US'},epoch=0;
 class Clock extends Date {static now(){return now;}}
 const mod=compileModule('../lib/useCatalogAccess.ts',{imports:{react:h.React,'../components/auth/AuthProvider':{useAuth:()=>({user,ready:true})},'./api':{accountEpoch:()=>epoch,isAbortError:error=>error?.name==='AbortError',apiFetch:async(path,options)=>{requests.push({path,...options});return load?load(requests.length):reply;}}},globals:{...h.globals,...b,Date:Clock,navigator:{onLine:true}}});
 h.mount(()=>mod.useCatalogAccess());
 return {h,b,requests,get now(){return now;},setReply(value){reply=value;},advance(ms){now+=ms;h.run(ms);},changeOwner(){user={...user,id:'two'};epoch++;h.render();},changeCountry(){user={...user,country:'PK'};h.render();},refresh(){b.window.dispatchEvent(new Event('focus'));}};
}

test('owned direct and section access stay scoped while section access includes child courses',async()=>{
 const f=accessFixture({reply:snapshot({courseAccesses:[term('direct',null)],sectionAccesses:[term('section',undefined,'section')]})});await f.h.settle();
 assert.equal(f.h.tree.checking,false);assert.equal(f.h.tree.courseAccess({slug:'direct'}).type,'course');
 assert.equal(f.h.tree.courseAccess({slug:'child',sectionSlug:'section'}).type,'section');assert.equal(f.h.tree.sectionAccess('section').type,'section');
 assert.equal(f.h.tree.courseAccess({slug:'outside'}),null);assert.equal(f.h.tree.sectionAccess('other-section'),null);
 assert.equal(f.h.tree.sectionAccess('direct'),null,'one purchased course cannot cover its entire section');
 assert.equal(f.h.tree.courseAccess({slug:'free',accessType:'free'}).type,'free');f.h.cleanup();
});

test('membership coverage spans products but expires exactly without a successful refresh',async()=>{
 let fail=false;const f=accessFixture({load:async()=>{if(fail)throw Error('offline');return snapshot({membershipActive:true,membershipEndsAt:new Date(start+1000).toISOString()});}});await f.h.settle();
 assert.equal(f.h.tree.courseAccess({slug:'any'}).type,'membership');assert.equal(f.h.tree.sectionAccess('any').type,'membership');
 fail=true;f.refresh();await f.h.settle();assert.equal(f.h.tree.membershipActive,true,'a transient failure keeps still-valid owned proof');
 f.advance(1000);await f.h.settle();assert.equal(f.h.tree.membershipActive,false);assert.equal(f.h.tree.courseAccess({slug:'any'}),null);assert.equal(f.h.tree.sectionAccess('any'),null);f.h.cleanup();
});

test('direct and section expiry removes their labels and refreshes even when the network fails',async()=>{
 let fail=false;const f=accessFixture({load:async()=>{if(fail)throw Error('offline');return snapshot({courseAccesses:[term('direct')],sectionAccesses:[term('section',undefined,'section')]});}});await f.h.settle();
 fail=true;f.advance(1000);await f.h.settle();assert.equal(f.h.tree.courseAccess({slug:'direct'}),null);assert.equal(f.h.tree.courseAccess({slug:'child',sectionSlug:'section'}),null);assert.equal(f.h.tree.sectionAccess('section'),null);
 assert.ok(f.requests.length>=2);assert.equal([...f.h.timers.values()].some(timer=>timer.ms===0),false,'an expired term cannot cause a zero-delay retry loop');f.h.cleanup();
});

test('future or malformed terms never become active and server time bounds local clock skew',async()=>{
 const serverTime=start+60000;const f=accessFixture({load:call=>{if(call>1)throw Error('offline');return snapshot({serverNow:new Date(serverTime).toISOString(),courseAccesses:[{courseSlug:'future',startsAt:new Date(serverTime+1000).toISOString(),endsAt:null},{courseSlug:'bad',startsAt:'bad',endsAt:null},{courseSlug:'ended',startsAt:new Date(start-1000).toISOString(),endsAt:new Date(start+5000).toISOString()},term('active',new Date(serverTime+1000).toISOString())]});}});await f.h.settle();
 for(const slug of ['future','bad','ended'])assert.equal(f.h.tree.courseAccess({slug}),null);assert.equal(f.h.tree.courseAccess({slug:'active'}).type,'course');f.advance(1000);await f.h.settle();assert.equal(f.h.tree.courseAccess({slug:'active'}),null);f.h.cleanup();
});

test('owner and country boundaries immediately remove prior proof and abort old requests',async()=>{
 let finish;const f=accessFixture({load:call=>call===1?snapshot({courseAccesses:[term('direct',null)]}):new Promise(resolve=>finish=resolve)});await f.h.settle();assert.ok(f.h.tree.courseAccess({slug:'direct'}));
 f.changeOwner();assert.equal(f.h.tree.courseAccess({slug:'direct'}),null);assert.equal(f.h.tree.checking,true);await f.h.settle();
 finish(snapshot());await f.h.settle();assert.equal(f.h.tree.courseAccess({slug:'direct'}),null);
 f.changeCountry();assert.equal(f.h.tree.checking,true);await f.h.settle();f.h.cleanup();assert.ok(f.requests.at(-1).signal.aborted);
});

test('an incomplete first access response offers retry instead of enabling a new purchase',async()=>{
 const f=accessFixture({reply:{membershipActive:false}});await f.h.settle();assert.equal(f.h.tree.unavailable,true);assert.match(f.h.tree.error,/confirmed/);
 f.setReply(snapshot());f.refresh();await f.h.settle();assert.equal(f.h.tree.unavailable,false);assert.equal(f.h.tree.checking,false);f.h.cleanup();
});

test('shared cards suppress prices while covered and link to actual course or section content',()=>{
 const h=hookHarness(),Prices=Symbol('Prices'),Card=compileModule('../components/catalog/CatalogCard.tsx',{imports:{'react/jsx-runtime':h,'next/link':{default:'a'},'../AcademyImage':{default:'image'},'../../lib/imageSources':compileModule('../lib/imageSources.ts'),'../../lib/money':{money:String},'./PriceOptions':{default:Prices}}}).default;
 for(const kind of ['course','section']){
  const tree=Card({product:{slug:'owned',title:'Owned',price:999},kind,covered:true,coverageLabel:kind==='course'?'Course Access':'Section Access'});
  assert.equal(nodes(tree).some(node=>node.type===Prices),false);assert.ok(nodes(tree).some(node=>node.props?.href===(kind==='course'?'/learn/owned':'/sections/owned#section-courses')));
 }
 const pending=Card({product:{slug:'pending',title:'Pending',price:999},accessPending:true});assert.equal(nodes(pending).some(node=>node.type===Prices),false);
 const expired=Card({product:{slug:'expired',title:'Expired',price:999}});assert.ok(nodes(expired).some(node=>node.type===Prices));
});

const inactive=()=>({scope:'one:US:0',checking:false,unavailable:false,error:'',membershipActive:false,courseAccess:()=>null,sectionAccess:()=>null,refresh(){}});
const safety=compileModule('../lib/checkoutSafety.ts');
function checkoutFixture({active=true,renewalSetup=false,retained=false,sectionCovered=false,create,release,loadCatalog}={}){
 const h=hookHarness(),b=browserGlobals(),calls=[],routes=[],store=new Map(),user={id:'one',role:'student',country:'US'},coverage={type:sectionCovered?'section':'course',label:sectionCovered?'Section Access':'Course Access',startsAt:new Date(start-1000).toISOString(),endsAt:null};
 let epoch=0;const catalogScope=()=>[user.id,user.country,epoch].join(':');
 b.window.location.assign=url=>routes.push(url);
 const storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 if(retained)safety.saveCheckoutAttempt(storage,{owner:user.id,kind:'course',product:'paid',optionKey:'annual',renewalOf:'',provider:'stripe',key:'existing-checkout-key-1234567890',autoRenew:true,couponCode:'',orderId:'a'.repeat(24)});
 const catalog=()=>({...inactive(),scope:catalogScope(),courseAccess:product=>active&&(!sectionCovered||product.sectionSlug==='section')?coverage:null});
 const query=new URLSearchParams('course=paid'+(renewalSetup?'&renewalSetup=1&sourceInvoice='+'b'.repeat(24):''));
 const mod=compileModule('../app/checkout/page.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'next/navigation':{useRouter:()=>({replace(){},push:path=>routes.push(path)}),useSearchParams:()=>query},'../../components/ApiLoadError':{default:'error'},'../../components/SectionPurchaseSuggestion':{default:'section-suggestion'},'../../components/feedback/FeedbackNotice':{default:'feedback'},'../../components/layout/BackButton':{default:'back'},'../../components/SiteHeader':{default:'header'},'../../components/layout/SiteFooter':{default:'footer'},'../../components/auth/AuthProvider':{useAuth:()=>({user,ready:true})},'../../lib/useCatalogAccess':{useCatalogAccess:catalog},'../../lib/checkoutSafety':safety,'../../lib/money':{money:value=>'$'+value},'../../lib/api':{safeStudentNext:path=>path,apiFetch:async(path,options)=>{
  calls.push({path,...options});if(path==='/payments/methods')return {methods:{stripe:{enabled:true},paypal:{enabled:true}}};
  if(path.startsWith('/payments/catalog'))return loadCatalog?loadCatalog({country:user.country,epoch,signal:options.signal}):{purchase:{title:'Purchased course',sectionSlug:'section',offers:[{key:'annual',label:'One year',durationMonths:12,currency:'USD',amountMinor:14900}]}};
  if(path==='/payments/quote')return {quote:{subtotalMinor:14900,discountMinor:0,amountMinor:14900,renewalAmountMinor:14900,amountDueNowMinor:renewalSetup?0:14900,currency:'USD',durationMonths:12,availableProviders:{stripe:true,paypal:true},fingerprint:'fresh-quote'}};
  if(path==='/payments/checkout-status')return {found:true,order:{_id:'a'.repeat(24),provider:'stripe',kind:'course',product:'paid',status:'paid'}};
  if(path==='/payments/checkout/release')return release?release(options):{released:true,order:{_id:'a'.repeat(24),provider:'stripe',kind:'course',product:'paid',status:'cancelled'},replacementKey:'safe-replacement-key-1234567890'};
  if(path==='/payments/checkout')return create?create(options):{order:{_id:'c'.repeat(24),provider:'stripe',kind:'course',product:'paid',status:'pending',renewalSetup,sourceInvoiceId:renewalSetup?'b'.repeat(24):null},url:'https://checkout.stripe.com/c/pay/existing'};
  throw Error(path);
 }}},globals:{...b,...h.globals,sessionStorage:storage,navigator:{onLine:true}}});
 h.mount(()=>mod.default());return {h,calls,routes,storage,expire(){active=false;h.render();},changeCountry(){user.country='PK';h.render();},changeEpoch(){epoch++;h.render();}};
}

for(const sectionCovered of [false,true])test('active '+(sectionCovered?'section-covered':'direct')+' checkout offers content instead of a second payment',async()=>{
 const f=checkoutFixture({sectionCovered});await f.h.settle();assert.ok(nodes(f.h.tree).some(node=>node.props?.href==='/learn/paid'));assert.equal(nodes(f.h.tree).some(node=>String(node.props?.className||'').startsWith('paymentMethod ')),false);assert.equal(f.calls.some(call=>call.path==='/payments/quote'),false);
 f.expire();await f.h.settle();assert.ok(nodes(f.h.tree).some(node=>node.props?.className==='paymentMethod stripe'));assert.ok(f.calls.some(call=>call.path==='/payments/quote'));f.h.cleanup();
});

test('active access offers content without a pending block while retaining the old recovery identity',async()=>{
 const f=checkoutFixture({retained:true});await f.h.settle();
 assert.ok(nodes(f.h.tree).some(node=>node.props?.href==='/learn/paid'));
 for(const label of ['Check existing checkout','Close existing checkout'])assert.equal(nodes(f.h.tree).some(node=>node.type==='button'&&node.props.children===label),false);
 assert.equal(nodes(f.h.tree).some(node=>String(node.props?.className||'').startsWith('paymentMethod ')),false);
 const retained=safety.readCheckoutAttempt(f.storage,safety.checkoutScope('one','course','paid'));assert.equal(retained.key,'existing-checkout-key-1234567890');assert.equal(retained.orderId,'a'.repeat(24));
 assert.equal(f.calls.some(call=>['/payments/checkout','/payments/checkout-status','/payments/checkout/release'].includes(call.path)),false);assert.deepEqual(f.routes,[]);f.h.cleanup();
});

test('noncharging deferred renewal setup remains available with fresh explicit consent',async()=>{
 const f=checkoutFixture({renewalSetup:true});await f.h.settle();assert.ok(nodes(f.h.tree).some(node=>node.props?.className==='paymentMethod stripe'));assert.ok(f.calls.some(call=>call.path==='/payments/quote'));
 const consent=nodes(f.h.tree).find(node=>node.type==='label'&&node.props.className==='checkoutConsent').props.children[0];consent.props.onChange({target:{checked:true}});await f.h.settle();
 await nodes(f.h.tree).find(node=>node.props?.className==='paymentMethod stripe').props.onClick();await f.h.settle();const request=f.calls.find(call=>call.path==='/payments/checkout');assert.ok(request);assert.deepEqual(plain(JSON.parse(request.body)),{kind:'course',product:'paid',optionKey:'annual',provider:'stripe',autoRenew:true,renewalSetup:true,sourceInvoiceId:'b'.repeat(24),termsAccepted:true,couponCode:'',quoteFingerprint:'fresh-quote'});f.h.cleanup();
});

for(const change of ['changeCountry','changeEpoch'])test(change+' reloads catalog/quotes and rejects a stale provider response without losing recovery identity',async()=>{
 let resolve;const f=checkoutFixture({active:false,create:()=>new Promise(done=>resolve=done)});await f.h.settle();
 const consent=nodes(f.h.tree).find(node=>node.props?.className==='checkoutConsent').props.children[0];consent.props.onChange({target:{checked:true}});await f.h.settle();
 const pay=nodes(f.h.tree).find(node=>node.props?.className==='paymentMethod stripe').props.onClick();
 const beforeCatalog=f.calls.filter(call=>call.path.startsWith('/payments/catalog')).length,beforeQuotes=f.calls.filter(call=>call.path==='/payments/quote').length;
 f[change]();await f.h.settle();assert.equal(f.calls.filter(call=>call.path.startsWith('/payments/catalog')).length,beforeCatalog+1);assert.ok(f.calls.filter(call=>call.path==='/payments/quote').length>beforeQuotes);
 const originalKey=f.calls.find(call=>call.path==='/payments/checkout').headers['Idempotency-Key'];
 resolve({order:{_id:'c'.repeat(24),provider:'stripe',kind:'course',product:'paid',status:'pending'},url:'https://checkout.stripe.com/c/pay/stale'});await pay;await f.h.settle();assert.deepEqual(f.routes,[]);
 const retained=safety.readCheckoutAttempt(f.storage,safety.checkoutScope('one','course','paid'));assert.equal(retained.key,originalKey);assert.equal(retained.orderId,undefined,'a stale response cannot replace the saved identity');
 assert.equal(nodes(f.h.tree).some(node=>node.props?.children==='Check existing checkout'),false);assert.equal(f.calls.filter(call=>call.path==='/payments/checkout').length,1);assert.equal(f.calls.some(call=>call.path==='/payments/checkout/release'),false);f.h.cleanup();
});

test('country change rejects a stale close response and retains the existing checkout',async()=>{
 let resolve;const f=checkoutFixture({active:false,retained:true,release:()=>new Promise(done=>resolve=done)});await f.h.settle();
 const consent=nodes(f.h.tree).find(node=>node.props?.className==='checkoutConsent').props.children[0];consent.props.onChange({target:{checked:true}});await f.h.settle();
 const close=nodes(f.h.tree).find(node=>node.props?.className==='paymentMethod stripe').props.onClick();await f.h.settle();
 assert.equal(f.calls.filter(call=>call.path==='/payments/checkout/release').length,1);assert.equal(f.calls.find(call=>call.path==='/payments/checkout/release').headers['Idempotency-Key'],'existing-checkout-key-1234567890');assert.equal(f.calls.some(call=>call.path==='/payments/checkout'),false);
 f.changeCountry();await f.h.settle();resolve({released:false,order:{_id:'a'.repeat(24),provider:'stripe',kind:'course',product:'paid',status:'paid'}});await close;await f.h.settle();assert.deepEqual(f.routes,[]);
 const retained=safety.readCheckoutAttempt(f.storage,safety.checkoutScope('one','course','paid'));assert.equal(retained.key,'existing-checkout-key-1234567890');assert.equal(retained.orderId,'a'.repeat(24));assert.equal(retained.releaseRequested,true);
 assert.equal(f.calls.some(call=>call.path==='/payments/checkout'),false);assert.equal(nodes(f.h.tree).some(node=>node.props?.children==='Check existing checkout'),false);assert.equal(nodes(f.h.tree).find(node=>node.props?.className==='paymentMethod stripe').props.disabled,false);assert.equal(nodes(f.h.tree).find(node=>node.props?.className==='checkoutConsent').props.children[0].props.checked,false);f.h.cleanup();
});

function detailFixture({kind='course',coverageType='course',accessLoad}={}){
 const h=hookHarness(),b=browserGlobals(),calls=[],routes=[],Prices=Symbol('Prices'),Card=Symbol('Card');let active=true,epoch=0;
 const user={id:'one',role:'student',country:'US'},scope=()=>[user.id,user.country,epoch].join(':'),coverage=()=>active?{type:coverageType,label:coverageType==='membership'?'Membership Access':coverageType==='section'?'Section Access':'Course Access',startsAt:new Date(start-1000).toISOString(),endsAt:new Date(start+1000).toISOString()}:null;
 const catalog=()=>({...inactive(),scope:scope(),membershipActive:active&&coverageType==='membership',courseAccess:()=>coverage(),sectionAccess:()=>coverageType==='course'?null:coverage()});
 const course={slug:'paid',title:'Purchased course',accessType:'one_time',sectionSlug:'section',price:149};
 const section={slug:'section',title:'Purchased section',price:249};
 const Page=compileModule(kind==='course'?'../app/courses/[slug]/page.tsx':'../app/sections/[slug]/page.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'next/navigation':{useParams:()=>({slug:kind==='course'?'paid':'section'}),useRouter:()=>({push:path=>routes.push(path)})},'next/link':{default:'a'},'../../../lib/useHydrated':{useHydrated:()=>true},'../../../components/catalog/PriceOptions':{default:Prices},'../../../components/catalog/CatalogCard':{default:Card},'../../../components/AcademyImage':{},'../../../components/layout/BackButton':{},'../../../components/SiteHeader':{},'../../../components/layout/SiteFooter':{},'../../../components/feedback/FeedbackNotice':{default:'feedback'},'../../../components/ApiLoadError':{},'../../../components/auth/AuthProvider':{useAuth:()=>({user,ready:true})},'../../../lib/courseAccessPresentation':compileModule('../lib/courseAccessPresentation.ts'),'../../../lib/catalogPresentation':compileModule('../lib/catalogPresentation.ts'),'../../../lib/useCatalogAccess':{useCatalogAccess:catalog},'../../../lib/api':{isAbortError:error=>error?.name==='AbortError',apiFetch:async(path,options)=>{calls.push({path,options});if(path.startsWith('/payments/access'))return accessLoad?accessLoad():{hasAccess:true,enrollment:{id:'existing'}};if(path.endsWith('/enroll'))return {success:true};return kind==='course'?{course,modules:[]}:{section,courses:[course]};}}},globals:{...b,...h.globals}}).default;
 h.mount(()=>Page());return {h,calls,routes,Prices,Card,expire(){active=false;h.render();},changeCountry(){user.country='PK';h.render();},changeEpoch(){epoch++;h.render();}};
}
for(const coverageType of ['course','section','membership'])test('course detail hides purchased prices for '+coverageType+' access and restores the offer after expiry',async()=>{
 const f=detailFixture({coverageType});await f.h.settle();assert.equal(nodes(f.h.tree).some(node=>node.type===f.Prices),false);const button=nodes(f.h.tree).find(node=>node.type==='button'&&node.props.className==='button');assert.equal(button.props.children,'Continue Course →');await button.props.onClick();assert.deepEqual(f.routes,['/learn/paid']);assert.equal(f.calls.some(call=>call.path==='/payments/checkout'),false);f.h.cleanup();
 const g=detailFixture({coverageType});await g.h.settle();g.expire();await g.h.settle();assert.ok(nodes(g.h.tree).some(node=>node.type===g.Prices));assert.equal(nodes(g.h.tree).find(node=>node.type==='button'&&node.props.className==='button').props.children,'Open / Purchase Course →');g.h.cleanup();
});
for(const coverageType of ['section','membership'])test('section detail '+coverageType+' coverage hides purchase including child courses and expiry restores it',async()=>{
 const f=detailFixture({kind:'section',coverageType});await f.h.settle();assert.equal(nodes(f.h.tree).some(node=>node.type===f.Prices),false);assert.ok(nodes(f.h.tree).some(node=>node.props?.href==='#section-courses'));assert.equal(nodes(f.h.tree).find(node=>node.type===f.Card).props.covered,true);f.expire();await f.h.settle();assert.ok(nodes(f.h.tree).some(node=>node.type===f.Prices));assert.ok(nodes(f.h.tree).some(node=>node.props?.href==='/checkout?section=section'));assert.equal(nodes(f.h.tree).find(node=>node.type===f.Card).props.covered,false);f.h.cleanup();
});
test('one direct child purchase leaves its parent section purchasable',async()=>{const f=detailFixture({kind:'section',coverageType:'course'});await f.h.settle();assert.ok(nodes(f.h.tree).some(node=>node.type===f.Prices));assert.equal(nodes(f.h.tree).find(node=>node.type===f.Card).props.covered,true);f.h.cleanup();});
for(const change of ['changeCountry','changeEpoch'])test('course start cannot navigate after '+change,async()=>{
 let resolve;const f=detailFixture({accessLoad:()=>new Promise(done=>resolve=done)});await f.h.settle();const task=nodes(f.h.tree).find(node=>node.type==='button'&&node.props.className==='button').props.onClick();f[change]();await f.h.settle();resolve({hasAccess:true,enrollment:{id:'existing'}});await task;assert.deepEqual(f.routes,[]);assert.ok(f.calls.find(call=>call.path.startsWith('/payments/access')).options.signal.aborted);f.h.cleanup();
});
