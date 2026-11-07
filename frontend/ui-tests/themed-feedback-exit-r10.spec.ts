/** Actual My Billing route with synthetic API responses; no provider or MongoDB writes. */
import {test,expect,type BrowserContext,type Locator,type Page} from '@playwright/test';

const origin='http://127.0.0.1:3108',invoiceId='b'.repeat(24),privateTitle='Private exit fixture purchase';
const cancellationPath='/api/payments/mine/purchases/'+invoiceId+'/cancel-now';
test.use({reducedMotion:'no-preference'});

async function login(context:BrowserContext,email='learner@example.invalid'){
 const response=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-CSRF':'1','X-SA-Portal':'student'},data:{email,password:'TestPassword123!'}});
 expect(response.ok()).toBe(true);return (await response.json()).user;
}

async function billingFixture(context:BrowserContext,{holdResponse=false}={}){
 await login(context);let cancelled=false,privateData=true,writes=0,release=()=>{};
 const responseGate=new Promise<void>(resolve=>{release=resolve;});
 const item={key:'section:private-exit',invoiceId,kind:'section',product:'private-exit',title:privateTitle,renewalSetup:true,billingStartsAt:'2099-01-01T00:00:00Z',accessExpiresAt:'2099-01-01T00:00:00Z',amountMinor:2500,amountDueNowMinor:0,currency:'USD',intervalMonths:1,canSetup:false,canCancelActivePurchase:true,setupUrl:'/checkout?section=private-exit&renewalSetup=1'};
 await context.route('**/api/payments/mine/agreements',route=>route.fulfill({json:{items:[],setupItems:privateData&&!cancelled?[item]:[]}}));
 await context.route('**'+cancellationPath,async route=>{
  writes++;expect(route.request().postDataJSON()).toEqual({confirmImmediateCancellation:true});
  if(holdResponse)await responseGate;
  cancelled=true;await route.fulfill({json:{success:true,item:{_id:invoiceId,invoiceId,kind:item.kind,product:item.product,canCancelActivePurchase:false,accessCancelledAt:'2026-11-07T12:00:00Z'},immediateRevocation:true,noRefund:true}});
 });
 return {get writes(){return writes;},release:()=>release(),hidePrivateData:()=>{privateData=false;}};
}

async function openCancellation(page:Page){
 await page.goto('/billing');
 const launch=page.locator('.billingAutoRenewals').getByRole('button',{name:'Cancel purchase access now',exact:true});
 await expect(launch).toBeVisible();await launch.evaluate(node=>{(node as HTMLElement).dataset.feedbackExitOpener='billing-cancel';});await launch.click();
 const dialog=page.getByRole('dialog',{name:'Before you cancel',exact:true});await expect(dialog).toBeVisible();await expect(dialog).toContainText(privateTitle);await expect(dialog).toHaveCSS('opacity','1');
 return {launch,dialog};
}

async function reviewCancellation(page:Page,dialog:Locator){
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Next: review cancellation',exact:true}).click();
 const confirmation=page.getByRole('dialog',{name:'Confirm cancellation',exact:true});await expect(confirmation).toBeVisible();return confirmation;
}

/** Record at mutation/fetch time, so a slow assertion cannot miss a short exit. */
async function watchExit(dialog:Locator){
 await dialog.evaluate((node,path)=>{
  const element=node as HTMLDialogElement,opener=document.querySelector<HTMLElement>('[data-feedback-exit-opener="billing-cancel"]');
  element.dataset.feedbackExitAudit='watched';
  const snapshot=()=>({at:performance.now(),connected:element.isConnected,sameNode:document.querySelector('[data-feedback-exit-audit="watched"]')===element,state:element.getAttribute('data-feedback-state'),open:element.open,modal:element.matches(':modal'),inert:element.inert,ariaHidden:element.getAttribute('aria-hidden'),focusRestored:document.activeElement===opener,bodyUnlocked:document.body.style.overflow!=='hidden',display:getComputedStyle(element).display,duration:getComputedStyle(element).transitionDuration});
  const audit:any={closing:[],fetches:[],removed:false,removedAt:null,afterRemoval:null,triggeredAt:null};
  const observe=()=>{
   const current=snapshot();
   if(current.connected&&current.state==='closing'&&!audit.closing.length)audit.closing.push(current);
   if(!current.connected&&!audit.removed){audit.removed=true;audit.removedAt=current.at;audit.afterRemoval=current;}
  };
  const observer=new MutationObserver(observe);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-feedback-state','aria-hidden','inert','open']});
  const originalFetch=window.fetch;
  window.fetch=(...args:Parameters<typeof fetch>)=>{
   const input=args[0],url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
   const method=args[1]?.method||(input instanceof Request?input.method:'GET');
   if(new URL(url,location.href).pathname===path&&method.toUpperCase()==='POST')audit.fetches.push(snapshot());
   return Reflect.apply(originalFetch,window,args);
  };
  (window as any).__feedbackExitAudit=audit;
 },cancellationPath);
}

async function exitAudit(page:Page){return page.evaluate(()=>{
 const audit=(window as any).__feedbackExitAudit;
 return audit?{closing:audit.closing,fetches:audit.fetches,removed:audit.removed,removedAt:audit.removedAt,afterRemoval:audit.afterRemoval,triggeredAt:audit.triggeredAt}:null;
});}

