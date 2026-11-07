/** Actual Next pages and the local synthetic fixture. No provider or real payment calls. */
import {test,expect,type APIRequestContext,type BrowserContext} from '@playwright/test';

const origin='http://127.0.0.1:3108',api='http://127.0.0.1:5109';
const sectionSlug='academy-section',sectionTitle='Published Learning Section';
const courseSlug='paid-demo',courseTitle='Paid Learning Test';
const childSlug='section-course-demo',childTitle='Section Learning Test';

async function control(request:APIRequestContext,path:string,body?:object){
 const options={headers:{'x-sa-ui-fixture':'local-synthetic-tests-only'}};
 const response=body?await request.post(api+'/__fixture/'+path,{...options,data:body}):await request.get(api+'/__fixture/'+path,options);
 expect(response.ok()).toBe(true);return response.json();
}
async function signIn(context:BrowserContext,email='learner@example.invalid'){
 const response=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email,password:'TestPassword123!'}});
 expect(response.ok()).toBe(true);
}
async function seedPaid(context:BrowserContext,request:APIRequestContext,kind:'course'|'section'){
 const response=await context.request.post(origin+'/api/payments/checkout',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1','Idempotency-Key':'task6-owned-'+kind+'-1234567890'},data:{kind,product:kind==='course'?courseSlug:sectionSlug,optionKey:'annual',provider:'stripe',autoRenew:false,termsAccepted:true}});
 expect(response.ok()).toBe(true);const {order}=await response.json();await control(request,'settle',{id:order._id});return order._id as string;
}
function unchangedPaidRecords(before:any,after:any){
 for(const field of ['orders','invoices','payments','terms','sectionTerms','agreements','notices'])expect(after[field],field+' unchanged by browsing access').toEqual(before[field]);
}

test.beforeEach(async({context,request})=>{
 await control(request,'reset',{});await signIn(context);
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
});

test('active section hides Academy and child offers, then opens actual included course content',async({page,context,request})=>{
 await seedPaid(context,request,'section');const before=await control(request,'state');
 await page.goto('/academy');const card=page.locator('article.courseVisualCard').filter({hasText:sectionTitle});
 await expect(card.getByText('Section Access',{exact:true})).toBeVisible();await expect(card.locator('.catalogPrices')).toHaveCount(0);await expect(card.getByText('$299',{exact:true})).toHaveCount(0);await expect(card.locator('a[href^="/checkout"]')).toHaveCount(0);
 await card.getByRole('link',{name:'Open Section →',exact:true}).click();await expect(page).toHaveURL('/sections/'+sectionSlug+'#section-courses');
 const access=page.getByRole('complementary',{name:'Section access',exact:true});await expect(access.getByRole('link',{name:'Open included courses →',exact:true})).toBeVisible();await expect(access.locator('.catalogPrices')).toHaveCount(0);await expect(page.getByRole('link',{name:'Buy entire section →',exact:true})).toHaveCount(0);
 await access.getByRole('link',{name:'Open included courses →',exact:true}).click();
 const included=page.locator('#section-courses article.courseVisualCard').filter({hasText:childTitle});await expect(included.getByText('Section Access',{exact:true})).toBeVisible();await expect(included.locator('.catalogPrices')).toHaveCount(0);
 const loaded=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/courses/'+childSlug+'/learn');
 await included.getByRole('link',{name:'Continue Course →',exact:true}).click();expect((await loaded).ok()).toBe(true);await expect(page).toHaveURL('/learn/'+childSlug);await expect(page.getByRole('heading',{name:childTitle,exact:true})).toBeVisible();
 unchangedPaidRecords(before,await control(request,'state'));
});

test('direct course access opens learning and active checkout exposes no second payment',async({page,context,request})=>{
 await seedPaid(context,request,'course');const before=await control(request,'state');
 await page.goto('/academy');const card=page.locator('article.courseVisualCard').filter({hasText:courseTitle});await expect(card.getByText('Course Access',{exact:true})).toBeVisible();await expect(card.locator('.catalogPrices')).toHaveCount(0);await expect(card.getByRole('link',{name:'Continue Course →',exact:true})).toHaveAttribute('href','/learn/'+courseSlug);
 await page.goto('/courses/'+courseSlug);const panel=page.locator('.enrollPanel');await expect(panel.getByRole('heading',{name:'Course Access',exact:true})).toBeVisible();await expect(panel.locator('.catalogPrices')).toHaveCount(0);await expect(panel.locator('a[href^="/checkout"]')).toHaveCount(0);
 const verified=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/payments/access/'+courseSlug);await panel.getByRole('button',{name:'Continue Course →',exact:true}).click();expect((await verified).ok()).toBe(true);await expect(page).toHaveURL('/learn/'+courseSlug);await expect(page.getByRole('heading',{name:courseTitle,exact:true})).toBeVisible();
 await page.goto('/checkout?course='+courseSlug);await expect(page.getByRole('heading',{name:'Your access is active.',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Continue Course →',exact:true})).toHaveAttribute('href','/learn/'+courseSlug);await expect(page.locator('button.paymentMethod')).toHaveCount(0);await expect(page.locator('.orderSummary')).toHaveCount(0);
 unchangedPaidRecords(before,await control(request,'state'));
});

test('section expiry restores the existing offer after an access refresh without altering paid status',async({page,context,request})=>{
 const id=await seedPaid(context,request,'section');await page.goto('/sections/'+sectionSlug);
 await expect(page.getByRole('complementary',{name:'Section access',exact:true})).toBeVisible();await expect(page.locator('.enrollPanel .catalogPrices')).toHaveCount(0);
 await control(request,'expire-paid-access',{id});const before=await control(request,'state');
 const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/payments/membership-status');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect((await (await refreshed).json()).sectionAccesses).toEqual([]);
 const offer=page.getByRole('complementary',{name:'Buy entire section',exact:true});await expect(offer.getByRole('link',{name:'Buy entire section →',exact:true})).toHaveAttribute('href','/checkout?section='+sectionSlug);await expect(offer.getByText('$299',{exact:true})).toBeVisible();await expect(offer.getByRole('link',{name:'Choose 12 months',exact:true})).toBeVisible();
 await page.goto('/checkout?section='+sectionSlug);await expect(page.locator('button.paymentMethod.stripe')).toBeEnabled();await expect(page.locator('.orderSummary')).toContainText('$299');
 const after=await control(request,'state');expect(after.orders.find((order:any)=>order._id===id).status).toBe('paid');unchangedPaidRecords(before,after);
});

test('another account sees its own section offer and never inherits purchased access',async({page,context,request})=>{
 await seedPaid(context,request,'section');await page.goto('/academy');let card=page.locator('article.courseVisualCard').filter({hasText:sectionTitle});await expect(card.getByText('Section Access',{exact:true})).toBeVisible();const before=await control(request,'state');
 await signIn(context,'other@example.invalid');await page.reload();card=page.locator('article.courseVisualCard').filter({hasText:sectionTitle});await expect(card.getByRole('link',{name:'Explore Section →',exact:true})).toBeVisible();await expect(card.getByText('$299',{exact:true})).toBeVisible();await expect(card.getByText('Section Access',{exact:true})).toHaveCount(0);
 await card.getByRole('link',{name:'Explore Section →',exact:true}).click();await expect(page.getByRole('complementary',{name:'Buy entire section',exact:true})).toBeVisible();await expect(page.locator('#section-courses').getByRole('link',{name:'Continue Course →',exact:true})).toHaveCount(0);
 const status=await context.request.get(origin+'/api/payments/membership-status',{headers:{'X-SA-Portal':'student'}});expect(status.ok()).toBe(true);const owned=await status.json();expect(owned.membershipActive).toBe(false);expect(owned.courseAccesses).toEqual([]);expect(owned.sectionAccesses).toEqual([]);
 unchangedPaidRecords(before,await control(request,'state'));
});
