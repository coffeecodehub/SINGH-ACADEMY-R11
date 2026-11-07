/** Real browser + Express + generated Mongo replica-set database.
 * Synthetic .invalid accounts are seeded ONLY by integration/browserServer.js.
 * No registration limiter override, external provider or real mailbox is used. */
import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const PASSWORD='Browser-Only-Fixture-2026!';
const origin='http://localhost:3000';
const identity={client:'client-admin@browser-fixture.invalid',super:'super-admin@browser-fixture.invalid',pk:'pk-student@browser-fixture.invalid',us:'us-student@browser-fixture.invalid'};
type Portal='student'|'client_admin'|'super_admin';
const headers=(portal:Portal)=>({Origin:origin,'X-SA-CSRF':'1','X-SA-Portal':portal});
async function signIn(context:BrowserContext,email:string,portal:Portal){
 const route=portal==='student'?'/api/auth/login':portal==='client_admin'?'/api/auth/admin/login':'/api/auth/super-admin/login';
 const response=await context.request.post(route,{headers:headers(portal),data:{email,password:PASSWORD}});
 expect(response.ok(),await response.text()).toBe(true);
 const data=await response.json();expect(data.user.role).toBe(portal);return data.user;
}
async function createCourse(context:BrowserContext,portal:Portal,slug:string,title:string){
 const response=await context.request.post('/api/admin/content/courses',{headers:headers(portal),data:{title,slug,published:true,price:80,currency:'USD',accessMonths:9,accessType:'one_time',pricing:[]}});
 expect(response.ok(),await response.text()).toBe(true);return (await response.json()).item;
}
async function confirmSave(page:Page){await page.getByRole('dialog').getByRole('button',{name:'Confirm & save',exact:true}).click();}