async function expectSmoothExit(page:Page){
 await expect.poll(async()=>(await exitAudit(page))?.closing.length).toBe(1);
 const closing=(await exitAudit(page))!.closing[0];
 expect(closing).toMatchObject({connected:true,sameNode:true,state:'closing',open:false,modal:false,inert:true,ariaHidden:'true',bodyUnlocked:true});
 expect(closing.display).not.toBe('none');expect(closing.duration.split(',').map((part:string)=>part.trim())).toContain('0.18s');
 await expect.poll(async()=>(await exitAudit(page))?.removed,{timeout:2000}).toBe(true);
 const audit=(await exitAudit(page))!;expect(audit.removedAt-closing.at).toBeGreaterThanOrEqual(100);
 await expect(page.locator('dialog[data-feedback-exit-audit="watched"]')).toHaveCount(0);
 return audit;
}

for(const close of ['cancel','escape'] as const)test(close+' smoothly exits the same native billing dialog and restores focus immediately',async({page,context})=>{
 test.skip(!await page.evaluate(()=>CSS.supports('transition-behavior','allow-discrete')),'Native discrete exit transitions are unsupported in this browser.');
 const fixture=await billingFixture(context),{launch,dialog}=await openCancellation(page);await watchExit(dialog);
 if(close==='cancel')await dialog.getByRole('button',{name:'Keep my access',exact:true}).click();else await page.keyboard.press('Escape');
 const audit=await expectSmoothExit(page);expect(audit.closing[0].focusRestored).toBe(true);await expect(launch).toBeFocused();expect(fixture.writes).toBe(0);
});

test('confirm dispatches one cancellation immediately while its response is held and its dialog exits',async({page,context})=>{
 const fixture=await billingFixture(context,{holdResponse:true}),{dialog}=await openCancellation(page),confirmation=await reviewCancellation(page,dialog);await watchExit(confirmation);
 try{
  await confirmation.getByRole('button',{name:'Confirm cancellation now',exact:true}).evaluate(node=>{
   (window as any).__feedbackExitAudit.triggeredAt=performance.now();const button=node as HTMLButtonElement;button.click();button.click();
  });
  await expect.poll(()=>fixture.writes).toBe(1);
  const dispatched=(await exitAudit(page))!;expect(dispatched.fetches).toHaveLength(1);expect(dispatched.fetches[0]).toMatchObject({connected:true,sameNode:true});
  await expect(page.locator('.billingAutoRenewals').getByText('Cancellation confirmed.',{exact:false})).toHaveCount(0);
  if(await page.evaluate(()=>CSS.supports('transition-behavior','allow-discrete')))await expectSmoothExit(page);
  else await expect.poll(async()=>(await exitAudit(page))?.removed).toBe(true);
  expect(fixture.writes).toBe(1);
 }finally{fixture.release();}
 await expect(page.locator('.billingAutoRenewals').getByRole('status').filter({hasText:'Cancellation confirmed.'})).toBeVisible();expect(fixture.writes).toBe(1);
});

test('reduced motion removes a cancelled billing dialog without retaining an animated copy',async({page,context})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const fixture=await billingFixture(context),{launch,dialog}=await openCancellation(page);await watchExit(dialog);
 await dialog.getByRole('button',{name:'Keep my access',exact:true}).click();await expect.poll(async()=>(await exitAudit(page))?.removed).toBe(true);
 const audit=(await exitAudit(page))!;expect(audit.closing).toHaveLength(0);expect(audit.afterRemoval).toMatchObject({connected:false,focusRestored:true,bodyUnlocked:true});await expect(launch).toBeFocused();expect(fixture.writes).toBe(0);
});

for(const change of ['route','account'] as const)test(change+' changes abort pending billing consent without retaining private dialog DOM',async({page,context})=>{
 const fixture=await billingFixture(context),{dialog}=await openCancellation(page),confirmation=await reviewCancellation(page,dialog);await watchExit(confirmation);
 const staleConfirm=await confirmation.getByRole('button',{name:'Confirm cancellation now',exact:true}).elementHandle();
 if(change==='route'){
  // Simulate a navigation initiated elsewhere while the native modal owns input.
  await page.locator('a[href="/home"]').first().evaluate(node=>(node as HTMLAnchorElement).click());await expect(page).toHaveURL(/\/home$/);
 }else{
  fixture.hidePrivateData();const user=await login(context,'other@example.invalid');
  await page.evaluate(nextUser=>window.dispatchEvent(new CustomEvent('sa:authenticated',{detail:{portal:'student',user:nextUser}})),user);
  await expect(page.locator('.userChip')).toContainText('Second');
 }
 await expect.poll(async()=>(await exitAudit(page))?.removed).toBe(true);
 const audit=(await exitAudit(page))!;expect(audit.closing).toHaveLength(0);await expect(page.locator('dialog').filter({hasText:privateTitle})).toHaveCount(0);
 await staleConfirm?.evaluate(node=>(node as HTMLButtonElement).click());expect(fixture.writes).toBe(0);
});
