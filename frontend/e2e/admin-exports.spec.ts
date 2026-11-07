/** Real admin workspaces/downloads; data may be empty but headers remain exportable. */
import {test,expect} from '@playwright/test';import {readFile} from 'node:fs/promises';
const origin='http://localhost:3000';
async function login(context:any,superAdmin=false){const response=await context.request.post(superAdmin?'/api/auth/super-admin/login':'/api/auth/admin/login',{headers:{Origin:origin,'X-SA-Portal':superAdmin?'super_admin':'client_admin','X-SA-CSRF':'1'},data:{email:superAdmin?'super-admin@browser-fixture.invalid':'client-export-admin@browser-fixture.invalid',password:'Browser-Only-Fixture-2026!'}});expect(response.ok(),await response.text()).toBe(true);}
for(const section of ['forms','purchases','subscriptions','reviews','certificates','notifications'])test(`Client Admin downloads every matching ${section} row from its own workspace`,async({page,context})=>{
 await login(context);await page.goto('/admin?section='+section);
 const button=page.getByRole('button',{name:'Export matching records (Excel CSV)',exact:true});await expect(button).toBeVisible();
 const responsePromise=page.waitForResponse(response=>response.url().includes('/api/admin/exports/'+section+'.csv'));
 const downloadPromise=page.waitForEvent('download');await button.click();const [response,download]=await Promise.all([responsePromise,downloadPromise]);expect(response.ok(),await response.text()).toBe(true);expect(await download.failure()).toBeNull();expect(download.suggestedFilename()).toMatch(new RegExp('^singh-academy-'+section+'-.*\\.csv$'));const bytes=await readFile((await download.path())!);expect([...bytes.subarray(0,3)]).toEqual([239,187,191]);expect(bytes.toString()).not.toContain('passwordHash');await expect(page.getByRole('status').filter({hasText:'Excel-compatible CSV downloaded.'})).toBeVisible();
});
test('Super Admin exports reviews without acquiring access to operational lead/finance exports',async({page,context})=>{
 await login(context,true);await page.goto('/super-admin?section=reviews');const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Export matching records (Excel CSV)',exact:true}).click();expect(await (await promise).failure()).toBeNull();const denied=await context.request.get('/api/admin/exports/forms.csv',{headers:{'X-SA-Portal':'super_admin'}});expect(denied.status()).toBe(403);
});
