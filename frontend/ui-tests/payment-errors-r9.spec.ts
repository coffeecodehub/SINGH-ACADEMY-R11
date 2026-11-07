/** Browser error/recovery DTO fixtures only. No merchant request is made. */
import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:3108',fixture='http://127.0.0.1:5109',orderId='c'.repeat(24);
for(const provider of ['stripe','paypal'])test(provider+' error keeps its support reference after read-only checkout recovery',async({page,context,request})=>{
 const reset=await request.post(fixture+'/__fixture/reset',{headers:{'x-sa-ui-fixture':'local-synthetic-tests-only'},data:{}});expect(reset.ok()).toBe(true);
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const login=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-CSRF':'1','X-SA-Portal':'student'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});expect(login.ok()).toBe(true);
 const submissions:{key:string;body:any}[]=[],recoveryKeys:string[]=[],requestId='12345678-abcd-4000-8000-123456789abc';
 const message='The payment provider could not start or confirm checkout. Please contact the Academy with the request ID; check the same order if you already approved payment. Request ID: '+requestId+'.';
 await context.route('**/api/payments/checkout',route=>{
  submissions.push({key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()});
  return route.fulfill({status:502,headers:{'X-Request-ID':requestId},json:{success:false,message,code:'PAYMENT_PROVIDER_REJECTED',requestId}});
 });
 await context.route('**/api/payments/checkout-status',route=>{
  const key=route.request().headers()['idempotency-key'];recoveryKeys.push(key);
  return route.fulfill({json:{success:true,found:true,creationPending:true,url:null,order:{_id:orderId,provider,kind:'course',product:'paid-demo',status:'creating',autoRenew:false}}});
 });
 await page.goto('/checkout?course=paid-demo');const renewal=page.getByRole('checkbox',{name:/Automatically renew my access/});await expect(renewal).toBeVisible();await expect(renewal).toBeEnabled();if(await renewal.isChecked())await renewal.uncheck();
 const consent=page.locator('.checkoutConsent input[type="checkbox"]');await consent.check();const button=page.locator('button.paymentMethod.'+provider);await expect(button).toBeEnabled();await button.click();
 const alert=page.locator('.checkoutWrap .saFeedback--error[role="alert"]');await expect(alert).toContainText(message);await expect(alert).toContainText('Your existing checkout is still being prepared.');await expect(page.getByRole('button',{name:'Check existing checkout',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Start a new checkout',exact:true})).toHaveCount(0);
 expect(submissions).toHaveLength(1);expect(submissions[0].body).toMatchObject({kind:'course',product:'paid-demo',provider,autoRenew:false});expect(recoveryKeys).toContain(submissions[0].key);
 const saved=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('sa-checkout-active:')).map(([,value])=>JSON.parse(value)));expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({key:submissions[0].key,provider,orderId});
 await page.getByRole('button',{name:'Check existing checkout',exact:true}).click();await expect.poll(()=>recoveryKeys.length).toBeGreaterThan(1);expect(recoveryKeys.every(key=>key===submissions[0].key)).toBe(true);expect(submissions).toHaveLength(1);
});