test('client admin creates and edits regional section pricing, assigns a course, and students receive only their country price',async({page,context,browser})=>{
 const suffix=randomUUID().slice(0,8),slug='browser-section-'+suffix,title='Browser Section '+suffix,courseSlug='browser-course-'+suffix,courseTitle='Browser Course '+suffix;
 await signIn(context,identity.client,'client_admin');
 await page.goto('/admin?section=sections');
 await page.getByRole('button',{name:'＋ Add section',exact:true}).click();
 await page.getByLabel('Section title',{exact:true}).fill(title);
 await page.getByLabel('URL slug (leave blank to generate)',{exact:true}).fill(slug);
 await page.getByLabel('Short description',{exact:true}).fill('A synthetic group of courses for browser acceptance.');
 await page.getByLabel('Published / available for purchase',{exact:true}).check();
 const baseFields=page.locator('.regionalPricing > .regionalBaseFields'),baseCountries=page.locator('.regionalPricing > .countryPrices');
 await baseFields.getByLabel('USA / default term total (USD)',{exact:true}).fill('90');
 await baseFields.getByLabel('Access term (months)',{exact:true}).fill('3');
 await baseCountries.getByRole('button',{name:'＋ Add country price',exact:true}).click();
 await baseCountries.getByLabel('Country for Default term override 1',{exact:true}).selectOption('PK');
 await baseCountries.getByLabel('Country total for Default term override 1',{exact:true}).fill('35');
 await page.getByRole('button',{name:'＋ Add another term',exact:true}).click();
 const option=page.locator('.regionalPricing .planEditor').first();
 await option.getByLabel('Term name',{exact:true}).fill('Nine months');
 await option.getByLabel('Access term (months)',{exact:true}).fill('9');
 await option.getByRole('spinbutton',{name:'USA / default term total (USD)',exact:true}).fill('90');
 await option.getByRole('button',{name:'＋ Add country price',exact:true}).click();
 await option.getByLabel('Country for Nine months override 1',{exact:true}).selectOption('PK');
 await option.getByLabel('Country total for Nine months override 1',{exact:true}).fill('27');
 await page.getByRole('button',{name:'Save and publish section',exact:true}).click();await confirmSave(page);
 const card=page.locator('.sectionAdminCard').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await expect(card).toBeVisible();await expect(card).toContainText('Published');
 await card.getByRole('button',{name:'Edit section',exact:true}).click();
 await expect(page.getByLabel('URL slug (leave blank to generate)',{exact:true})).toBeDisabled();
 await page.getByLabel('Country total for Nine months override 1',{exact:true}).fill('24');
 await option.getByRole('spinbutton',{name:'USA / default term total (USD)',exact:true}).fill('75');
 await expect(baseFields.getByLabel('USA / default term total (USD)',{exact:true})).toHaveValue('90');
 for(const [index,country] of [[2,'NP'],[3,'IN']] as const){
  await option.getByRole('button',{name:'＋ Add country price',exact:true}).click();
  await option.getByLabel(`Country for Nine months override ${index}`,{exact:true}).selectOption(country);
  await option.getByLabel(`Country total for Nine months override ${index}`,{exact:true}).fill('20');
 }
 await page.getByRole('button',{name:'Save and publish section',exact:true}).click();await confirmSave(page);await expect(card).toBeVisible();
 await createCourse(context,'client_admin',courseSlug,courseTitle);
 await page.getByRole('button',{name:'Courses',exact:true}).click();
 await page.getByRole('textbox',{name:'Search Courses',exact:true}).fill(courseTitle);
 const courseRow=page.getByRole('row').filter({hasText:courseTitle});await expect(courseRow).toBeVisible();await courseRow.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByRole('combobox',{name:'Course section',exact:true}).selectOption(slug);
 await page.getByRole('button',{name:'Save course details',exact:true}).click();await confirmSave(page);
 await expect(page.getByRole('status').filter({hasText:'Course details saved.'})).toBeVisible();
 const raw=await context.request.get('/api/admin/sections',{headers:headers('client_admin')});expect(raw.ok()).toBe(true);
 const stored=(await raw.json()).items.find((item:any)=>item.slug===slug);expect(stored.price).toBe(90);expect(stored.accessMonths).toBe(3);expect(stored.includeBaseOffer).toBe(true);expect(stored.countryPrices).toEqual([{country:'PK',price:35}]);
 expect(stored.pricing[0].price).toBe(75);expect(stored.pricing[0].durationMonths).toBe(9);expect(stored.pricing[0].countryPrices).toEqual([{country:'PK',price:24},{country:'NP',price:20},{country:'IN',price:20}]);
 const countries=await context.request.get('/api/auth/countries');const choices=(await countries.json()).countries;expect(choices.length).toBe(249);
 let usStudentId='';
 for(const [email,country,price]of [[identity.pk,'PK',24],[identity.us,'US',75]] as const){
  const student=await browser.newContext({baseURL:origin});try{
   const user=await signIn(student,email,'student');expect(user.country).toBe(country);if(country==='US')usStudentId=user.id;
   const response=await student.request.get('/api/sections/'+slug);expect(response.ok(),await response.text()).toBe(true);
   const data=await response.json(),custom=data.section.pricing.find((offer:any)=>offer.key===stored.pricing[0].key),baseOffer=data.section.pricing.find((offer:any)=>offer.key==='base');expect(custom.price).toBe(price);expect(custom.durationMonths).toBe(9);expect(baseOffer.price).toBe(country==='PK'?35:90);expect(baseOffer.durationMonths).toBe(3);expect(JSON.stringify(data)).not.toContain('countryPrices');expect(data.courses.some((course:any)=>course.slug===courseSlug)).toBe(true);
  }finally{await student.close();}
 }
 // Reuse only the generated synthetic account; restore it before any later browser case.
 expect(usStudentId).not.toBe('');
 const fallbackStudent=await browser.newContext({baseURL:origin});
 try{
  const corrected=await context.request.patch('/api/academy-admin/students/'+usStudentId+'/country',{headers:headers('client_admin'),data:{country:'FR',currentPassword:PASSWORD}});expect(corrected.ok(),await corrected.text()).toBe(true);
  const user=await signIn(fallbackStudent,identity.us,'student');expect(user.country).toBe('FR');
  expect(stored.pricing[0].countryPrices.some((entry:any)=>entry.country==='FR')).toBe(false);
  const response=await fallbackStudent.request.get('/api/sections/'+slug+'?country=PK');expect(response.ok(),await response.text()).toBe(true);
  const data=await response.json(),custom=data.section.pricing.find((offer:any)=>offer.key===stored.pricing[0].key);expect(custom.price).toBe(75);expect(custom.durationMonths).toBe(9);expect(data.section.pricing.find((offer:any)=>offer.key==='base').price).toBe(90);expect(JSON.stringify(data)).not.toContain('countryPrices');
  const quote=await fallbackStudent.request.post('/api/payments/quote',{headers:headers('student'),data:{kind:'section',product:slug,optionKey:stored.pricing[0].key,country:'PK',amountMinor:1}});expect(quote.ok(),await quote.text()).toBe(true);
  const quoted=(await quote.json()).quote;expect(quoted.country).toBe('FR');expect(quoted.amountMinor).toBe(7500);expect(quoted.durationMonths).toBe(9);
  const studentPage=await fallbackStudent.newPage();await studentPage.goto('/sections/'+slug+'?country=PK');
  await expect(studentPage.getByRole('heading',{name:title,exact:true})).toBeVisible();
  const prices=studentPage.getByRole('complementary',{name:'Buy entire section',exact:true}).getByRole('list',{name:'Access duration and total price',exact:true});
  await expect(prices.locator('b')).toHaveText(['$90','$75']);await expect(prices).toContainText('total for 3 months');await expect(prices).toContainText('total for 9 months');
 }finally{
  try{const restored=await context.request.patch('/api/academy-admin/students/'+usStudentId+'/country',{headers:headers('client_admin'),data:{country:'US',currentPassword:PASSWORD}});expect(restored.ok(),await restored.text()).toBe(true);}finally{await fallbackStudent.close();}
 }
});

