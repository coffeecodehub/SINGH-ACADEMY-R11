import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';

const nodes=value=>!value?[]:Array.isArray(value)?value.flatMap(nodes):typeof value==='object'?[value,...nodes(value.props?.children)]:[];
const text=value=>value==null||typeof value==='boolean'?'':Array.isArray(value)?value.map(text).join(' '):typeof value==='object'?text(value.props?.children):String(value);
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const safety=compileModule('../lib/checkoutSafety.ts');
const course='selected-course',section='academy-section',orderId='a'.repeat(24);

function storage(){
 const values=new Map();
 return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),values};
}

function catalogReply({kind,product,country='US',owner='one'}){
 const owningSection=country==='PK'?'pk-section':owner!=='one'?'other-owner-section':product===course?section:'other-section';
 return {purchase:{kind,product,title:kind==='section'?'Complete learning section':'Selected individual course',...(kind==='course'?{sectionSlug:owningSection}:{}),offers:[
  {key:kind+'-short',label:'Three months',durationMonths:3,currency:'USD',amountMinor:kind==='section'?10900:5900},
  {key:kind+'-annual',label:'One year',durationMonths:12,currency:'USD',amountMinor:kind==='section'?29900:14900}
 ]}};
}

function quoteReply(body,country='US'){
 const short=body.optionKey?.endsWith('-short'),subtotalMinor=body.kind==='section'?(short?10900:29900):(short?5900:14900),discountMinor=body.couponCode?2000:0;
 return {quote:{subtotalMinor,discountMinor,amountMinor:subtotalMinor-discountMinor,amountDueNowMinor:subtotalMinor-discountMinor,renewalAmountMinor:subtotalMinor,currency:'USD',durationMonths:short?3:12,autoRenew:body.autoRenew,availableProviders:{stripe:true,paypal:true},fingerprint:['quote',body.kind,body.product,body.optionKey,country,body.couponCode||''].join(':')}};
}

/** Run the real checkout callbacks; the optional card's validated offer is supplied explicitly. */
function fixture({retained=false,loadCatalog,loadQuote,create}={}){
 const h=hookHarness(),browser=browserGlobals(),calls=[],routes=[],saved=storage(),user={id:'one',role:'student',country:'US'},query=new URLSearchParams('course='+course+'&option=course-annual');
 let epoch=0;
 browser.window.location={pathname:'/checkout',search:'?'+query.toString(),origin:'http://academy.local',assign:path=>routes.push(path)};
 const attempt={owner:user.id,kind:'course',product:course,optionKey:'course-annual',renewalOf:'',provider:'stripe',key:'existing-course-checkout-1234567890',orderId,autoRenew:true,couponCode:''};
 if(retained)safety.saveCheckoutAttempt(saved,attempt);
 const mod=compileModule('../app/checkout/page.tsx',{imports:{
  react:h.React,'react/jsx-runtime':h,
  'next/navigation':{useSearchParams:()=>query,useRouter:()=>({replace:path=>routes.push(path),push:path=>routes.push(path)})},
  '../../components/auth/AuthProvider':{useAuth:()=>({user,ready:true})},
  '../../components/ApiLoadError':{default:'load-error'},
  '../../components/SectionPurchaseSuggestion':{default:'section-suggestion'},
  '../../components/feedback/FeedbackNotice':{default:'feedback'},
  '../../components/layout/BackButton':{default:'back'},
  '../../components/SiteHeader':{default:'header'},
  '../../components/layout/SiteFooter':{default:'footer'},
  '../../lib/useCatalogAccess':{useCatalogAccess:()=>({scope:[user.id,user.country,epoch].join(':'),checking:false,unavailable:false,error:'',membershipActive:false,courseAccess:()=>null,sectionAccess:()=>null,refresh(){}})},
  '../../lib/checkoutSafety':safety,
  '../../lib/money':{money:value=>'$'+value},
  '../../lib/api':{safeStudentNext:path=>path,apiFetch:async(path,options={})=>{
   const body=options.body?JSON.parse(options.body):null,call={path,...options,body};calls.push(call);
   if(path==='/payments/methods')return {methods:{stripe:{enabled:true},paypal:{enabled:true}}};
   if(path.startsWith('/payments/catalog?')){
    const params=new URLSearchParams(path.split('?')[1]),context={kind:params.get('kind'),product:params.get('product'),country:user.country,owner:user.id,requestedOption:query.get('option'),epoch,signal:options.signal};
    context.reply=()=>catalogReply(context);
    return loadCatalog?loadCatalog(context):context.reply();
   }
   if(path==='/payments/quote'){
    const context={body,country:user.country,owner:user.id,signal:options.signal,reply:()=>quoteReply(body,user.country)};
    return loadQuote?loadQuote(context):context.reply();
   }
   if(path==='/payments/checkout')return create?create(call):{order:{_id:orderId,provider:body.provider,kind:body.kind,product:body.product,status:'pending'},url:'https://checkout.stripe.com/c/pay/selected'};
   if(path==='/payments/checkout-status')return {found:true,order:{_id:orderId,provider:'stripe',kind:'course',product:course,status:'creating'}};
   throw Error('Unexpected fixture request '+path);
  }}
 },globals:{...browser,...h.globals,sessionStorage:saved,navigator:{onLine:true}}});
 h.mount(()=>mod.default());
 const all=()=>nodes(h.tree),findClass=className=>all().find(node=>node.props?.className===className);
 return {h,calls,routes,saved,query,user,attempt,
  summary:()=>text(findClass('orderSummary')),
  suggestion:()=>all().find(node=>node.type==='section-suggestion'),
  courseButton:()=>all().find(node=>node.type==='button'&&/^Individual course\b/.test(text(node))),
  payment:()=>findClass('paymentMethod stripe'),
  consent:()=>nodes(findClass('checkoutConsent')).find(node=>node.type==='input'),
  coupon:()=>all().find(node=>node.props?.id==='checkout-coupon'),
  button:label=>all().find(node=>node.type==='button'&&text(node).trim()===label),
  writes:()=>calls.filter(call=>call.path==='/payments/checkout'),
  quotes:()=>calls.filter(call=>call.path==='/payments/quote'),
  selectSection(){const card=this.suggestion();assert.ok(card,'the course has a validated owning-section choice');card.props.onSelect('section-annual');},
  selectCourse(){const button=this.courseButton();assert.ok(button,'the original course remains selectable');button.props.onClick();},
  accept(){this.consent().props.onChange({target:{checked:true}});},
  changeScope(change){if(change==='country')user.country='PK';else if(change==='owner')user.id='two';else if(change==='option')query.set('option','course-short');else query.set('course','other-course');h.render();}
 };
}

