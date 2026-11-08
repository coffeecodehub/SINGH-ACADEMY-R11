import {test,expect,type BrowserContext,type APIRequestContext} from '@playwright/test';
const origin='http://127.0.0.1:3108',api='http://127.0.0.1:5109';
async function control(request:APIRequestContext,path:string,body?:object){const options={headers:{'x-sa-ui-fixture':'local-synthetic-tests-only'}};const r=body?await request.post(api+'/__fixture/'+path,{...options,data:body}):await request.get(api+'/__fixture/'+path,options);expect(r.ok()).toBe(true);return r.json();}
async function signIn(context:BrowserContext){const r=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});expect(r.ok()).toBe(true);}
test.beforeEach(async({context,request})=>{await control(request,'reset',{});await signIn(context);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());});
for(const width of [390,1024,1440])test('course and complete-section choice cards keep the existing responsive layout at '+width+'px',async({page,request})=>{
 await page.setViewportSize({width,height:1000});
 await page.goto('/checkout?course=section-course-demo');
 const originalUrl=page.url(),documentTime=await page.evaluate(()=>performance.timeOrigin);
 const choices=page.locator('.planChoice'),course=choices.getByRole('button',{name:/^Individual course/}),section=choices.getByRole('button',{name:/^Complete section/});
 await expect(course).toBeVisible();await expect(section).toBeVisible();await expect(section).toHaveText('Complete sectionAll published courses in this section');await expect(choices.locator(':scope > button')).toHaveCount(2);await expect(page.getByRole('complementary',{name:'Full section purchase',exact:true})).toHaveCount(0);
 const courseBox=await course.boundingBox(),sectionBox=await section.boundingBox();expect(courseBox).not.toBeNull();expect(sectionBox).not.toBeNull();expect(Math.abs(courseBox!.width-sectionBox!.width)).toBeLessThan(1);
 if(width>900){expect(Math.abs(courseBox!.y-sectionBox!.y)).toBeLessThan(1);expect(Math.abs(courseBox!.height-sectionBox!.height)).toBeLessThan(1);expect(sectionBox!.x).toBeGreaterThan(courseBox!.x+courseBox!.width);}else{expect(sectionBox!.y).toBeGreaterThanOrEqual(courseBox!.y+courseBox!.height);expect(Math.abs(courseBox!.x-sectionBox!.x)).toBeLessThan(1);}
 const styles=await choices.locator(':scope > button').evaluateAll(buttons=>buttons.map(button=>{const style=getComputedStyle(button);return{padding:style.padding,borderRadius:style.borderRadius,fontFamily:style.fontFamily,fontSize:style.fontSize};}));expect(styles[0]).toEqual(styles[1]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('.planChoice button.selected')).toHaveText('Individual courseYour selected course');await expect(page.locator('.orderSummary')).toContainText('Section Learning Test');await expect(page.locator('.orderSummary')).toContainText('$149');
 expect((await control(request,'state')).orders).toHaveLength(0);
 await page.locator('.checkoutConsent input').check();await section.click();await expect(page).toHaveURL(originalUrl);await expect(page.locator('.orderSummary')).toContainText('Published Learning Section');await expect(page.locator('.orderSummary')).toContainText('$299');await expect(page.locator('.planChoice button.selected')).toHaveText('Complete sectionAll published courses in this section');await expect(page.locator('.checkoutConsent input')).not.toBeChecked();await expect(course).toBeVisible();await expect(choices.locator(':scope > button')).toHaveCount(2);expect(await page.evaluate(()=>performance.timeOrigin)).toBe(documentTime);
 await course.click();await expect(page).toHaveURL(originalUrl);await expect(page.locator('.orderSummary')).toContainText('Section Learning Test');await expect(page.locator('.orderSummary')).toContainText('$149');await expect(page.locator('.planChoice button.selected')).toHaveText('Individual courseYour selected course');await expect(section).toBeVisible();expect(await page.evaluate(()=>performance.timeOrigin)).toBe(documentTime);expect((await control(request,'state')).orders).toHaveLength(0);
});
test('unrelated standalone course and section checkout show no extra suggestion',async({page})=>{
 for(const url of ['/checkout?course=paid-demo','/checkout?section=academy-section']){await page.goto(url);await expect(page.locator('.orderSummary')).toBeVisible();await expect(page.locator('.planChoice > button')).toHaveCount(1);await expect(page.locator('.planChoice button.selected')).toContainText(url.includes('course=')?'Individual course':'Complete section');await expect(page.getByRole('complementary',{name:'Full section purchase',exact:true})).toHaveCount(0);}
});
test('active whole-section access hides purchase suggestion and original checkout buttons',async({page,context,request})=>{
 const made=await context.request.post(origin+'/api/payments/checkout',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1','Idempotency-Key':'section-suggestion-paid-1234567890'},data:{kind:'section',product:'academy-section',optionKey:'annual',provider:'stripe',autoRenew:false,termsAccepted:true}});expect(made.ok()).toBe(true);const {order}=await made.json();await control(request,'settle',{id:order._id});const before=await control(request,'state');
 await page.goto('/checkout?course=section-course-demo');await expect(page.getByRole('heading',{name:'Your access is active.',exact:true})).toBeVisible();await expect(page.locator('.planChoice').getByRole('button',{name:/^Complete section/})).toHaveCount(0);await expect(page.locator('button.paymentMethod')).toHaveCount(0);const after=await control(request,'state');for(const field of ['orders','invoices','payments','sectionTerms'])expect(after[field]).toEqual(before[field]);
});
test('optional section lookup failure preserves individual purchase and creates no order',async({page,context,request})=>{
 await context.route('**/api/sections/academy-section',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Controlled section outage'})}));await page.goto('/checkout?course=section-course-demo');await expect(page.locator('.orderSummary')).toContainText('$149');await expect(page.locator('.planChoice').getByRole('button',{name:/^Complete section/})).toHaveCount(0);await expect(page.locator('button.paymentMethod.stripe')).toBeEnabled();expect((await control(request,'state')).orders).toHaveLength(0);
});

for(const stage of ['catalog','quote'])test('switching back while section '+stage+' is delayed keeps the course quote and document',async({page,request})=>{
 await page.goto('/checkout?course=section-course-demo');
 const choices=page.locator('.planChoice'),section=choices.getByRole('button',{name:/^Complete section/}),course=choices.getByRole('button',{name:/^Individual course/});
 await expect(section).toBeVisible();await expect(page.locator('.orderSummary')).toContainText('$149');const originalUrl=page.url(),documentTime=await page.evaluate(()=>performance.timeOrigin);
 let release!:()=>void,seen!:()=>void,finished!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),observed=new Promise<void>(resolve=>seen=resolve),done=new Promise<void>(resolve=>finished=resolve);
 await page.route(stage==='catalog'?'**/api/payments/catalog?*':'**/api/payments/quote',async route=>{
  const kind=stage==='catalog'?new URL(route.request().url()).searchParams.get('kind'):route.request().postDataJSON().kind;
  if(kind!=='section')return route.continue();
  const response=await route.fetch();seen();await gate;
  try{await route.fulfill({response});}catch{/* The previous selection's fetch is deliberately aborted. */}finally{finished();}
 });
 try{
  await section.click();await observed;await expect(course).toBeEnabled();await expect(section).toBeEnabled();await course.click();await expect(page.locator('.orderSummary')).toContainText('Section Learning Test');await expect(page.locator('.orderSummary')).toContainText('$149');release();await done;
  await expect(page).toHaveURL(originalUrl);expect(await page.evaluate(()=>performance.timeOrigin)).toBe(documentTime);await expect(page.locator('.planChoice button.selected')).toContainText('Individual course');await expect(page.locator('.orderSummary')).not.toContainText('$299');await expect(page.locator('button.paymentMethod.stripe')).toBeEnabled();expect((await control(request,'state')).orders).toHaveLength(0);
 }finally{release();}
});

test('busy and uncertain existing checkout keep both choices disabled without changing product',async({page,request})=>{
 await page.goto('/checkout?course=section-course-demo');const choices=page.locator('.planChoice');await expect(choices.getByRole('button',{name:/^Complete section/})).toBeVisible();await expect(page.locator('.orderSummary')).toContainText('$149');
 let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),observed=new Promise<void>(resolve=>seen=resolve);let writes=0;
 await page.route('**/api/payments/checkout',async route=>{writes++;expect(route.request().postDataJSON()).toMatchObject({kind:'course',product:'section-course-demo',optionKey:'annual'});seen();await gate;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Controlled provider uncertainty'})});});
 try{
  await page.locator('.checkoutConsent input').check();await page.locator('button.paymentMethod.stripe').click();await observed;
  for(const name of [/^Individual course/,/^Complete section/])await expect(choices.getByRole('button',{name})).toBeDisabled();release();await expect(page.getByRole('button',{name:'Check existing checkout',exact:true})).toBeEnabled();
  for(const name of [/^Individual course/,/^Complete section/])await expect(choices.getByRole('button',{name})).toBeDisabled();await expect(choices.locator('button.selected')).toContainText('Individual course');await expect(page).toHaveURL('/checkout?course=section-course-demo');expect(writes).toBe(1);expect((await control(request,'state')).orders).toHaveLength(0);
 }finally{release();}
});