test('super admin generates a scoped single-use coupon, copies it and revokes it through the real UI',async({page,context})=>{
 const suffix=randomUUID().slice(0,8),slug='browser-coupon-course-'+suffix,title='Browser Coupon Course '+suffix;
 await signIn(context,identity.super,'super_admin');await createCourse(context,'super_admin',slug,title);
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
 await page.goto('/super-admin?section=coupons');await expect(page.getByRole('button',{name:'Page sections',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'＋ Create coupon',exact:true}).click();
 const form=page.locator('.couponCreateForm');await form.getByLabel('Find product',{exact:true}).fill(title);
 await form.getByLabel(/Course \/ section/).selectOption(slug);
 await form.getByLabel('Discount (%)',{exact:true}).fill('25');
 await form.getByLabel('Expires at (your timezone)',{exact:true}).fill('2099-01-01T12:00');
 await form.getByRole('button',{name:'Create single-use code',exact:true}).click();
 const result=page.locator('.couponDetails');await expect(result).toBeVisible();const code=(await result.locator('code').textContent())!.trim();expect(code).toMatch(/^[A-Z0-9]{24}$/);
 await result.getByRole('button',{name:'Copy new code',exact:true}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(code);
 await page.getByLabel('Find coupon',{exact:true}).fill(code);
 const couponRow=page.getByRole('row').filter({has:page.locator('code').filter({hasText:code})});await expect(couponRow).toContainText('available');await expect(couponRow).toContainText(slug);
 await couponRow.getByRole('button',{name:'Revoke',exact:true}).click();await confirmSave(page);await expect(couponRow).toContainText('revoked');
 const api=await context.request.get('/api/admin/coupons?q='+code,{headers:headers('super_admin')});expect(api.ok()).toBe(true);const stored=(await api.json()).items[0];expect(stored.kind).toBe('course');expect(stored.productSlug).toBe(slug);expect(stored.percentOff).toBe(25);expect(stored.active).toBe(false);expect(stored.redeemedAt).toBeNull();
});

test('client admin corrects a saved student country with password confirmation and the student cannot change it',async({page,context,browser})=>{
 await signIn(context,identity.client,'client_admin');await page.goto('/admin?section=students');
 await expect(page.getByRole('button',{name:'Page sections',exact:true})).toHaveCount(0);
 await page.getByRole('searchbox',{name:'Search students',exact:true}).fill(identity.pk);
 const row=page.getByRole('row').filter({hasText:identity.pk});await expect(row).toContainText('Pakistan');await row.getByRole('button',{name:'Edit country',exact:true}).click();
 const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Correct student country',exact:true})});await dialog.getByRole('combobox',{name:'Country',exact:true}).selectOption('US');await dialog.getByLabel('Current admin password',{exact:true}).fill(PASSWORD);await dialog.getByRole('button',{name:'Save country correction',exact:true}).click();
 await expect(dialog).toBeHidden();await expect(row).toContainText('United States');
 const student=await browser.newContext({baseURL:origin});try{
  const user=await signIn(student,identity.pk,'student');expect(user.country).toBe('US');
  const denied=await student.request.patch('/api/academy-admin/students/'+user.id+'/country',{headers:headers('student'),data:{country:'PK',currentPassword:PASSWORD}});expect(denied.status()).toBe(403);
  const unchanged=await student.request.get('/api/auth/session',{headers:{'X-SA-Portal':'student'}});expect((await unchanged.json()).user.country).toBe('US');
 }finally{await student.close();}
});
