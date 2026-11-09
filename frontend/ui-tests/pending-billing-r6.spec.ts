import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {syntheticProviderDocument,syntheticProviderIdentity,matchingFixtureOrder,SYNTHETIC_PROVIDER_HEADING} from './helpers/fixtures.mjs';
const id='a'.repeat(24),orderId='b'.repeat(24),origin='http://127.0.0.1:3108';
const pending=(provider='stripe')=>({_id:id,checkoutOrderId:orderId,checkoutStatus:'pending',kind:'section',product:'owned-section',title:'Owned pending section',provider,status:'creating',autoRenew:true,intervalMonths:1,amountMinor:2500,currency:'USD',pendingCheckout:true,canContinueCheckout:true,canCancelPendingCheckout:true});
const order=(provider='stripe')=>({_id:orderId,provider,kind:'section',product:'owned-section',status:'pending'});
async function login(context:any){const result=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-CSRF':'1','X-SA-Portal':'student'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});expect(result.ok()).toBe(true);}
for(const provider of ['stripe','paypal'])test(provider+' pending checkout has Continue instead of invented subscription controls and opens the original hosted checkout',async({context,page})=>{
 await login(context);const item=pending(provider),url=provider==='stripe'?'https://checkout.stripe.com/c/pay/same-checkout':'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=same-checkout';let writes=0;
 await context.route('**/api/payments/mine/agreements',route=>route.fulfill({json:{items:[item],setupItems:[]}}));
 await context.route('**/api/payments/mine/agreements/'+id+'/continue',route=>{writes++;return route.fulfill({json:{success:true,item,order:order(provider),url}});});
 await context.route(url,route=>route.fulfill({contentType:'text/html',body:'<h1>The original hosted checkout</h1>'}));
 await page.goto('/billing');const card=page.locator('.billingAutoRenewals article');await expect(card).toContainText('Pending checkout');await expect(card.getByRole('button',{name:'Continue checkout',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Refresh renewals',exact:true})).toHaveCount(0);await expect(card.getByRole('button',{name:'Cancel subscription now',exact:true})).toHaveCount(0);
 await card.getByRole('button',{name:'Continue checkout',exact:true}).click();await expect(page).toHaveURL(url);await expect(page.getByRole('heading',{name:'The original hosted checkout',exact:true})).toBeVisible();expect(writes).toBe(1);
});
test('pending cancellation remains visible on uncertainty and disappears after confirmed closure, including reload',async({context,page})=>{
 await login(context);let cancelled=false,writes=0;const item=pending();
 const ended=()=>({...item,status:'cancelled',autoRenew:false,pendingCheckout:false,canContinueCheckout:false,canCancelPendingCheckout:false});
 await context.route('**/api/payments/mine/agreements',route=>route.fulfill({json:{items:[cancelled?ended():item],setupItems:[]}}));
 await context.route('**/api/payments/mine/agreements/'+id+'/cancel-pending',route=>{writes++;expect(route.request().postDataJSON()).toEqual({confirmPendingCancellation:true});if(writes===1)return route.fulfill({status:503,json:{success:false,message:'Provider closure is still pending.'}});cancelled=true;return route.fulfill({json:{success:true,checkoutCancelled:true,item:ended(),order:{...order(),status:'expired'}}});});
 await page.goto('/billing');const area=page.locator('.billingAutoRenewals');await area.getByRole('button',{name:'Cancel pending checkout',exact:true}).click();const confirmation=page.getByRole('dialog',{name:'Are you sure you want to cancel this pending checkout?',exact:true});await expect(confirmation).toContainText(item.title);await expect(confirmation).toContainText('No already-paid access will be cancelled');expect(writes).toBe(0);await confirmation.getByRole('button',{name:'Confirm',exact:true}).click();await expect(area.getByRole('alert')).toContainText('Provider closure is still pending.');await expect(area.getByRole('heading',{name:item.title,exact:true})).toBeVisible();
 await area.getByRole('button',{name:'Cancel pending checkout',exact:true}).click();await expect(confirmation).toBeVisible();expect(writes).toBe(1);await confirmation.getByRole('button',{name:'Confirm',exact:true}).click();await expect(area.getByRole('status')).toContainText('Pending checkout cancelled.');await expect(area.getByRole('heading',{name:item.title,exact:true})).toHaveCount(0);await page.reload();await expect(area.getByRole('heading',{name:item.title,exact:true})).toHaveCount(0);expect(writes).toBe(2);
});

async function pendingControl(request:APIRequestContext,path:string,body?:object){
 const options={headers:{'x-sa-ui-fixture':'local-synthetic-tests-only'}};
 const response=body?await request.post('http://127.0.0.1:5109/__fixture/'+path,{...options,data:body}):await request.get('http://127.0.0.1:5109/__fixture/'+path,options);
 expect(response.ok()).toBe(true);return response.json();
}
async function purchaseFromAcademy(page:Page,kind:'course'|'section'){
 await page.goto('/academy');
 const title=kind==='course'?'Paid Learning Test':'Published Learning Section';
 const card=page.locator('article.courseVisualCard').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await card.getByRole('link',{name:kind==='course'?'View Course →':'Explore Section →',exact:true}).click();
 if(kind==='course')await page.getByRole('button',{name:'Open / Purchase Course →',exact:true}).click();
 else await page.getByRole('link',{name:'Buy entire section →',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/checkout\\?'+kind+'='+(kind==='course'?'paid-demo':'academy-section')+'(?:&|$)'));
 await expect(page.locator('.orderSummary')).toContainText(title);
 await expect(page.locator('.planChoice > button').first()).toBeEnabled();
 await expect(page.getByRole('button',{name:'Check existing checkout',exact:true})).toHaveCount(0);
 await expect(page.getByRole('alert').filter({hasText:/existing checkout was found/i})).toHaveCount(0);
}
async function chooseOneTime(page:Page,provider:string){
 const renewal=page.getByRole('checkbox',{name:/Automatically renew my access/});
 await expect(renewal).toBeEnabled();
 if(await renewal.isChecked())await renewal.uncheck();
 await expect(renewal).not.toBeChecked();await page.locator('.checkoutConsent input').check();
 await expect(page.locator('button.paymentMethod.'+provider)).toBeEnabled();
}
async function observedProviderOrder(page:Page,request:APIRequestContext){
 await expect(page.getByRole('heading',{name:SYNTHETIC_PROVIDER_HEADING,exact:true})).toBeVisible();
 const identity=syntheticProviderIdentity(page.url());expect(identity).not.toBeNull();
 await expect.poll(async()=>Boolean(matchingFixtureOrder((await pendingControl(request,'state')).orders,identity))).toBe(true);
 return matchingFixtureOrder<any>((await pendingControl(request,'state')).orders,identity)!;
}
const repurchaseCases=[
 {provider:'stripe',kind:'course',width:390},
 {provider:'paypal',kind:'course',width:1440},
 {provider:'stripe',kind:'section',width:1440},
 {provider:'paypal',kind:'section',width:390}
] as const;
for(const {provider,kind,width}of repurchaseCases)test(`${provider} ${kind} at ${width}px: Academy repurchase clears only obsolete pending billing after verified payment`,async({page,context,request})=>{
 await pendingControl(request,'reset',{});await page.setViewportSize({width,height:960});await login(context);
 await context.route('**/*',async route=>{
  if(new URL(route.request().url()).origin===origin)return route.continue();
  const document=route.request().resourceType()==='document'?syntheticProviderDocument(route.request().url()):null;
  return document?route.fulfill(document):route.abort();
 });
 await purchaseFromAcademy(page,kind);await page.locator('.checkoutConsent input').check();
 await page.locator('button.paymentMethod.'+provider).click();const original=await observedProviderOrder(page,request);
 expect(original.autoRenew).toBe(true);expect(original.status).toBe('pending');
 const previous={...pending(provider),_id:original.billingAgreement,checkoutOrderId:original._id,kind,product:original.product,title:'Previous pending '+kind};
 const unrelated={...pending(),_id:'d'.repeat(24),checkoutOrderId:'c'.repeat(24),kind:'course',product:'different-course',title:'Another pending course'};
 const paidControl={_id:'e'.repeat(24),kind:'section',product:'existing-paid-section',title:'Existing paid section',provider:'stripe',status:'active',autoRenew:true,intervalMonths:12,amountMinor:9900,currency:'USD',currentPeriodEnd:'2099-01-01T00:00:00Z',canDisableRenewal:true,renewalActionPending:false};
 let verifiedReplacement=false,previousClosed=false;
 // This route supplies the billing DTO contract. Backend integration tests prove
 // its financial evidence and closure checks; this browser test proves refresh
 // behavior and preservation of unrelated cards against actual checkout UI.
 await context.route('**/api/payments/mine/agreements',route=>route.fulfill({json:{success:true,items:[...(verifiedReplacement?[]:[{...previous,...(previousClosed?{checkoutStatus:provider==='stripe'?'expired':'cancelled',autoRenew:false,canContinueCheckout:false}:{})}]),unrelated,paidControl],setupItems:[]}}));
 await page.goBack();await expect(page.locator('.planChoice > button').first()).toBeEnabled();
 await expect(page.getByRole('button',{name:'Check existing checkout',exact:true})).toHaveCount(0);
 await page.goto('/billing');const area=page.locator('.billingAutoRenewals');
 await expect(area.getByRole('heading',{name:previous.title,exact:true})).toBeVisible();
 await expect(area.getByRole('heading',{name:unrelated.title,exact:true})).toBeVisible();
 await expect(area.getByRole('heading',{name:paidControl.title,exact:true})).toBeVisible();
 expect((await pendingControl(request,'state')).payments).toHaveLength(0);

 // The same payment method now starts a fresh checkout only after verified
 // closure of the old one; choosing the card alone performs no payment write.
 await purchaseFromAcademy(page,kind);await chooseOneTime(page,provider);
 const before=await pendingControl(request,'state');expect(before.orders).toHaveLength(1);expect(before.calls.filter((call:any)=>call.path==='/api/payments/checkout/release')).toHaveLength(0);
 await page.locator('button.paymentMethod.'+provider).click();const cancelledReplacement=await observedProviderOrder(page,request);
 expect(cancelledReplacement._id).not.toBe(original._id);expect(cancelledReplacement.key).not.toBe(original.key);
 let state=await pendingControl(request,'state');expect(state.orders).toHaveLength(2);expect(state.orders[0].status).toBe(provider==='stripe'?'expired':'cancelled');expect(state.payments).toHaveLength(0);previousClosed=true;
 const firstRelease=state.calls.findIndex((call:any)=>call.path==='/api/payments/checkout/release');
 const secondCreate=state.calls.findIndex((call:any,index:number)=>index>firstRelease&&call.path==='/api/payments/checkout'&&call.method==='POST');
 expect(firstRelease).toBeGreaterThanOrEqual(0);expect(secondCreate).toBeGreaterThan(firstRelease);expect(state.calls[firstRelease].key).toBe(original.key);
 await page.getByRole('link',{name:'Cancel fixture payment',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Check your existing checkout.',exact:true})).toBeVisible();
 await page.goto('/billing');await expect(area.getByRole('heading',{name:previous.title,exact:true})).toBeVisible();
 const previousCard=area.locator('article').filter({has:page.getByRole('heading',{name:previous.title,exact:true})});await expect(previousCard).toContainText('Pending checkout');await expect(previousCard.getByRole('button',{name:'Continue checkout',exact:true})).toHaveCount(0);
 await page.reload();await expect(area.getByRole('heading',{name:previous.title,exact:true})).toBeVisible();
 expect((await pendingControl(request,'state')).payments).toHaveLength(0);

 await purchaseFromAcademy(page,kind);await chooseOneTime(page,provider);await page.locator('button.paymentMethod.'+provider).click();
 const completed=await observedProviderOrder(page,request);expect(completed._id).not.toBe(cancelledReplacement._id);
 await pendingControl(request,'approve',{id:completed._id});await page.getByRole('link',{name:'Approve fixture payment',exact:true}).click();
 await expect(page.getByRole('heading',{name:'You’re ready to learn.',exact:true})).toBeVisible();
 state=await pendingControl(request,'state');expect(state.orders).toHaveLength(3);expect(state.orders.filter((item:any)=>item.status==='paid')).toHaveLength(1);
 expect(state.payments).toHaveLength(1);expect(state.invoices).toHaveLength(1);expect(state.orders.find((item:any)=>item._id===completed._id).status).toBe('paid');
 const financialHistory={orders:state.orders,invoices:state.invoices,payments:state.payments,notices:state.notices,sectionTerms:state.sectionTerms};verifiedReplacement=true;
 await page.goto('/billing');await expect(area.getByRole('heading',{name:previous.title,exact:true})).toHaveCount(0);
 await expect(area.getByRole('heading',{name:unrelated.title,exact:true})).toBeVisible();await expect(area.getByRole('heading',{name:paidControl.title,exact:true})).toBeVisible();
 await expect(area.getByRole('button',{name:'Disable automatic renewal',exact:true})).toBeVisible();
 await page.reload();await expect(area.getByRole('heading',{name:previous.title,exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Invoices & dues',exact:true}).click();await expect(page.getByRole('heading',{name:'SA-FIXTURE-'+completed._id,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Payment receipts',exact:true}).click();await expect(page.locator('.billingReceiptCard')).toHaveCount(1);
 await page.goto('/academy');const owned=page.locator('article.courseVisualCard').filter({has:page.getByRole('heading',{name:kind==='course'?'Paid Learning Test':'Published Learning Section',exact:true})});
 await expect(owned).toContainText('Included in your active access');
 state=await pendingControl(request,'state');for(const field of ['orders','invoices','payments','notices','sectionTerms']as const)expect(state[field]).toEqual(financialHistory[field]);
});

test('pending provider error survives refresh until its owned pending card is superseded in the same billing document',async({page,context,request})=>{
 await pendingControl(request,'reset',{});await login(context);await pendingControl(request,'legacy-membership',{});
 const originalState=await pendingControl(request,'state'),history={orders:originalState.orders,invoices:originalState.invoices,payments:originalState.payments,terms:originalState.terms,sectionTerms:originalState.sectionTerms,notices:originalState.notices};
 const previous={...pending(),title:'Previous pending section'};
 const unrelated={...pending('paypal'),_id:'d'.repeat(24),checkoutOrderId:'c'.repeat(24),kind:'course',product:'different-course',title:'Another pending course'};
 const paidControl={_id:'e'.repeat(24),kind:'section',product:'existing-paid-section',title:'Existing paid section',provider:'stripe',status:'active',autoRenew:true,intervalMonths:12,amountMinor:9900,currency:'USD',currentPeriodEnd:'2099-01-01T00:00:00Z',canDisableRenewal:true,renewalActionPending:false};
 let superseded=false,reads=0,cancellations=0;
 const message='The original provider checkout could not be found (resource_missing).';
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 // The owned-list response changes only after a verified replacement. Keeping
 // another pending card ensures the stale error is bound to its original ID.
 await context.route('**/api/payments/mine/agreements',route=>{reads++;return route.fulfill({json:{success:true,items:[...(superseded?[]:[previous]),unrelated,paidControl],setupItems:[]}});});
 await context.route('**/api/payments/mine/agreements/'+id+'/cancel-pending',route=>{cancellations++;expect(route.request().postDataJSON()).toEqual({confirmPendingCancellation:true});return route.fulfill({status:404,json:{success:false,message,code:'PAYMENT_PROVIDER_INVALID_REQUEST',requestId:'owned-pending-resource-missing'}});});
 await page.goto('/billing');const documentTime=await page.evaluate(()=>performance.timeOrigin),area=page.locator('.billingAutoRenewals');
 const previousCard=area.locator('article').filter({has:page.getByRole('heading',{name:previous.title,exact:true})});
 await previousCard.getByRole('button',{name:'Cancel pending checkout',exact:true}).click();
 await page.getByRole('dialog',{name:'Are you sure you want to cancel this pending checkout?',exact:true}).getByRole('button',{name:'Confirm',exact:true}).click();
 const alert=area.getByRole('alert').filter({hasText:message});await expect(alert).toBeVisible();await expect.poll(()=>reads).toBeGreaterThanOrEqual(2);
 await expect(area.getByRole('heading',{name:previous.title,exact:true})).toBeVisible();
 let observedReads=reads;await alert.getByRole('button',{name:'Refresh renewal status',exact:true}).click();await expect.poll(()=>reads).toBeGreaterThan(observedReads);await expect(alert).toBeVisible();
 observedReads=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(observedReads);await expect(alert).toBeVisible();
 superseded=true;observedReads=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(observedReads);
 await expect(area.getByRole('heading',{name:previous.title,exact:true})).toHaveCount(0);await expect(alert).toHaveCount(0);await expect(area.getByRole('alert')).toHaveCount(0);
 await expect(area.getByRole('heading',{name:unrelated.title,exact:true})).toBeVisible();await expect(area.getByRole('heading',{name:paidControl.title,exact:true})).toBeVisible();
 await expect(area.getByRole('button',{name:'Disable automatic renewal',exact:true})).toBeVisible();expect(cancellations).toBe(1);expect(await page.evaluate(()=>performance.timeOrigin)).toBe(documentTime);
 await page.getByRole('button',{name:'Invoices & dues',exact:true}).click();await expect(page.locator('.billingInvoiceCard')).toHaveCount(1);
 await page.getByRole('button',{name:'Payment receipts',exact:true}).click();await expect(page.locator('.billingReceiptCard')).toHaveCount(1);
 const after=await pendingControl(request,'state');for(const field of ['orders','invoices','payments','terms','sectionTerms','notices']as const)expect(after[field]).toEqual(history[field]);
});