test('course and section choices update in place in both directions without starting checkout',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();const initialQuery=f.query.toString();
 assert.match(f.summary(),/Selected individual course/);assert.match(f.summary(),/\$149/);assert.equal(f.suggestion().props.selected,false);
 f.selectSection();await f.h.settle();
 assert.match(f.summary(),/Complete learning section/);assert.match(f.summary(),/\$299/);assert.equal(f.suggestion().props.selected,true);assert.notEqual(f.courseButton().props.className,'selected');
 f.selectCourse();await f.h.settle();
 assert.match(f.summary(),/Selected individual course/);assert.match(f.summary(),/\$149/);assert.equal(f.courseButton().props.className,'selected');assert.equal(f.suggestion().props.selected,false);
 assert.equal(f.query.toString(),initialQuery);assert.deepEqual(f.routes,[]);assert.equal(f.writes().length,0);assert.equal(f.calls.some(call=>call.path==='/payments/checkout/release'),false);assert.equal(f.saved.values.size,0);
});

test('a captured course payment callback cannot submit during or after a section selection',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();f.accept();await f.h.settle();const oldPay=f.payment().props.onClick;
 f.selectSection();await oldPay();assert.equal(f.writes().length,0);
 await f.h.settle();f.accept();await f.h.settle();await oldPay();
 assert.equal(f.writes().length,0);assert.deepEqual(f.routes,[]);assert.match(f.summary(),/Complete learning section/);
 f.selectCourse();await f.h.settle();f.accept();await f.h.settle();await oldPay();
 assert.equal(f.writes().length,0,'the old callback stays invalid after returning to the same course scope');
});

for(const delayed of ['catalog','quote'])test('late section '+delayed+' cannot replace the course after switching back',async t=>{
 const pending=deferred(),options=delayed==='catalog'?{loadCatalog:context=>context.kind==='section'?pending.promise:context.reply()}:{loadQuote:context=>context.body.kind==='section'?pending.promise:context.reply()};
 const f=fixture(options);t.after(()=>f.h.cleanup());await f.h.settle();f.selectSection();await f.h.settle();
 const old=f.calls.find(call=>delayed==='catalog'?call.path.startsWith('/payments/catalog?kind=section'):call.path==='/payments/quote'&&call.body.kind==='section');assert.ok(old);
 f.selectCourse();await f.h.settle();assert.match(f.summary(),/Selected individual course/);assert.match(f.summary(),/\$149/);assert.equal(old.signal.aborted,true);
 pending.resolve(delayed==='catalog'?catalogReply({kind:'section',product:section}):quoteReply(old.body));await f.h.settle();
 assert.match(f.summary(),/Selected individual course/);assert.match(f.summary(),/\$149/);assert.doesNotMatch(f.summary(),/Complete learning section|\$299/);assert.equal(f.payment().props.disabled,false);assert.equal(f.writes().length,0);
});

