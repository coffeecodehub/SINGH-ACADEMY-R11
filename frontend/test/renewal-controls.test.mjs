/** Execute the actual billing component with hook/HTTP doubles. The backend
 * separately verifies real HTTP, MongoDB and Stripe SDK transport contracts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
function feedbackRuntime(h){const jsx=(type,props,key)=>typeof type==='function'&&type.name==='FeedbackNotice'?type(props):h.jsx(type,props,key);return {...h,jsx,jsxs:jsx};}
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const text=t=>t==null||typeof t==='boolean'?'':Array.isArray(t)?t.map(text).join(' '):typeof t==='object'?text(t.props?.children):String(t);
const base={_id:'agreement',title:'Section access',kind:'section',product:'mediation',provider:'stripe',status:'active',autoRenew:false,cancelAtPeriodEnd:true,currentPeriodEnd:'2030-05-01T00:00:00Z',intervalMonths:3,amountMinor:2700,currency:'USD',canEnableRenewal:true,canDisableRenewal:false,renewalConsentFingerprint:'saved-undiscounted-price'};
const setupBase={key:'section:mediation',kind:'section',product:'mediation',title:'Section access',accessExpiresAt:'2030-05-01T00:00:00Z',amountMinor:2700,currency:'USD',intervalMonths:3,renewalSetup:true,billingStartsAt:'2030-05-01T00:00:00Z',amountDueNowMinor:0,canSetup:true,setupUrl:'/checkout?section=mediation&option=three&renewalSetup=1'};
function fixture({items=[base],setupItems=[],mutate,afterWriteRead}={}){
 const h=hookHarness(),b=browserGlobals(),calls=[],messages=[];let records=structuredClone(items),changed=0,owner='student-a';
 b.window.confirm=()=>{throw new Error('Billing actions must use the in-page confirmation card.');};
 const Component=compileModule('../components/billing/AutoRenewals.tsx',{imports:{react:h.React,'react/jsx-runtime':feedbackRuntime(h),'./PaidAccessIndicator':{default:'paid-access-indicator'},'./BillingCancellationDialog':{default:'cancellation-dialog'},'./BillingActionConfirmation':{default:'action-confirmation',BillingActionIcon:'action-icon'},'../../lib/money':compileModule('../lib/money.ts'),'../../lib/checkoutSafety':compileModule('../lib/checkoutSafety.ts'),'../../lib/api':{apiFetch:async(path,options)=>{
  calls.push({path,options});if(!options?.method){if(afterWriteRead&&calls.some(call=>call.options?.method))return afterWriteRead();return {items:records,setupItems};}
  const result=mutate?await mutate(path,options):{item:{...records[0],autoRenew:path.endsWith('/resume'),cancelAtPeriodEnd:!path.endsWith('/resume'),canEnableRenewal:!path.endsWith('/resume'),canDisableRenewal:path.endsWith('/resume')}};
  if(result.item){if(path.includes('/purchases/'))setupItems=[];else records=[result.item];}return result;
 }}},globals:{...b,...h.globals}}).default;
 h.mount(()=>Component({owner,onChanged:()=>changed++}));
 return {h,calls,messages,window:b.window,async confirmAction(){await h.settle();const dialog=nodes(h.tree).find(n=>n.type==='action-confirmation'&&n.props.open);assert.ok(dialog,'Renewal actions must expose an explicit confirmation card');messages.push(dialog.props.message);dialog.props.onConfirm();await h.settle();},actionDialog(){return nodes(h.tree).find(n=>n.type==='action-confirmation'&&n.props.open);},async confirmCancellation(){await h.settle();const dialog=nodes(h.tree).find(n=>n.type==='cancellation-dialog'&&n.props.open);assert.ok(dialog,'Cancellation must expose an explicit confirmation card');dialog.props.onConfirm();await h.settle();},dialog(){return nodes(h.tree).find(n=>n.type==='cancellation-dialog'&&n.props.open);},get changed(){return changed;},setOwner(next){owner=next;records=[];setupItems=[];h.render();},button(name){return nodes(h.tree).find(n=>n.type==='button'&&text(n).trim()===name);},writes(){return calls.filter(c=>c.options?.method==='POST');}};
}
test('one-time billing visibly shows renewal off and directs enabling to a new consented checkout',async t=>{
 const f=fixture({items:[]});t.after(()=>f.h.cleanup());await f.h.settle();
 assert.match(text(f.h.tree),/Automatic renewal off/);assert.match(text(f.h.tree),/one-time purchases do not renew or charge automatically/);assert.match(text(f.h.tree),/select automatic renewal during checkout/);
 assert.ok(nodes(f.h.tree).some(n=>n.props?.href==='/academy'));assert.equal(f.writes().length,0);
});
test('enabling shows the undiscounted price/interval in explicit confirmation and sends bound consent',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();f.button('Enable automatic renewal').props.onClick();await f.h.settle();assert.equal(f.writes().length,0);assert.equal(f.actionDialog().props.title,base.title);assert.equal(f.actionDialog().props.action,'enable');await f.confirmAction();
 assert.equal(f.writes().length,1);assert.equal(f.writes()[0].path,'/payments/mine/agreements/agreement/resume');assert.deepEqual(JSON.parse(f.writes()[0].options.body),{termsAccepted:true,consentFingerprint:base.renewalConsentFingerprint});
 assert.match(f.messages[0],/\$27 every 3 month\(s\)/);assert.match(f.messages[0],/First-term discounts do not repeat/);assert.match(f.messages[0],/until you disable renewal/);
 assert.ok(f.button('Disable automatic renewal'));assert.match(text(f.h.tree),/Stripe confirmed automatic renewal is on/);assert.equal(f.changed,1);
});
test('declining confirmation never sends a renewal request',async t=>{
 const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();f.button('Enable automatic renewal').props.onClick();await f.h.settle();assert.equal(f.writes().length,0);f.actionDialog().props.onCancel();await f.h.settle();assert.equal(f.writes().length,0);assert.equal(f.actionDialog(),undefined);assert.ok(f.button('Enable automatic renewal'));
});
test('disable retains paid-access explanation and only trusts a confirmed provider result',async t=>{
 const f=fixture({items:[{...base,autoRenew:true,cancelAtPeriodEnd:false,canEnableRenewal:false,canDisableRenewal:true}]});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Disable automatic renewal').props.onClick();await f.confirmAction();
 assert.equal(f.writes()[0].path,'/payments/mine/agreements/agreement/cancel');assert.match(f.messages[0],/paid access remains until its end date/);assert.match(text(f.h.tree),/already-paid access is retained/);assert.ok(f.button('Enable automatic renewal'));
});
test('failed provider confirmation stays visible, leaves the control available and does not claim success',async t=>{
 const f=fixture({mutate:async()=>{throw Error('Provider change is still uncertain');}});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Enable automatic renewal').props.onClick();await f.confirmAction();
 assert.ok(nodes(f.h.tree).some(n=>n.props?.role==='alert'&&text(n).includes('Provider change is still uncertain')));assert.ok(f.button('Enable automatic renewal'));assert.equal(f.changed,0);assert.equal(f.writes().length,1);assert.doesNotMatch(text(f.h.tree),/Stripe confirmed automatic renewal is on/);
});
test('double clicks while confirmation is pending submit only one mutation',async t=>{
 let resolve;const pending=new Promise(r=>resolve=r),f=fixture({mutate:()=>pending});t.after(()=>f.h.cleanup());await f.h.settle();const button=f.button('Enable automatic renewal');button.props.onClick();button.props.onClick();await f.h.settle();assert.equal(f.writes().length,0);const confirm=f.actionDialog().props.onConfirm;confirm();confirm();await f.h.settle();assert.equal(f.writes().length,1);
 resolve({item:{...base,autoRenew:true,cancelAtPeriodEnd:false,canEnableRenewal:false,canDisableRenewal:true}});await f.h.settle();assert.equal(f.changed,1);
});
test('ended agreements disappear from current renewal cards and paid purchases retain their own setup action',async t=>{
 const f=fixture({items:[{...base,status:'cancelled',canEnableRenewal:false}],setupItems:[setupBase]});t.after(()=>f.h.cleanup());await f.h.settle();assert.equal(f.button('Enable automatic renewal'),undefined);assert.ok(nodes(f.h.tree).some(n=>n.props?.href===setupBase.setupUrl));assert.doesNotMatch(text(f.h.tree),/This payment agreement has ended/);assert.equal(nodes(f.h.tree).filter(n=>n.type==='article').length,1);
});
test('an account change discards a previous owner’s delayed action result',async t=>{
 let resolve;const pending=new Promise(r=>resolve=r),f=fixture({mutate:()=>pending});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Enable automatic renewal').props.onClick();await f.confirmAction();f.setOwner('student-b');await f.h.settle();resolve({item:{...base,autoRenew:true}});await f.h.settle();assert.equal(f.changed,0);assert.match(text(f.h.tree),/No recurring payment agreement/);assert.doesNotMatch(text(f.h.tree),/Stripe confirmed automatic renewal is on/);
});

test('a real paid one-time purchase has an active product-specific deferred setup action',async t=>{
 const f=fixture({items:[],setupItems:[setupBase]});t.after(()=>f.h.cleanup());await f.h.settle();
 const action=nodes(f.h.tree).find(n=>n.type==='a'&&text(n)==='Set up automatic renewal');assert.ok(action);assert.equal(action.props.href,setupBase.setupUrl);assert.match(text(f.h.tree),/No charge is taken now/);assert.match(text(f.h.tree),/paid access remain intact/);assert.doesNotMatch(text(f.h.tree),/No recurring payment agreement/);assert.equal(f.writes().length,0);
});
test('an unsupported scheduling window explains the provider limit without charging now',async t=>{
 const f=fixture({items:[],setupItems:[{...setupBase,canSetup:false,unavailableReason:'Stripe can schedule at most 730 days ahead.'}]});t.after(()=>f.h.cleanup());await f.h.settle();assert.equal(nodes(f.h.tree).some(n=>n.props?.href===setupBase.setupUrl),false);assert.match(text(f.h.tree),/730 days/);assert.equal(f.writes().length,0);
});
test('a confirmed deferred agreement visibly schedules renewal and keeps its disable control active',async t=>{
 const f=fixture({items:[{...base,status:'trialing',renewalSetup:true,autoRenew:true,cancelAtPeriodEnd:false,canDisableRenewal:true,canEnableRenewal:false}]});t.after(()=>f.h.cleanup());await f.h.settle();assert.match(text(f.h.tree),/Automatic renewal scheduled/);assert.match(text(f.h.tree),/No payment was taken for this setup/);assert.ok(f.button('Disable automatic renewal'));
});
test('PayPal suspend/resume names the real provider and sends the same bound consent',async t=>{
 const item={...base,provider:'paypal',status:'paused',cancelAtPeriodEnd:false,renewalControlMode:'suspend'},f=fixture({items:[item],mutate:async path=>{const enable=path.endsWith('/resume');return{item:{...item,status:enable?'active':'paused',autoRenew:enable,cancelAtPeriodEnd:false,canEnableRenewal:!enable,canDisableRenewal:enable}};}});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Enable automatic renewal').props.onClick();await f.confirmAction();
 assert.match(f.messages[0],/You authorize PayPal to charge \$27/);assert.doesNotMatch(f.messages[0],/Stripe/);assert.deepEqual(JSON.parse(f.writes()[0].options.body),{termsAccepted:true,consentFingerprint:item.renewalConsentFingerprint});assert.match(text(f.h.tree),/PayPal confirmed automatic renewal is on/);
 f.button('Disable automatic renewal').props.onClick();await f.confirmAction();assert.match(f.messages[1],/Future charges are suspended once PayPal confirms/);assert.match(text(f.h.tree),/PayPal confirmed automatic renewal is off/);assert.ok(f.button('Enable automatic renewal'));
});
test('PayPal active future setup is scheduled and never described as paid access',async t=>{
 const f=fixture({items:[{...base,provider:'paypal',status:'active',renewalSetup:true,billingStartsAt:'2099-01-01T00:00:00Z',autoRenew:true,cancelAtPeriodEnd:false,canDisableRenewal:true,canEnableRenewal:false}]});t.after(()=>f.h.cleanup());await f.h.settle();assert.match(text(f.h.tree),/Automatic renewal scheduled/);assert.match(text(f.h.tree),/No payment was taken for this setup/);assert.ok(f.button('Disable automatic renewal'));
});
test('a response for another provider cannot be reported as a confirmed renewal change',async t=>{
 const f=fixture({items:[{...base,provider:'paypal'}],mutate:async()=>({item:{...base,autoRenew:true,cancelAtPeriodEnd:false}})});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Enable automatic renewal').props.onClick();await f.confirmAction();assert.match(text(f.h.tree),/has not confirmed this renewal setting/);assert.doesNotMatch(text(f.h.tree),/PayPal confirmed/);assert.equal(f.changed,0);
});

const disabledPayPal={...base,provider:'paypal',status:'paused',autoRenew:false,cancelAtPeriodEnd:false,renewalControlMode:'suspend',canEnableRenewal:false,canDisableRenewal:false,canEndDisabledAgreement:true};
const endedPayPal={...disabledPayPal,status:'cancelled',canEndDisabledAgreement:false,renewalActionPending:false};
const endName='End this disabled agreement';
test('ending a disabled PayPal agreement requires explicit confirmation and a provider-confirmed terminal result',async t=>{
 const f=fixture({items:[disabledPayPal],setupItems:[setupBase],mutate:async()=>({item:endedPayPal})});t.after(()=>f.h.cleanup());await f.h.settle();
 assert.ok(f.button(endName));f.button(endName).props.onClick();await f.confirmAction();
 assert.equal(f.writes().length,1);assert.equal(f.writes()[0].path,'/payments/mine/agreements/agreement/end');assert.equal(f.writes()[0].options.method,'POST');assert.deepEqual(JSON.parse(f.writes()[0].options.body),{});
 assert.match(f.messages[0],/PayPal/);assert.match(f.messages[0],/paid access.*(?:retained|remain|unchanged)/i);assert.match(f.messages[0],/new checkout/i);assert.match(f.messages[0],/consent/i);
 assert.match(text(f.h.tree),/PayPal confirmed.*(?:ended|closed)/i);assert.match(text(f.h.tree),/already-paid access.*retained|paid access.*unchanged/i);assert.equal(f.button(endName),undefined);assert.equal(f.changed,1);assert.ok(nodes(f.h.tree).some(n=>text(n)==='Set up automatic renewal'&&n.props?.href===setupBase.setupUrl));
});
test('declining the end-agreement confirmation sends no mutation and preserves the disabled agreement',async t=>{
 const f=fixture({items:[disabledPayPal]});t.after(()=>f.h.cleanup());await f.h.settle();f.button(endName).props.onClick();await f.h.settle();f.actionDialog().props.onCancel();await f.h.settle();
 assert.equal(f.writes().length,0);assert.equal(f.changed,0);assert.ok(f.button(endName));assert.doesNotMatch(text(f.h.tree),/PayPal confirmed.*(?:ended|closed)/i);
});
test('an unresolved end action exposes only its own retry and reuses the end endpoint until confirmed',async t=>{
 const pending={...disabledPayPal,renewalActionPending:true,renewalPendingAction:'end',canEnableRenewal:true,canDisableRenewal:true};let attempts=0;
 const f=fixture({items:[pending],mutate:async()=>({item:++attempts===1?pending:endedPayPal})});t.after(()=>f.h.cleanup());await f.h.settle();
 assert.equal(f.button(endName),undefined);assert.equal(f.button('Enable automatic renewal'),undefined);assert.equal(f.button('Disable automatic renewal'),undefined);assert.equal(f.button('Retry enabling automatic renewal'),undefined);assert.equal(f.button('Retry disabling automatic renewal'),undefined);
 f.button('Retry ending this disabled agreement').props.onClick();await f.confirmAction();assert.equal(f.changed,0);assert.ok(f.button('Retry ending this disabled agreement'));assert.ok(nodes(f.h.tree).some(n=>n.props?.role==='alert'));assert.doesNotMatch(text(f.h.tree),/PayPal confirmed.*(?:ended|closed)/i);
 f.button('Retry ending this disabled agreement').props.onClick();await f.confirmAction();assert.equal(f.changed,1);assert.equal(f.writes().length,2);for(const call of f.writes()){assert.equal(call.path,'/payments/mine/agreements/agreement/end');assert.deepEqual(JSON.parse(call.options.body),{});}assert.equal(f.button('Retry ending this disabled agreement'),undefined);
});
test('a provider-confirmed expired PayPal agreement is also terminal after the end action',async t=>{
 const f=fixture({items:[disabledPayPal],mutate:async()=>({item:{...endedPayPal,status:'expired'}})});t.after(()=>f.h.cleanup());await f.h.settle();f.button(endName).props.onClick();await f.confirmAction();assert.equal(f.changed,1);assert.match(text(f.h.tree),/PayPal confirmed.*ended/i);assert.equal(f.button(endName),undefined);assert.doesNotMatch(text(f.h.tree),/This payment agreement has ended/);assert.match(text(f.h.tree),/No recurring payment agreement/);
});
for(const patch of [
 {_id:'another-agreement'},{provider:'stripe'},{kind:'course'},{product:'another-product'},
 {autoRenew:true},{status:'paused'},{status:'active'},{renewalActionPending:true},{renewalActionPending:undefined},{renewalPendingAction:'end'},{cancelAtPeriodEnd:true},{canEndDisabledAgreement:true}
])test('ending PayPal cannot claim confirmation from an unsafe result: '+JSON.stringify(patch),async t=>{
 const f=fixture({items:[disabledPayPal],mutate:async()=>({item:{...endedPayPal,...patch}})});t.after(()=>f.h.cleanup());await f.h.settle();f.button(endName).props.onClick();await f.confirmAction();
 assert.equal(f.writes().length,1);assert.equal(f.changed,0);assert.ok(nodes(f.h.tree).some(n=>n.props?.role==='alert'));assert.doesNotMatch(text(f.h.tree),/PayPal confirmed.*(?:ended|closed)/i);assert.ok(f.button(endName));
});
test('an uncertain PayPal end request remains retryable without claiming that the agreement ended',async t=>{
 const f=fixture({items:[disabledPayPal],mutate:async()=>{throw Error('PayPal has not confirmed the agreement ended.');}});t.after(()=>f.h.cleanup());await f.h.settle();f.button(endName).props.onClick();await f.confirmAction();
 assert.equal(f.writes().length,1);assert.equal(f.changed,0);assert.match(text(f.h.tree),/PayPal has not confirmed/);assert.ok(f.button(endName));assert.doesNotMatch(text(f.h.tree),/PayPal confirmed.*(?:ended|closed)/i);
});
test('ending a disabled agreement shares the mutation lock with duplicate clicks and other renewal actions',async t=>{
 let resolve;const pending=new Promise(r=>resolve=r),f=fixture({items:[disabledPayPal,{...base,_id:'second-agreement'}],mutate:()=>pending});t.after(()=>f.h.cleanup());await f.h.settle();
 const end=f.button(endName),enable=f.button('Enable automatic renewal');end.props.onClick();end.props.onClick();enable.props.onClick();await f.h.settle();assert.equal(f.writes().length,0);assert.equal(f.actionDialog().props.subject,'this disabled agreement');await f.confirmAction();end.props.onClick();enable.props.onClick();await f.h.settle();assert.equal(f.writes().length,1);assert.equal(f.messages.length,1);assert.equal(f.changed,0);
 resolve({item:endedPayPal});await f.h.settle();assert.equal(f.changed,1);assert.equal(f.writes().length,1);
});
test('a delayed end-agreement response for a previous account cannot change the new account UI',async t=>{
 let resolve;const pending=new Promise(r=>resolve=r),f=fixture({items:[disabledPayPal],mutate:()=>pending});t.after(()=>f.h.cleanup());await f.h.settle();f.button(endName).props.onClick();await f.confirmAction();f.setOwner('student-b');await f.h.settle();
 resolve({item:endedPayPal});await f.h.settle();assert.equal(f.changed,0);assert.equal(f.writes().length,1);assert.match(text(f.h.tree),/No recurring payment agreement/);assert.doesNotMatch(text(f.h.tree),/PayPal confirmed.*(?:ended|closed)/i);assert.equal(f.button(endName),undefined);
});
for(const patch of [{canEndDisabledAgreement:false},{provider:'stripe'},{autoRenew:true}])test('ending is hidden without the disabled PayPal authority: '+JSON.stringify(patch),async t=>{
 const f=fixture({items:[{...disabledPayPal,...patch}]});t.after(()=>f.h.cleanup());await f.h.settle();assert.equal(f.button(endName),undefined);assert.equal(f.writes().length,0);
});

const cancelItem={...base,autoRenew:true,cancelAtPeriodEnd:false,canEnableRenewal:false,canDisableRenewal:true,canCancelAccess:true};
const cancelledAccess={...cancelItem,status:'cancelled',autoRenew:false,canCancelAccess:false,canEnableRenewal:false,canDisableRenewal:false,renewalActionPending:false,accessCancelledAt:'2026-11-06T12:00:00Z'};
for(const provider of ['stripe','paypal'])test(provider+' immediate cancellation requires consent and exact server confirmation without issuing a refund',async t=>{
 const f=fixture({items:[{...cancelItem,provider}],mutate:async()=>({item:{...cancelledAccess,provider},immediateRevocation:true,noRefund:true})});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Cancel subscription now').props.onClick();await f.confirmCancellation();assert.equal(f.writes()[0].path,'/payments/mine/agreements/agreement/cancel-now');assert.deepEqual(JSON.parse(f.writes()[0].options.body),{confirmImmediateCancellation:true});assert.equal(f.messages.length,0,'Immediate cancellation uses the in-page card, not a native prompt');assert.match(text(f.h.tree),/Cancellation confirmed/);assert.match(text(f.h.tree),/No refund was issued/);assert.equal(f.changed,1);assert.equal(f.button('Cancel subscription now'),undefined);
});
test('declining immediate cancellation preserves access and sends no request',async t=>{const f=fixture({items:[cancelItem]});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Cancel subscription now').props.onClick();await f.h.settle();assert.equal(f.writes().length,0);f.dialog().props.onCancel();await f.h.settle();assert.equal(f.writes().length,0);assert.equal(f.changed,0);assert.equal(f.dialog(),undefined);});
for(const patch of [{immediateRevocation:false},{noRefund:false},{item:{...cancelledAccess,product:'other'}},{item:{...cancelledAccess,provider:'paypal'}},{item:{...cancelledAccess,accessCancelledAt:undefined}},{item:{...cancelledAccess,renewalActionPending:true}}])test('immediate cancellation refuses incomplete or wrong identity evidence '+JSON.stringify(patch),async t=>{const f=fixture({items:[cancelItem],mutate:async()=>({item:cancelledAccess,immediateRevocation:true,noRefund:true,...patch})});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Cancel subscription now').props.onClick();await f.confirmCancellation();assert.equal(f.changed,0);assert.doesNotMatch(text(f.h.tree),/Cancellation confirmed/);assert.match(text(f.h.tree),/has not been confirmed/);});
test('one-time paid purchase cancellation uses only its owned invoice endpoint',async t=>{const invoiceId='b'.repeat(24),f=fixture({items:[],setupItems:[{...setupBase,invoiceId,canCancelActivePurchase:true}],mutate:async()=>({item:{_id:invoiceId,invoiceId,kind:'section',product:'mediation',canCancelActivePurchase:false,accessCancelledAt:'2026-11-06T12:00:00Z'},immediateRevocation:true,noRefund:true})});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Cancel purchase access now').props.onClick();await f.confirmCancellation();assert.equal(f.writes()[0].path,'/payments/mine/purchases/'+invoiceId+'/cancel-now');assert.equal(f.changed,1);assert.match(text(f.h.tree),/Cancellation confirmed/);});
test('pending immediate cancellation exposes its own retry instead of renewal mutation controls',async t=>{const f=fixture({items:[{...cancelItem,renewalActionPending:true,renewalPendingAction:'cancel_access'}],mutate:async()=>({item:cancelledAccess,immediateRevocation:true,noRefund:true})});t.after(()=>f.h.cleanup());await f.h.settle();assert.ok(f.button('Retry cancelling subscription now'));assert.equal(f.button('Retry disabling automatic renewal'),undefined);f.button('Retry cancelling subscription now').props.onClick();await f.confirmCancellation();assert.equal(f.changed,1);});

test('an unconfirmed cancellation card from a previous account cannot submit a provider action',async t=>{const f=fixture({items:[cancelItem]});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Cancel subscription now').props.onClick();await f.h.settle();const old=f.dialog();assert.ok(old);assert.equal(f.writes().length,0);f.setOwner('next-owner');await f.h.settle();old.props.onConfirm();await f.h.settle();assert.equal(f.writes().length,0);assert.equal(f.changed,0);});
test('immediate cancellation shares the single-flight lock across stale confirm clicks',async t=>{let resolve;const pending=new Promise(r=>resolve=r),f=fixture({items:[cancelItem],mutate:()=>pending});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Cancel subscription now').props.onClick();await f.h.settle();const confirm=f.dialog().props.onConfirm;confirm();confirm();await f.h.settle();assert.equal(f.writes().length,1);resolve({item:cancelledAccess,immediateRevocation:true,noRefund:true});await f.h.settle();assert.equal(f.changed,1);});

const pendingItem={...base,status:'creating',autoRenew:true,pendingCheckout:true,checkoutOrderId:'a'.repeat(24),checkoutStatus:'pending',canContinueCheckout:true,canCancelPendingCheckout:true,canEnableRenewal:false,canDisableRenewal:false};
const pendingOrder={_id:pendingItem.checkoutOrderId,kind:pendingItem.kind,product:pendingItem.product,provider:pendingItem.provider,status:'pending',cancellationRequested:false};
test('pending checkout is distinct from a subscription and Continue opens only the owned provider URL',async t=>{const f=fixture({items:[pendingItem],mutate:async()=>({item:pendingItem,order:pendingOrder,url:'https://checkout.stripe.com/c/pay/original'})});t.after(()=>f.h.cleanup());const addresses=[];f.window.location.assign=url=>addresses.push(url);await f.h.settle();assert.match(text(f.h.tree),/Pending checkout/);assert.equal(f.button('Cancel subscription now'),undefined);assert.equal(f.button('Refresh renewals'),undefined);f.button('Continue checkout').props.onClick();f.button('Continue checkout').props.onClick();await f.h.settle();assert.equal(f.writes().length,1);assert.deepEqual(addresses,['https://checkout.stripe.com/c/pay/original']);});
test('Continue refuses a provider URL from an untrusted host',async t=>{const f=fixture({items:[pendingItem],mutate:async()=>({item:pendingItem,order:pendingOrder,url:'https://checkout.stripe.com.attacker.invalid/pay'})});t.after(()=>f.h.cleanup());let opened=false;f.window.location.assign=()=>opened=true;await f.h.settle();f.button('Continue checkout').props.onClick();await f.h.settle();assert.equal(opened,false);assert.match(text(f.h.tree),/Invalid provider checkout address/);});
test('declining pending checkout cancellation keeps the card and sends no write',async t=>{const f=fixture({items:[pendingItem]});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Cancel pending checkout').props.onClick();await f.h.settle();assert.equal(f.writes().length,0);assert.equal(f.actionDialog().props.subject,'this pending checkout');f.actionDialog().props.onCancel();await f.h.settle();assert.equal(f.writes().length,0);assert.ok(f.button('Continue checkout'));});
test('provider-confirmed pending cancellation removes its card without claiming a paid refund or access revocation',async t=>{const item={...pendingItem,status:'cancelled',autoRenew:false,pendingCheckout:false,canCancelPendingCheckout:false,canContinueCheckout:false},f=fixture({items:[pendingItem],mutate:async()=>({checkoutCancelled:true,item,order:{...pendingOrder,status:'expired'}})});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Cancel pending checkout').props.onClick();await f.confirmAction();assert.equal(f.writes()[0].path,'/payments/mine/agreements/agreement/cancel-pending');assert.deepEqual(JSON.parse(f.writes()[0].options.body),{confirmPendingCancellation:true});assert.match(text(f.h.tree),/Pending checkout cancelled/);assert.equal(f.button('Continue checkout'),undefined);assert.equal(nodes(f.h.tree).filter(n=>n.type==='article').length,0);assert.equal(f.changed,1);});
test('unconfirmed pending cancellation keeps its original card for retry',async t=>{const f=fixture({items:[pendingItem],mutate:async()=>{throw Error('Provider closure is still uncertain');}});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Cancel pending checkout').props.onClick();await f.confirmAction();assert.match(text(f.h.tree),/Provider closure is still uncertain/);assert.ok(f.button('Cancel pending checkout'));assert.equal(f.changed,0);assert.doesNotMatch(text(f.h.tree),/Pending checkout cancelled/);});
test('a completed purchase wins a pending cancellation race without hiding the active agreement',async t=>{const item={...pendingItem,status:'active',pendingCheckout:false,canContinueCheckout:false,canCancelPendingCheckout:false,canDisableRenewal:true},f=fixture({items:[pendingItem],mutate:async()=>({checkoutCancelled:false,item,order:{...pendingOrder,status:'paid'}})});t.after(()=>f.h.cleanup());await f.h.settle();f.button('Cancel pending checkout').props.onClick();await f.confirmAction();assert.match(text(f.h.tree),/already completed/);assert.ok(f.button('Disable automatic renewal'));assert.doesNotMatch(text(f.h.tree),/Pending checkout cancelled/);});
test('pending continuation result cannot navigate after an account change',async t=>{let resolve;const wait=new Promise(r=>resolve=r),f=fixture({items:[pendingItem],mutate:()=>wait});t.after(()=>f.h.cleanup());let opened=false;f.window.location.assign=()=>opened=true;await f.h.settle();f.button('Continue checkout').props.onClick();f.setOwner('other-owner');await f.h.settle();resolve({item:pendingItem,order:pendingOrder,url:'https://checkout.stripe.com/c/pay/original'});await f.h.settle();assert.equal(opened,false);assert.equal(f.changed,0);});
test('renewal status refreshes on focus without a permanent refresh button',async t=>{const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();const reads=f.calls.length;f.window.dispatchEvent(new Event('focus'));await f.h.settle();assert.equal(f.calls.length,reads+1);assert.equal(f.button('Refresh renewals'),undefined);});

test('background focus reads retain existing cards while their response is pending',async t=>{const f=fixture();t.after(()=>f.h.cleanup());await f.h.settle();f.window.dispatchEvent(new Event('focus'));assert.ok(f.button('Enable automatic renewal'));assert.doesNotMatch(text(f.h.tree),/Loading automatic renewals/);await f.h.settle();});

for(const [name,item,action] of [['Enable automatic renewal',base,'enable'],['Disable automatic renewal',cancelItem,'disable'],[endName,disabledPayPal,'cancel'],['Cancel pending checkout',pendingItem,'cancel']]){
 test(name+' dismisses without writing and cannot submit a stale dismissed card',async t=>{const f=fixture({items:[item]});t.after(()=>f.h.cleanup());await f.h.settle();f.button(name).props.onClick();await f.h.settle();const dialog=f.actionDialog();assert.equal(dialog.props.action,action);assert.equal(dialog.props.title,item.title);assert.equal(f.writes().length,0);dialog.props.onCancel();await f.h.settle();dialog.props.onConfirm();await f.h.settle();assert.equal(f.writes().length,0);assert.equal(f.changed,0);assert.ok(f.button(name));});
 test(name+' cannot submit an unconfirmed card after the signed-in owner changes',async t=>{const f=fixture({items:[item]});t.after(()=>f.h.cleanup());await f.h.settle();f.button(name).props.onClick();await f.h.settle();const dialog=f.actionDialog();assert.equal(f.writes().length,0);f.setOwner('student-b');await f.h.settle();assert.equal(f.actionDialog(),undefined);dialog.props.onConfirm();await f.h.settle();assert.equal(f.writes().length,0);assert.equal(f.changed,0);});
}
test('a dismissed confirmation cannot confirm a later selection for a different purchase',async t=>{const other={...base,_id:'another-agreement',title:'Another owned course',product:'another-course'},f=fixture({items:[base,other]});t.after(()=>f.h.cleanup());await f.h.settle();const buttons=nodes(f.h.tree).filter(n=>n.type==='button'&&text(n).trim()==='Enable automatic renewal');buttons[0].props.onClick();await f.h.settle();const old=f.actionDialog();old.props.onCancel();await f.h.settle();buttons[1].props.onClick();await f.h.settle();assert.equal(f.actionDialog().props.title,other.title);old.props.onConfirm();await f.h.settle();assert.equal(f.writes().length,0);await f.confirmAction();assert.equal(f.writes()[0].path,'/payments/mine/agreements/another-agreement/resume');assert.equal(f.writes().length,1);});

test('renewal-only provider reply preserves the confirmed paid access clock while its refresh is pending',async t=>{
 const paidAccess={confirmed:true,status:'active',startsAt:'2026-01-01T00:00:00Z',endsAt:'2030-05-01T00:00:00Z',cancelledAt:null,noExpiry:false,durationDays:1582,remainingDays:1270,remainingPercent:80.28,serverNow:'2026-11-07T12:00:00Z'};
 const f=fixture({items:[{...base,paidAccess}],afterWriteRead:()=>new Promise(()=>{}),mutate:async()=>({item:{...base,currentPeriodEnd:'2031-05-01T00:00:00Z',autoRenew:true,cancelAtPeriodEnd:false,canEnableRenewal:false,canDisableRenewal:true}})});t.after(()=>f.h.cleanup());await f.h.settle();
 const indicator=()=>nodes(f.h.tree).find(node=>node.type==='paid-access-indicator');assert.deepEqual(JSON.parse(JSON.stringify(indicator().props.access)),paidAccess);
 f.button('Enable automatic renewal').props.onClick();await f.confirmAction();assert.equal(f.changed,1);assert.equal(f.writes().length,1);assert.ok(f.button('Disable automatic renewal'));
 assert.deepEqual(JSON.parse(JSON.stringify(indicator().props.access)),paidAccess);assert.notEqual(indicator().props.access.endsAt,'2031-05-01T00:00:00Z');assert.ok(nodes(f.h.tree).some(node=>node.props?.role==='status'&&text(node).includes('Stripe confirmed automatic renewal is on')));
});

const pendingFailureMessage='The provider could not start or confirm checkout.';
async function failPendingCancellation(f){f.button('Cancel pending checkout').props.onClick();await f.confirmAction();assert.match(text(f.h.tree),/The provider could not start or confirm checkout/);}
test('a pending checkout error survives successful refreshes while its original attempt remains pending',async t=>{
 const f=fixture({items:[pendingItem],mutate:async()=>{throw Error(pendingFailureMessage);}});t.after(()=>f.h.cleanup());await f.h.settle();await failPendingCancellation(f);
 for(const refresh of [()=>f.button('Refresh renewal status').props.onClick(),()=>f.window.dispatchEvent(new Event('focus'))]){refresh();await f.h.settle();assert.match(text(f.h.tree),/The provider could not start or confirm checkout/);assert.ok(f.button('Continue checkout'));}
});
test('verified replacement removing only the original pending row clears its stale error on the same billing view',async t=>{
 const other={...pendingItem,_id:'other-pending',checkoutOrderId:'c'.repeat(24),product:'another-product',title:'Another pending course'};let rows=[pendingItem,other];
 const f=fixture({items:rows,mutate:async()=>{throw Error(pendingFailureMessage);},afterWriteRead:()=>({items:rows,setupItems:[]})});t.after(()=>f.h.cleanup());await f.h.settle();await failPendingCancellation(f);
 rows=[other,{...base,_id:'verified-paid',status:'active',checkoutStatus:'paid',pendingCheckout:false}];f.window.dispatchEvent(new Event('focus'));await f.h.settle();
 assert.doesNotMatch(text(f.h.tree),/The provider could not start or confirm checkout/);assert.match(text(f.h.tree),/Another pending course/);assert.ok(f.button('Continue checkout'));assert.ok(f.button('Enable automatic renewal'));assert.equal(f.writes().length,1);
});
for(const checkoutStatus of ['paid','renewal_ready'])test('a verified non-pending '+checkoutStatus+' result clears only its obsolete pending-action error',async t=>{
 let rows=[pendingItem];const f=fixture({items:rows,mutate:async()=>{throw Error(pendingFailureMessage);},afterWriteRead:()=>({items:rows,setupItems:[]})});t.after(()=>f.h.cleanup());await f.h.settle();await failPendingCancellation(f);
 rows=[{...pendingItem,status:'active',pendingCheckout:false,checkoutStatus,canContinueCheckout:false,canCancelPendingCheckout:false,canDisableRenewal:true}];f.window.dispatchEvent(new Event('focus'));await f.h.settle();
 assert.doesNotMatch(text(f.h.tree),/The provider could not start or confirm checkout/);assert.ok(f.button('Disable automatic renewal'));
});
test('another pending row disappearing cannot clear the original pending action error',async t=>{
 const other={...pendingItem,_id:'another',product:'another-product',checkoutOrderId:'d'.repeat(24)};let rows=[pendingItem,other];
 const f=fixture({items:rows,mutate:async()=>{throw Error(pendingFailureMessage);},afterWriteRead:()=>({items:rows,setupItems:[]})});t.after(()=>f.h.cleanup());await f.h.settle();await failPendingCancellation(f);rows=[pendingItem];f.window.dispatchEvent(new Event('focus'));await f.h.settle();assert.match(text(f.h.tree),/The provider could not start or confirm checkout/);
});
test('an unverified non-pending DTO cannot silently clear a pending action error',async t=>{
 let rows=[pendingItem];const f=fixture({items:rows,mutate:async()=>{throw Error(pendingFailureMessage);},afterWriteRead:()=>({items:rows,setupItems:[]})});t.after(()=>f.h.cleanup());await f.h.settle();await failPendingCancellation(f);rows=[{...pendingItem,status:'active',pendingCheckout:false,checkoutStatus:null}];f.window.dispatchEvent(new Event('focus'));await f.h.settle();assert.match(text(f.h.tree),/The provider could not start or confirm checkout/);
});
for(const action of ['renewal','access'])test('successful pending-list refresh preserves an unrelated '+action+' error even with the same provider message',async t=>{
 const control={...cancelItem,_id:'paid-control',title:'Independent paid access',canEnableRenewal:false,canDisableRenewal:true};let rows=[pendingItem,control];
 const f=fixture({items:rows,mutate:async()=>{throw Error(pendingFailureMessage);},afterWriteRead:()=>({items:rows,setupItems:[]})});t.after(()=>f.h.cleanup());await f.h.settle();await failPendingCancellation(f);
 if(action==='renewal'){f.button('Disable automatic renewal').props.onClick();await f.confirmAction();}else{f.button('Cancel subscription now').props.onClick();await f.confirmCancellation();}
 rows=[control];f.window.dispatchEvent(new Event('focus'));await f.h.settle();assert.match(text(f.h.tree),/The provider could not start or confirm checkout/);assert.equal(f.writes().length,2);
});
test('a delayed previous-owner refresh cannot clear the new owner pending error',async t=>{
 let owner='first',defer=false,resolveOld;const late=new Promise(resolve=>resolveOld=resolve),second={...pendingItem,_id:'new-owner-pending',product:'new-owner-product',checkoutOrderId:'e'.repeat(24)};
 const f=fixture({items:[pendingItem],mutate:async()=>{throw Error(owner==='first'?pendingFailureMessage:'New owner checkout is still pending');},afterWriteRead:()=>{if(defer){defer=false;return late;}return {items:[owner==='first'?pendingItem:second],setupItems:[]};}});t.after(()=>f.h.cleanup());await f.h.settle();await failPendingCancellation(f);
 defer=true;f.window.dispatchEvent(new Event('focus'));await f.h.settle();owner='second';f.setOwner('second-owner');await f.h.settle();f.button('Cancel pending checkout').props.onClick();await f.confirmAction();assert.match(text(f.h.tree),/New owner checkout is still pending/);
 resolveOld({items:[],setupItems:[]});await f.h.settle();assert.match(text(f.h.tree),/New owner checkout is still pending/);assert.ok(f.button('Continue checkout'));assert.equal(f.writes().length,2);
});
test('a malformed billing refresh does not dismiss a still-unresolved pending error',async t=>{
 let malformed=false;const f=fixture({items:[pendingItem],mutate:async()=>{throw Error(pendingFailureMessage);},afterWriteRead:()=>({items:malformed?{}:[pendingItem],setupItems:[]})});t.after(()=>f.h.cleanup());await f.h.settle();await failPendingCancellation(f);malformed=true;f.window.dispatchEvent(new Event('focus'));await f.h.settle();assert.match(text(f.h.tree),/The provider could not start or confirm checkout/);assert.ok(f.button('Continue checkout'));
});
