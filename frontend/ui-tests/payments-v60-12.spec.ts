/** Actual Next/browser + local synthetic commerce fixture. Provider URLs are
 * intercepted with static fake pages. These are NOT Stripe/PayPal sandbox calls
 * and cannot prove provider signatures, database transactions or inbox delivery. */
import {test,expect,type BrowserContext,type APIRequestContext,type Page} from '@playwright/test';
import {syntheticProviderDocument,syntheticProviderIdentity,matchingFixtureOrder,SYNTHETIC_PROVIDER_HEADING} from './helpers/fixtures.mjs';
const origin='http://127.0.0.1:3108',api='http://127.0.0.1:5109';
async function control(request:APIRequestContext,path:string,body?:object){
 const response=body?await request.post(api+'/__fixture/'+path,{headers:{'x-sa-ui-fixture':'local-synthetic-tests-only'},data:body}):await request.get(api+'/__fixture/'+path,{headers:{'x-sa-ui-fixture':'local-synthetic-tests-only'}});
 expect(response.ok()).toBe(true);return response.json();
}
async function signIn(context:BrowserContext,email='learner@example.invalid'){
 const response=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email,password:'TestPassword123!'}});expect(response.ok()).toBe(true);
}
/** Legacy financial cases deliberately buy one paid term without renewal. */
async function oneTimePurchase(page:Page){
 const renewal=page.getByRole('checkbox',{name:/Automatically renew my access/});
 await expect(renewal).toBeVisible();
 // A restored pending attempt may briefly paint the default before its saved
 // renewal choice is loaded. Never try to change a locked checkout identity.
 await expect.poll(async()=>!(await renewal.isChecked())||await renewal.isEnabled()).toBe(true);
 if(await renewal.isChecked())await renewal.uncheck();
 await expect(renewal).not.toBeChecked();
 const consent=page.locator('.checkoutConsent input[type="checkbox"]');
 await consent.check();await expect(consent).toBeChecked();
 await expect(page.locator('.checkoutConsent')).toContainText('one-time purchase with no automatic recurring charge');
 // Both legacy providers are supported only after the one-time quote arrives.
 await expect(page.locator('button.paymentMethod.paypal')).toBeEnabled();
}
function errors(page:Page){const list:string[]=[];page.on('pageerror',error=>list.push(error.message));page.on('console',m=>{if(m.type()==='error'&&/hydration|server rendered HTML|didn't match/i.test(m.text()))list.push(m.text());});return list;}
async function orders(request:APIRequestContext){return (await control(request,'state')).orders;}
async function approve(page:Page,request:APIRequestContext){
 // A click finishes before its asynchronous order-creation request. Synchronize
 // with the observed provider document, then select THAT order, not list.at(-1).
 await expect(page.getByRole('heading',{name:SYNTHETIC_PROVIDER_HEADING,exact:true})).toBeVisible();
 const identity=syntheticProviderIdentity(page.url());expect(identity).not.toBeNull();
 await expect.poll(async()=>!!matchingFixtureOrder(await orders(request),identity)).toBe(true);
 const order=matchingFixtureOrder<any>(await orders(request),identity);expect(order).toBeTruthy();
 expect(order.status).toBe('pending');
 await control(request,'approve',{id:order._id});await page.getByRole('link',{name:'Approve fixture payment',exact:true}).click();
 return order;
}
test.beforeEach(async({request,context})=>{
 await control(request,'reset',{});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===origin)return route.continue();
  const document=route.request().resourceType()==='document'?syntheticProviderDocument(u.href):null;
  if(document)return route.fulfill(document);
  return route.abort(); // No external scripts, analytics or actual provider calls.
 });
});
for(const width of [390,1440])for(const provider of ['stripe','paypal'])for(const kind of ['course','section'])test(`${provider} ${kind} at ${width}px: one checkout, verified fixture return, owned invoice`,async({page,context,request})=>{
 const observed=errors(page);await page.setViewportSize({width,height:960});await signIn(context);
 await page.goto(kind==='course'?'/checkout?course=paid-demo':'/checkout?section=academy-section');await oneTimePurchase(page);
 const button=page.locator('button.paymentMethod.'+provider);await expect(button).toBeEnabled();
 await button.evaluate(el=>{(el as HTMLButtonElement).click();(el as HTMLButtonElement).click();});
 await expect(page.getByRole('heading',{name:'Synthetic payment provider — no real money'})).toBeVisible();
 const before=await control(request,'state');expect(before.orders).toHaveLength(1);expect(before.invoices).toHaveLength(0);expect(before.calls.filter((c:any)=>c.path==='/api/payments/checkout'&&c.method==='POST')).toHaveLength(1);
 const order=await approve(page,request);await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible();
 const after=await control(request,'state');expect(after.orders[0].status).toBe('paid');expect(after.invoices).toHaveLength(1);expect(after.payments).toHaveLength(1);expect(after.notices).toHaveLength(1);expect(after.sectionTerms).toHaveLength(kind==='section'?1:0);
 expect(after.terms).toHaveLength(0);if(kind==='section')expect(after.sectionTerms[0]).toMatchObject({user:'111111111111111111111111',sectionSlug:'academy-section'});
 expect(after.invoices[0].totalMinor).toBe(kind==='course'?14900:29900);expect(after.invoices[0].user).toBe('111111111111111111111111');
 expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('sa-checkout-active:')))).toHaveLength(0);
 await page.goto('/billing?section=invoices');await expect(page.getByRole('heading',{name:'SA-FIXTURE-'+order._id,exact:true})).toBeVisible();expect(observed).toEqual([]);
});
test('lost creation response recovers with the original key and no second purchase POST',async({page,context,request})=>{
 await control(request,'config',{createMode:'lost'});await signIn(context);await page.goto('/checkout?course=paid-demo');await oneTimePurchase(page);await page.locator('button.paymentMethod.stripe').click();
 await expect(page.getByRole('heading',{name:'Synthetic payment provider — no real money'})).toBeVisible();
 const state=await control(request,'state'),posts=state.calls.filter((c:any)=>c.path==='/api/payments/checkout'&&c.method==='POST'),reads=state.calls.filter((c:any)=>c.path==='/api/payments/checkout-status');
 expect(posts).toHaveLength(1);expect(reads.length).toBeGreaterThan(0);expect(reads.every((x:any)=>x.key===posts[0].key)).toBe(true);expect(state.orders).toHaveLength(1);expect(state.payments).toHaveLength(0);
});
test('unknown checkout survives refresh and server refuses a new payment until the old checkout is identified',async({page,context,request})=>{
 await control(request,'config',{createMode:'creating'});await signIn(context);await page.goto('/checkout?course=paid-demo');await oneTimePurchase(page);await page.locator('button.paymentMethod.stripe').click();
 await expect(page.getByRole('button',{name:'Check existing checkout',exact:true})).toBeVisible();await expect(page.locator('button.paymentMethod.paypal')).toBeEnabled();
 await page.reload();await oneTimePurchase(page);await expect(page.getByRole('button',{name:'Check existing checkout',exact:true})).toBeVisible();await expect(page.locator('button.paymentMethod.paypal')).toBeEnabled();
 await page.locator('button.paymentMethod.paypal').click();
 await expect(page.locator('button.paymentMethod.paypal')).toBeEnabled();
 await page.getByRole('button',{name:'Check existing checkout',exact:true}).click();await expect(page.getByRole('button',{name:'Start a new checkout',exact:true})).toHaveCount(0);
 const state=await control(request,'state');expect(state.orders).toHaveLength(1);expect(state.payments).toHaveLength(0);expect(state.calls.filter((c:any)=>c.path==='/api/payments/checkout'&&c.method==='POST')).toHaveLength(1);
});
test('only a server-confirmed closed checkout plus an explicit click permits a new key',async({page,context,request})=>{
 await control(request,'config',{createMode:'expired'});await signIn(context);await page.goto('/checkout?course=paid-demo');await oneTimePurchase(page);await page.locator('button.paymentMethod.stripe').click();
 const fresh=page.getByRole('button',{name:'Start a new checkout',exact:true});await expect(fresh).toBeVisible();const previous=(await orders(request))[0];
 await control(request,'config',{createMode:'normal'});page.once('dialog',dialog=>dialog.accept());await fresh.click();await page.locator('button.paymentMethod.paypal').click();
 await expect(page.getByRole('heading',{name:'Synthetic payment provider — no real money'})).toBeVisible();const current=await orders(request);expect(current).toHaveLength(2);expect(current[1].key).not.toBe(previous.key);
});
test('provider cancellation is a read-only status check, not a capture or automatic retry',async({page,context,request})=>{
 await signIn(context);await page.goto('/checkout?course=paid-demo');await oneTimePurchase(page);await page.locator('button.paymentMethod.paypal').click();await page.getByRole('link',{name:'Cancel fixture payment',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Check your existing checkout.',exact:true})).toBeVisible();await page.getByRole('button',{name:'Check payment status',exact:true}).click();
 const state=await control(request,'state');expect(state.calls.some((c:any)=>c.path.endsWith('/confirm'))).toBe(false);expect(state.payments).toHaveLength(0);expect(state.orders).toHaveLength(1);
});
test('slow pending confirmation updates the same document without another checkout',async({page,context,request})=>{
 await control(request,'config',{confirmAfter:2});await signIn(context);await page.goto('/checkout?section=academy-section');await oneTimePurchase(page);await page.locator('button.paymentMethod.paypal').click();await approve(page,request);
 await expect(page.getByRole('button',{name:'Check payment status',exact:true})).toBeVisible();const stamp=await page.evaluate(()=>performance.timeOrigin);
 await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible({timeout:12000});expect(await page.evaluate(()=>performance.timeOrigin)).toBe(stamp);
 const state=await control(request,'state');expect(state.orders).toHaveLength(1);expect(state.payments).toHaveLength(1);expect(state.sectionTerms).toHaveLength(1);
});
test('temporary provider confirmation outage offers retry of status, not another purchase',async({page,context,request})=>{
 await control(request,'config',{confirmFailures:1});await signIn(context);await page.goto('/checkout?course=paid-demo');await oneTimePurchase(page);await page.locator('button.paymentMethod.stripe').click();await approve(page,request);
 const outage=page.locator('.checkoutReturnCard').getByRole('alert').filter({hasText:'Controlled provider status outage'});
 await expect(outage).toHaveCount(1);await expect(outage).toContainText('Controlled provider status outage');await page.getByRole('button',{name:'Retry status check',exact:true}).click();await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible();
 const state=await control(request,'state');expect(state.orders).toHaveLength(1);expect(state.payments).toHaveLength(1);expect(state.calls.filter((c:any)=>c.path==='/api/payments/checkout'&&c.method==='POST')).toHaveLength(1);
});
test('one student cannot read or confirm another students checkout or invoice',async({page,context,request,browser})=>{
 await signIn(context);await page.goto('/checkout?course=paid-demo');await oneTimePurchase(page);await page.locator('button.paymentMethod.stripe').click();const order=await approve(page,request);await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible();
 const second=await browser.newContext();try{
  await signIn(second,'other@example.invalid');
  for(const suffix of ['', '/confirm']){const response=await second.request.fetch(origin+'/api/payments/orders/'+order._id+suffix,{method:suffix?'POST':'GET',headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'}});expect(response.status()).toBe(404);}
  const invoices=await second.request.get(origin+'/api/payments/mine/invoices',{headers:{'X-SA-Portal':'student'}});expect((await invoices.json()).items).toHaveLength(0);
 }finally{await second.close();}
});
test('provider Back preserves the original checkout and does not automatically create another order',async({page,context,request})=>{
 await signIn(context);await page.goto('/checkout?course=paid-demo');await oneTimePurchase(page);await page.locator('button.paymentMethod.stripe').click();await expect(page.getByRole('heading',{name:'Synthetic payment provider — no real money'})).toBeVisible();
 const original=(await orders(request))[0];await page.goBack();await expect(page).toHaveURL(origin+'/checkout?course=paid-demo');
 await expect(page.getByRole('button',{name:'Check existing checkout',exact:true})).toBeEnabled();await expect(page.locator('button.paymentMethod.paypal')).toBeEnabled();
 await page.getByRole('button',{name:'Check existing checkout',exact:true}).click();await expect(page.getByRole('heading',{name:'Synthetic payment provider — no real money'})).toBeVisible();
 const state=await control(request,'state');expect(state.orders).toHaveLength(1);expect(state.orders[0].key).toBe(original.key);expect(state.calls.filter((c:any)=>c.path==='/api/payments/checkout'&&c.method==='POST')).toHaveLength(1);
});
test('paid return refresh reuses the settled order and cannot duplicate invoice, payment or notification',async({page,context,request})=>{
 await signIn(context);await page.goto('/checkout?section=academy-section');await oneTimePurchase(page);await page.locator('button.paymentMethod.paypal').click();await approve(page,request);await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible();
 const state=await control(request,'state');for(const field of ['orders','invoices','payments','sectionTerms','notices'])expect(state[field]).toHaveLength(1);
});

// Fixture self-checks: keep Unicode text exact and reject accidental network calls.
for(const provider of ['stripe','paypal'])test(`synthetic ${provider} document preserves UTF-8 heading and both return links`,async({page,context,request})=>{
 await signIn(context);
 const quoted=await context.request.post(origin+'/api/payments/quote',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{kind:'course',product:'paid-demo',optionKey:'annual',autoRenew:false,couponCode:''}});expect(quoted.ok()).toBe(true);const {quote}=await quoted.json();
 const created=await context.request.post(origin+'/api/payments/checkout',{
  headers:{'X-SA-Portal':'student','X-SA-CSRF':'1','Idempotency-Key':'fixture-charset-'+provider+'-123456789'},
  data:{kind:'course',product:'paid-demo',optionKey:'annual',provider,autoRenew:false,termsAccepted:true,quoteFingerprint:quote.fingerprint}
 });
 expect(created.ok()).toBe(true);const checkout=await created.json();
 const response=await page.goto(checkout.url);expect(response).not.toBeNull();
 expect(response!.headers()['content-type']).toContain('charset=utf-8');
 await expect(page.getByRole('heading',{name:SYNTHETIC_PROVIDER_HEADING,exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.characterSet.toUpperCase())).toBe('UTF-8');
 await expect(page.getByRole('link',{name:'Approve fixture payment',exact:true})).toHaveAttribute('href',origin+'/checkout/return?order='+checkout.order._id);
 await expect(page.getByRole('link',{name:'Cancel fixture payment',exact:true})).toHaveAttribute('href',origin+'/checkout/return?order='+checkout.order._id+'&cancelled=1');
 const state=await control(request,'state');expect(state.payments).toHaveLength(0);
});
test('delayed creation is observed before approval and still settles exactly one order',async({page,context,request})=>{
 await control(request,'config',{createDelayMs:400});await signIn(context);
 await page.goto('/checkout?course=paid-demo');await oneTimePurchase(page);await page.locator('button.paymentMethod.stripe').click();
 const order=await approve(page,request);
 await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible();
 const state=await control(request,'state');expect(state.orders).toHaveLength(1);
 expect(state.invoices).toHaveLength(1);expect(state.payments).toHaveLength(1);
 expect(state.payments[0]._id).toBe(order._id);
 expect(state.calls.filter((c:any)=>c.path==='/api/payments/checkout'&&c.method==='POST')).toHaveLength(1);
});

// V60.14 provider reselection: the explicit second click first releases the
// original owned checkout. Back/Cancel alone never performs a capture or release.
for(const width of [390,1440])for(const oldProvider of ['stripe','paypal'])for(const kind of ['course','section'])
test(`${oldProvider} ${kind} at ${width}px: Back/Cancel permits verified switch and only replacement can settle`,async({page,context,request})=>{
 await page.setViewportSize({width,height:960});await signIn(context);
 const target=kind==='course'?'/checkout?course=paid-demo':'/checkout?section=academy-section',newProvider=oldProvider==='stripe'?'paypal':'stripe';
 await page.goto(target);await oneTimePurchase(page);await page.locator('button.paymentMethod.'+oldProvider).click();
 await expect(page.getByRole('heading',{name:SYNTHETIC_PROVIDER_HEADING,exact:true})).toBeVisible();
 const original=(await orders(request))[0];
 if(width===390){
  await page.getByRole('link',{name:'Cancel fixture payment',exact:true}).click();
  await expect(page.getByRole('link',{name:'Choose payment method',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Choose payment method',exact:true}).click();
 }else await page.goBack();
 await expect(page).toHaveURL(origin+target);
 const before=await control(request,'state');expect(before.payments).toHaveLength(0);
 expect(before.calls.filter((c:any)=>c.path==='/api/payments/checkout/release')).toHaveLength(0);
 await oneTimePurchase(page);
 const choose=page.locator('button.paymentMethod.'+newProvider);await expect(choose).toBeEnabled();await choose.click();
 await expect(page.getByRole('heading',{name:SYNTHETIC_PROVIDER_HEADING,exact:true})).toBeVisible();
 const switched=await control(request,'state');expect(switched.orders).toHaveLength(2);
 expect(switched.orders[0].status).toBe(oldProvider==='stripe'?'expired':'cancelled');expect(switched.orders[1].provider).toBe(newProvider);
 const release=switched.calls.filter((c:any)=>c.path==='/api/payments/checkout/release');expect(release).toHaveLength(1);expect(release[0].key).toBe(original.key);
 // Simulate returning from a stale provider tab after replacement was selected.
 await control(request,'approve',{id:original._id});
 const late=await context.request.post(origin+'/api/payments/orders/'+original._id+'/confirm',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'}});
 expect(late.ok()).toBe(true);expect((await late.json()).order.status).toBe(oldProvider==='stripe'?'expired':'cancelled');
 expect((await control(request,'state')).payments).toHaveLength(0);
 await approve(page,request);await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible();
 const finished=await control(request,'state');for(const key of ['payments','invoices','notices'])expect(finished[key]).toHaveLength(1);
 expect(finished.payments[0].provider).toBe(newProvider);
});
test('payment method can switch back a second time without duplicate settlement',async({page,context,request})=>{
 await signIn(context);await page.goto('/checkout?section=academy-section');await oneTimePurchase(page);
 for(const provider of ['stripe','paypal','stripe']){
  await oneTimePurchase(page);await page.locator('button.paymentMethod.'+provider).click();await expect(page.getByRole('heading',{name:SYNTHETIC_PROVIDER_HEADING,exact:true})).toBeVisible();
  if((await orders(request)).length<3)await page.goBack();
 }
 await approve(page,request);await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible();
 const state=await control(request,'state');expect(state.orders).toHaveLength(3);expect(state.payments).toHaveLength(1);expect(state.sectionTerms).toHaveLength(1);
});
test('another student cannot release an owned checkout or obtain its replacement key',async({page,context,request,browser})=>{
 await signIn(context);await page.goto('/checkout?course=paid-demo');await oneTimePurchase(page);await page.locator('button.paymentMethod.stripe').click();
 await expect(page.getByRole('heading',{name:SYNTHETIC_PROVIDER_HEADING,exact:true})).toBeVisible();const original=(await orders(request))[0];
 const second=await browser.newContext();try{
  await signIn(second,'other@example.invalid');
  const response=await second.request.post(origin+'/api/payments/checkout/release',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1','Idempotency-Key':original.key},data:{}});
  expect(response.status()).toBe(409);expect((await response.json()).replacementKey).toBeUndefined();
  expect((await orders(request))[0].status).toBe('pending');
 }finally{await second.close();}
});

test('section recurring checkout enforces consent, provider availability and first-term coupon disclosure',async({page,context,request})=>{
 // Controlled DTOs exercise actual checkout/browser behavior. The final hosted
 // page is synthetic; no subscription, charge, webhook or provider is verified.
 await signIn(context);const quotes:any[]=[],submissions:any[]=[];
 await context.route('**/api/payments/catalog**',async route=>{
  const url=new URL(route.request().url());expect(url.searchParams.get('kind')).toBe('section');expect(url.searchParams.get('product')).toBe('mediation');
  await route.fulfill({json:{success:true,purchase:{kind:'section',product:'mediation',title:'Mediation Section',offers:[{key:'six',label:'Six months',amountMinor:6000,currency:'USD',durationMonths:6}]}}});
 });
 await context.route('**/api/payments/quote',async route=>{
  const body=route.request().postDataJSON();quotes.push(body);const discount=body.couponCode==='FIRST25'?1500:0;
  await route.fulfill({json:{success:true,quote:{kind:'section',product:'mediation',optionKey:'six',subtotalMinor:6000,discountMinor:discount,amountMinor:6000-discount,renewalAmountMinor:6000,currency:'USD',durationMonths:6,autoRenew:body.autoRenew===true,availableProviders:{stripe:true,paypal:true},fingerprint:discount?'fixture-coupon-first-term':'fixture-standard-term'}}});
 });
 await context.route('**/api/payments/checkout',async route=>{
  submissions.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
  const id='eeeeeeeeeeeeeeeeeeeeeeee';
  await route.fulfill({json:{success:true,order:{_id:id,provider:'stripe',kind:'section',product:'mediation',status:'pending'},url:'https://checkout.stripe.com/c/pay/sa-ui-'+id}});
 });
 await page.goto('/checkout?section=mediation&option=six');
 const renewal=page.getByRole('checkbox',{name:/Automatically renew my access/}),consent=page.locator('.checkoutConsent input[type="checkbox"]');
 const stripe=page.locator('button.paymentMethod.stripe'),paypal=page.locator('button.paymentMethod.paypal'),summary=page.locator('.orderSummary');
 await expect(renewal).toBeChecked();await expect(consent).not.toBeChecked();await expect(stripe).toBeEnabled();await expect(paypal).toBeEnabled();
 await expect(summary.getByText('Access',{exact:true}).locator('..')).toContainText('Entire section');
 await stripe.click();await expect(page.getByRole('alert').filter({hasText:'Please accept the purchase and renewal terms'})).toBeVisible();expect(submissions).toHaveLength(0);
 await consent.check();await page.getByLabel('One-time discount code',{exact:true}).fill('FIRST25');await page.getByRole('button',{name:'Apply code',exact:true}).click();
 await expect(summary.getByText('Total due now',{exact:true}).locator('..')).toContainText('$45');
 await expect(summary.getByText('First-term discount',{exact:true}).locator('..')).toContainText('−$15');
 await expect(summary.getByText('Each renewal',{exact:true}).locator('..')).toContainText('$60 / 6 month(s)');
 await expect(page.getByText('Single-use codes apply to the first term only. Future renewals use the standard price shown below.',{exact:true})).toBeVisible();
 await expect(consent).not.toBeChecked();
 await renewal.uncheck();await expect(paypal).toBeEnabled();await expect(summary.getByText('Each renewal',{exact:true})).toHaveCount(0);
 await renewal.check();await expect(paypal).toBeEnabled();await expect(stripe).toBeEnabled();await expect(consent).not.toBeChecked();
 await expect(summary.getByText('Each renewal',{exact:true}).locator('..')).toContainText('$60 / 6 month(s)');
 await consent.check();await stripe.click();await expect(page.getByRole('heading',{name:SYNTHETIC_PROVIDER_HEADING,exact:true})).toBeVisible();
 expect(submissions).toHaveLength(1);expect(submissions[0].key).toMatch(/^[-_a-zA-Z0-9]{16,128}$/);
 expect(submissions[0].body).toMatchObject({kind:'section',product:'mediation',optionKey:'six',provider:'stripe',autoRenew:true,termsAccepted:true,couponCode:'FIRST25',quoteFingerprint:'fixture-coupon-first-term'});
 expect(quotes.some(quote=>quote.autoRenew===false&&quote.couponCode==='FIRST25')).toBe(true);
 for(const body of quotes){expect(body).toMatchObject({kind:'section',product:'mediation',optionKey:'six'});expect(body.country).toBeUndefined();expect(body.amountMinor).toBeUndefined();}
 const state=await control(request,'state');expect(state.orders).toHaveLength(0);expect(state.payments).toHaveLength(0);
});
test('retired Academy-wide purchase links offer the current catalog and never create a new payment',async({page,context,request})=>{
 await signIn(context);await page.goto('/checkout?plan=Annual');
 await expect(page.getByText(/no longer sold/i)).toBeVisible();await expect(page.locator('button.paymentMethod')).toHaveCount(0);
 await expect(page.locator('main a[href="/academy"]').first()).toBeVisible();
 const state=await control(request,'state');expect(state.orders).toHaveLength(0);expect(state.payments).toHaveLength(0);expect(state.calls.some((call:any)=>['/api/payments/catalog','/api/payments/quote','/api/payments/checkout'].includes(call.path))).toBe(false);
});
test('historical paid Academy membership return and invoice remain readable after sales retire',async({page,context,request})=>{
 await signIn(context);const legacy=(await control(request,'legacy-membership',{})).order;
 await page.goto('/checkout/return?order='+legacy._id);await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'You’re ready to learn.'})).toBeVisible();
 await page.goto('/billing?section=invoices');await expect(page.getByRole('heading',{name:'SA-FIXTURE-'+legacy._id,exact:true})).toBeVisible();
 const state=await control(request,'state');for(const key of ['orders','invoices','payments','terms','notices'])expect(state[key]).toHaveLength(1);expect(state.sectionTerms).toHaveLength(0);expect(state.invoices[0].totalMinor).toBe(29900);
});
test('retired membership page can resume its exact stored historical checkout without creating a new purchase',async({page,context,request})=>{
 await signIn(context);const legacy=await control(request,'legacy-membership',{paid:false});
 const attempt={owner:'111111111111111111111111',kind:'membership',product:legacy.order.product,optionKey:'annual',renewalOf:'',provider:'stripe',key:legacy.key,orderId:legacy.order._id,autoRenew:false,couponCode:''};
 const scope='sa-checkout-active:'+JSON.stringify([attempt.owner,attempt.kind,attempt.product,'']);
 await page.addInitScript(({attempt,scope,origin})=>{if(location.origin===origin)sessionStorage.setItem(scope,JSON.stringify(attempt));},{attempt,scope,origin});
 await page.goto('/checkout?plan='+encodeURIComponent(legacy.order.product));await expect(page.locator('button.paymentMethod')).toHaveCount(0);
 await page.getByRole('button',{name:'Check existing checkout',exact:true}).click();await expect(page.getByRole('heading',{name:SYNTHETIC_PROVIDER_HEADING,exact:true})).toBeVisible();
 const state=await control(request,'state');expect(state.orders).toHaveLength(1);expect(state.orders[0]._id).toBe(legacy.order._id);expect(state.orders[0].key).toBe(legacy.key);expect(state.payments).toHaveLength(0);expect(state.calls.filter((call:any)=>call.path==='/api/payments/checkout'&&call.method==='POST')).toHaveLength(0);
});
test('existing renewal controls require confirmation and preserve the paid period while disabling and enabling',async({page,context,request})=>{
 // Local agreement fixture only: browser consent/state does not prove Stripe settlement.
 await signIn(context);await control(request,'config',{agreementState:'active'});const original=(await control(request,'state')).agreements[0];
 await page.goto('/billing');const renewals=page.locator('.billingAutoRenewals');
 await expect(renewals.getByText('Automatic renewal on',{exact:true})).toBeVisible();
 await renewals.getByRole('button',{name:'Disable automatic renewal',exact:true}).click();const disableCard=page.getByRole('dialog',{name:'Are you sure you want to disable automatic renewal?',exact:true});await expect(disableCard).toContainText('paid access remains');await disableCard.getByRole('button',{name:'Cancel',exact:true}).click();expect((await control(request,'state')).agreements[0].autoRenew).toBe(true);
 await renewals.getByRole('button',{name:'Disable automatic renewal',exact:true}).click();await disableCard.getByRole('button',{name:'Confirm',exact:true}).click();await expect(renewals.getByText('Automatic renewal off',{exact:true})).toBeVisible();
 const disabled=(await control(request,'state')).agreements[0];expect(disabled.currentPeriodEnd).toBe(original.currentPeriodEnd);expect(disabled.canEnableRenewal).toBe(true);
 await renewals.getByRole('button',{name:'Enable automatic renewal',exact:true}).click();const enableCard=page.getByRole('dialog',{name:'Are you sure you want to enable automatic renewal?',exact:true});await expect(enableCard).toContainText('$299 every 12 month(s)');await expect(enableCard).toContainText('First-term discounts do not repeat');expect((await control(request,'state')).agreements[0].autoRenew).toBe(false);await enableCard.getByRole('button',{name:'Confirm',exact:true}).click();await expect(renewals.getByText('Automatic renewal on',{exact:true})).toBeVisible();
 const resumed=await control(request,'state');expect(resumed.agreements[0].currentPeriodEnd).toBe(original.currentPeriodEnd);expect(resumed.payments).toHaveLength(0);expect(resumed.orders).toHaveLength(0);
 await control(request,'config',{agreementState:'ended'});
 // The ended agreement needs an actual historical paid record to offer the
 // product-specific regular checkout, rather than inventing setup eligibility.
 const historical=await context.request.post(origin+'/api/payments/checkout',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1','Idempotency-Key':'expired-section-navigation-fixture-123'},data:{kind:'section',product:'academy-section',optionKey:'annual',provider:'stripe',autoRenew:false,termsAccepted:true}});expect(historical.ok()).toBe(true);const historicalId=(await historical.json()).order._id;
 await control(request,'settle',{id:historicalId});await control(request,'expire-paid-access',{id:historicalId});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(renewals.getByRole('button',{name:'Enable automatic renewal',exact:true})).toHaveCount(0);await expect(renewals.getByRole('link',{name:'Renew and enable automatic renewal',exact:true})).toHaveAttribute('href','/checkout?section=academy-section&option=annual');
});