test('a retained pending course checkout blocks selection without losing its retry identity',async t=>{
 const f=fixture({retained:true});t.after(()=>f.h.cleanup());await f.h.settle();const before=f.saved.getItem(safety.checkoutScope('one','course',course));
 assert.equal(f.suggestion().props.disabled,true);assert.equal(f.courseButton().props.disabled,true);
 f.selectSection();await f.h.settle();
 assert.equal(f.suggestion().props.selected,false);assert.match(f.summary(),/Selected individual course/);assert.equal(f.saved.getItem(safety.checkoutScope('one','course',course)),before);assert.equal(f.calls.some(call=>call.path.startsWith('/payments/catalog?kind=section')),false);assert.equal(f.writes().length,0);assert.deepEqual(f.routes,[]);
});

test('selection cannot replace the course while its checkout creation is busy',async t=>{
 const pending=deferred(),f=fixture({create:()=>pending.promise});t.after(()=>f.h.cleanup());await f.h.settle();f.accept();await f.h.settle();
 const pay=f.payment().props.onClick();f.selectSection();await f.h.settle();
 assert.equal(f.writes().length,1);assert.equal(f.suggestion().props.selected,false);assert.equal(f.suggestion().props.disabled,true);assert.match(f.summary(),/Selected individual course/);
 pending.resolve({order:{_id:orderId,provider:'stripe',kind:'course',product:course,status:'pending'},url:'https://checkout.stripe.com/c/pay/selected'});await pay;await f.h.settle();
 assert.equal(f.writes().length,1);assert.deepEqual(f.routes,['https://checkout.stripe.com/c/pay/selected']);assert.equal(safety.readCheckoutAttempt(f.saved,safety.checkoutScope('one','course',course)).orderId,orderId);
});

test('selecting section clears the course discount and consent and obtains a fresh section quote',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();
 f.coupon().props.onChange({target:{value:'COURSE20'}});await f.h.settle();f.button('Apply code').props.onClick();await f.h.settle();f.accept();await f.h.settle();
 assert.equal(f.quotes().at(-1).body.couponCode,'COURSE20');assert.match(f.summary(),/\$129/);assert.equal(f.consent().props.checked,true);
 f.selectSection();await f.h.settle();
 assert.equal(f.coupon().props.value,'');assert.equal(f.consent().props.checked,false);assert.equal(f.button('Remove'),undefined);assert.match(f.summary(),/\$299/);assert.doesNotMatch(f.summary(),/First-term discount|\$129/);
 assert.deepEqual(f.quotes().at(-1).body,{kind:'section',product:section,optionKey:'section-annual',couponCode:'',autoRenew:true,renewalSetup:false});assert.equal(f.writes().length,0);
});

for(const target of ['section','course'])test('payment after switching to '+target+' uses its product, offer and authoritative quote',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();f.selectSection();await f.h.settle();if(target==='course'){f.selectCourse();await f.h.settle();}
 f.accept();await f.h.settle();assert.equal(f.payment().props.disabled,false);await f.payment().props.onClick();await f.h.settle();
 assert.equal(f.writes().length,1);const body=f.writes()[0].body,product=target==='section'?section:course;
 assert.deepEqual(body,{kind:target,product,optionKey:target+'-annual',provider:'stripe',autoRenew:true,renewalSetup:false,termsAccepted:true,couponCode:'',quoteFingerprint:['quote',target,product,target+'-annual','US',''].join(':')});
 const attempt=safety.readCheckoutAttempt(f.saved,safety.checkoutScope('one',target,product));assert.equal(attempt.kind,target);assert.equal(attempt.product,product);assert.equal(attempt.optionKey,target+'-annual');assert.equal(attempt.key,f.writes()[0].headers['Idempotency-Key']);
});

for(const change of ['country','owner','course','option'])test(change+' scope change hides the old section until its course catalogue resolves',async t=>{
 const pending=deferred(),f=fixture({loadCatalog:context=>context.country!=='US'||context.owner!=='one'||context.product!==course||context.requestedOption==='course-short'?pending.promise:context.reply()});t.after(()=>f.h.cleanup());await f.h.settle();f.selectSection();await f.h.settle();assert.equal(f.suggestion().props.slug,section);
 f.changeScope(change);assert.equal(f.suggestion(),undefined);await f.h.settle();assert.equal(f.suggestion(),undefined);
 const latest=f.calls.filter(call=>call.path.startsWith('/payments/catalog?')).at(-1),params=new URLSearchParams(latest.path.split('?')[1]);assert.equal(params.get('kind'),'course');
 pending.resolve(catalogReply({kind:'course',product:params.get('product'),country:f.user.country,owner:f.user.id}));await f.h.settle();
 assert.equal(f.courseButton().props.className,'selected');assert.equal(f.suggestion().props.selected,false);assert.equal(f.suggestion().props.slug,change==='country'?'pk-section':change==='owner'?'other-owner-section':change==='course'?'other-section':section);assert.equal(f.writes().length,0);assert.deepEqual(f.routes,[]);
 if(change==='option'){assert.equal(f.quotes().at(-1).body.optionKey,'course-short');assert.match(f.summary(),/\$59/);}
});
