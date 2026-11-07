const inactiveCatalogAccess=()=>({scope:'fixture-owner',checking:false,unavailable:false,error:'',membershipActive:false,courseAccess:()=>null,sectionAccess:()=>null,refresh(){}});
/** Runs the actual checkout/return callbacks with controlled HTTP responses.
 * Provider settlement and schedule authority are verified by backend tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';

const safety=compileModule('../lib/checkoutSafety.ts'),money=compileModule('../lib/money.ts');
const nodes=tree=>!tree?[]:Array.isArray(tree)?tree.flatMap(nodes):typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
const text=tree=>tree==null||typeof tree==='boolean'?'':Array.isArray(tree)?tree.map(text).join(' '):typeof tree==='object'?text(tree.props?.children):String(tree);
const owner='1'.repeat(24),id='a'.repeat(24),otherId='b'.repeat(24),product='paid-course';
const billingStartsAt='2030-07-01T00:00:00.000Z';
const approval='https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=controlled-approval';
const baseAttempt={owner,kind:'course',product,optionKey:'annual',renewalOf:'',provider:'paypal',key:'paypal-ui-retry-identity-123456',autoRenew:true,couponCode:''};
function storage(){
 const values=new Map();return{get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
const attemptScope=attempt=>safety.checkoutScope(attempt.owner,attempt.kind,attempt.product,attempt.renewalOf,attempt.renewalSetup);
function checkoutFixture({setup=false,saved,available=true,reason='PayPal recurring purchases support terms of 1–12 months.',durationMonths=12,create}={}){
 const h=hookHarness(),browser=browserGlobals(),sessionStorage=storage(),calls=[],navigations=[];
 const query=new URLSearchParams({course:product,option:'annual',...(setup?{renewalSetup:'1'}:{})});
 const router={replace:url=>navigations.push(url),push:url=>navigations.push(url)};
 if(saved)safety.saveCheckoutAttempt(sessionStorage,saved);
 browser.window.location.assign=url=>navigations.push(url);
 const Component=compileModule('../app/checkout/page.tsx',{imports:{
  react:h.React,'react/jsx-runtime':h,'next/navigation':{useRouter:()=>router,useSearchParams:()=>query},
  '../../components/ApiLoadError':{default:()=>null},'../../components/layout/BackButton':{default:()=>null},
  '../../components/SiteHeader':{default:()=>null},'../../components/layout/SiteFooter':{default:()=>null},
  '../../components/auth/AuthProvider':{useAuth:()=>({user:{id:owner,role:'student'},ready:true})},
  '../../lib/money':money,'../../lib/useCatalogAccess':{useCatalogAccess:inactiveCatalogAccess},'../../components/SectionPurchaseSuggestion':{default:'section-suggestion'},'../../components/feedback/FeedbackNotice':{default:'feedback'},'../../lib/checkoutSafety':safety,
  '../../lib/api':{safeStudentNext:value=>value,apiFetch:async(path,options)=>{
   calls.push({path,options});
   if(path==='/payments/methods')return{methods:{stripe:{enabled:true},paypal:{enabled:true}}};
   if(path.startsWith('/payments/catalog?'))return{purchase:{title:'Controlled course',offers:[{key:'annual',label:'Selected term',amountMinor:4900,currency:'USD',durationMonths}]}};
   if(path==='/payments/quote')return{quote:{subtotalMinor:4900,discountMinor:0,amountMinor:4900,renewalAmountMinor:4900,currency:'USD',durationMonths,availableProviders:{stripe:true,paypal:available},providerUnavailableReasons:available?{}:{paypal:reason},fingerprint:'server-bound-current-price',...(setup?{renewalSetup:true,billingStartsAt,amountDueNowMinor:0}:{})}};
   if(path==='/payments/checkout')return create?create(options):{order:{_id:id,kind:'course',product,provider:'paypal',status:'pending',renewalSetup:setup},url:approval};
   if(path==='/payments/checkout-status')return{found:true,order:{_id:id,kind:'course',product,provider:'paypal',status:'creating',renewalSetup:setup},creationPending:true};
   throw Error('Unexpected API call '+path);
  }}
 },globals:{...browser,...h.globals,sessionStorage,navigator:{onLine:true}}}).default;
 h.mount(()=>Component());
 return{h,calls,navigations,sessionStorage,button:()=>nodes(h.tree).find(n=>n.props?.className==='paymentMethod paypal'),consent:()=>nodes(h.tree).find(n=>n.type==='input'&&n.props.type==='checkbox'&&!n.props.disabled&&n.props.checked===false),posts:()=>calls.filter(c=>c.path==='/payments/checkout')};
}

test('PayPal recurring checkout requires consent and submits the selected recurring server quote',async t=>{
 const f=checkoutFixture();t.after(()=>f.h.cleanup());await f.h.settle();
 assert.equal(f.button().props.disabled,false);assert.match(text(f.button()),/Hosted recurring checkout/);
 await f.button().props.onClick();await f.h.settle();assert.equal(f.posts().length,0);assert.match(text(f.h.tree),/accept the purchase and renewal terms/);
 f.consent().props.onChange({target:{checked:true}});await f.h.settle();await f.button().props.onClick();await f.h.settle();
 assert.equal(f.posts().length,1);assert.deepEqual(JSON.parse(f.posts()[0].options.body),{kind:'course',product,optionKey:'annual',provider:'paypal',autoRenew:true,renewalSetup:false,termsAccepted:true,couponCode:'',quoteFingerprint:'server-bound-current-price'});
 assert.match(f.posts()[0].options.headers['Idempotency-Key'],/^[-_a-zA-Z0-9]{16,128}$/);
 assert.deepEqual(f.navigations,[approval]);
 const saved=safety.readCheckoutAttempt(f.sessionStorage,safety.checkoutScope(owner,'course',product));assert.equal(saved.provider,'paypal');assert.equal(saved.autoRenew,true);assert.equal(saved.orderId,id);
});

test('PayPal deferred setup displays zero due now, locks renewal and sends no coupon',async t=>{
 const f=checkoutFixture({setup:true});t.after(()=>f.h.cleanup());await f.h.settle();
 assert.match(text(f.h.tree),/No payment is collected now/);assert.match(text(f.button()),/Set up renewal with PayPal/);
 const total=nodes(f.h.tree).find(n=>n.type==='div'&&nodes(n).some(child=>child.type==='span'&&text(child)==='Total due now')&&nodes(n).some(child=>child.type==='b'&&text(child)==='$0'));assert.ok(total);
 const renewal=nodes(f.h.tree).find(n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.checked===true);assert.equal(renewal.props.disabled,true);
 assert.equal(nodes(f.h.tree).some(n=>n.props?.id==='checkout-coupon'),false);
 f.consent().props.onChange({target:{checked:true}});await f.h.settle();await f.button().props.onClick();await f.h.settle();
 const body=JSON.parse(f.posts()[0].options.body);assert.equal(body.provider,'paypal');assert.equal(body.renewalSetup,true);assert.equal(body.autoRenew,true);assert.equal(body.termsAccepted,true);assert.equal(body.couponCode,'');
 assert.deepEqual(f.navigations,[approval]);assert.equal(safety.readCheckoutAttempt(f.sessionStorage,safety.checkoutScope(owner,'course',product,'',true)).orderId,id);
});

test('restoring a PayPal deferred attempt reuses its owned key instead of creating a fresh identity',async t=>{
 const saved={...baseAttempt,renewalSetup:true,orderId:id},f=checkoutFixture({setup:true,saved});t.after(()=>f.h.cleanup());await f.h.settle();
 assert.match(text(f.h.tree),/existing checkout was found/);f.consent().props.onChange({target:{checked:true}});await f.h.settle();await f.button().props.onClick();await f.h.settle();
 assert.equal(f.posts().length,1);assert.equal(f.posts()[0].options.headers['Idempotency-Key'],saved.key);assert.equal(f.calls.some(c=>c.path==='/payments/checkout/release'),false);assert.deepEqual(f.navigations,[approval]);
});

test('an unavailable PayPal recurring term shows the server reason and its callback cannot create checkout',async t=>{
 const reason='PayPal recurring purchases support terms of 1–12 months.',f=checkoutFixture({available:false,durationMonths:20,reason});t.after(()=>f.h.cleanup());await f.h.settle();
 assert.equal(f.button().props.disabled,true);assert.match(text(f.button()),/PayPal recurring purchases support terms of 1–12 months/);
 f.consent().props.onChange({target:{checked:true}});await f.h.settle();await f.button().props.onClick();await f.h.settle();
 assert.equal(f.posts().length,0);assert.deepEqual(f.navigations,[]);assert.equal(f.sessionStorage.length,0);
});

test('a deferred checkout create response cannot turn setup into a paid purchase or erase recovery identity',async t=>{
 const f=checkoutFixture({setup:true,create:async()=>({order:{...setupOrder,status:'paid',paidAt:'2030-01-01T00:00:00Z'}})});t.after(()=>f.h.cleanup());await f.h.settle();
 f.consent().props.onChange({target:{checked:true}});await f.h.settle();await f.button().props.onClick();await f.h.settle();
 assert.equal(f.posts().length,1);assert.deepEqual(f.navigations,[]);assert.ok(safety.readCheckoutAttempt(f.sessionStorage,safety.checkoutScope(owner,'course',product,'',true)));assert.doesNotMatch(text(f.h.tree),/Your payment has been verified|View payment receipt/);
 const recovery=f.calls.filter(c=>c.path==='/payments/checkout-status');assert.equal(recovery.length,1);assert.equal(recovery[0].options.headers['Idempotency-Key'],f.posts()[0].options.headers['Idempotency-Key']);assert.equal(recovery[0].options.method,undefined);
});

function returnFixture(order){
 const h=hookHarness(),jsx=(type,props,key)=>typeof type==='function'&&type.name==='FeedbackNotice'?type(props):h.jsx(type,props,key),browser=browserGlobals(),sessionStorage=storage(),calls=[];
 const current={...baseAttempt,renewalSetup:true,orderId:id},other={...baseAttempt,product:'other-course',renewalSetup:true,orderId:otherId};
 safety.saveCheckoutAttempt(sessionStorage,current);safety.saveCheckoutAttempt(sessionStorage,other);
 const query=new URLSearchParams({order:id}),router={replace(){}};
 const Component=compileModule('../app/checkout/return/page.tsx',{imports:{
  react:h.React,'react/jsx-runtime':{...h,jsx,jsxs:jsx},'next/link':{default:()=>null},'next/navigation':{useRouter:()=>router,useSearchParams:()=>query},
  '../../../components/auth/AuthProvider':{useAuth:()=>({user:{id:owner,role:'student'},ready:true})},'../../../components/SiteHeader':{default:()=>null},'../../../components/layout/SiteFooter':{default:()=>null},
  '../../../lib/money':money,'../../../lib/checkoutSafety':safety,'../../../lib/api':{isAbortError:e=>e?.name==='AbortError',apiFetch:async(path,options)=>{calls.push({path,options});return{order};}}
 },globals:{...browser,...h.globals,sessionStorage,navigator:{onLine:true}}}).default;
 h.mount(()=>Component());return{h,browser,calls,sessionStorage,current,other};
}
const setupOrder={_id:id,kind:'course',product,title:'Controlled course',provider:'paypal',status:'renewal_ready',renewalSetup:true,amountMinor:4900,amountDueNowMinor:0,currency:'USD',billingStartsAt};
test('PayPal confirmed future setup clears only its attempt, stops polling and never shows a paid receipt',async t=>{
 const f=returnFixture(setupOrder);t.after(()=>f.h.cleanup());await f.h.settle();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'POST');assert.match(text(f.h.tree),/Automatic renewal is scheduled/);assert.match(text(f.h.tree),/confirmed by\s+PayPal/);assert.match(text(f.h.tree),/did not create a new paid term/);assert.doesNotMatch(text(f.h.tree),/View payment receipt|Your payment has been verified|You’re ready to learn/);
 assert.equal(f.sessionStorage.getItem(attemptScope(f.current)),null);assert.ok(safety.readCheckoutAttempt(f.sessionStorage,attemptScope(f.other)));
 f.h.run(6000);f.browser.window.dispatchEvent(new Event('online'));f.browser.window.dispatchEvent(new Event('pageshow'));await f.h.settle();assert.equal(f.calls.length,1);assert.equal(f.h.timers.size,0);
 assert.ok(nodes(f.h.tree).some(n=>n.props?.href==='/billing'&&text(n)==='Manage automatic renewal →'));assert.equal(nodes(f.h.tree).some(n=>n.props?.href==='/learn/'+product),false);
});

test('a PayPal setup response marked paid is rejected without granting UI success or clearing the owned attempt',async t=>{
 const f=returnFixture({...setupOrder,status:'paid',paidAt:'2030-01-01T00:00:00Z'});t.after(()=>f.h.cleanup());await f.h.settle();
 assert.match(text(f.h.tree),/no paid access is inferred from setup/);assert.ok(nodes(f.h.tree).some(n=>n.props?.role==='alert'));assert.doesNotMatch(text(f.h.tree),/Automatic renewal is scheduled|You’re ready to learn|View payment receipt|Your payment has been verified/);assert.ok(safety.readCheckoutAttempt(f.sessionStorage,attemptScope(f.current)));assert.equal(f.calls.length,1);
});
