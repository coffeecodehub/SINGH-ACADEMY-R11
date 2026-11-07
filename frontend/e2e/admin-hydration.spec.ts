/** Extension-free Chromium verifies app hydration without hiding console errors. */
import {test,expect} from '@playwright/test';
for(const portal of ['client_admin','super_admin'] as const)test(portal+' panel hydrates without DOM attributes injected by extensions',async({page,context,baseURL})=>{
 const route=portal==='super_admin'?'/api/auth/super-admin/login':'/api/auth/admin/login',path=portal==='super_admin'?'/super-admin':'/admin';
 const login=await context.request.post(route,{headers:{Origin:baseURL!,'X-SA-CSRF':'1','X-SA-Portal':portal},data:{email:portal==='super_admin'?'super-admin@browser-fixture.invalid':'client-admin@browser-fixture.invalid',password:'Browser-Only-Fixture-2026!'}});expect(login.ok()).toBe(true);
 const hydration:string[]=[],errors:string[]=[];page.on('console',m=>{if(/hydrat|didn't match|server rendered HTML/i.test(m.text()))hydration.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(path+'?section=security');expect(response?.status()).toBe(200);await expect(page.getByRole('heading',{name:'Change password',exact:true})).toBeVisible();
 await expect(page.locator('html')).not.toHaveAttribute('data-sqmjguha');await page.getByRole('button',{name:'Academy overview',exact:true}).click();await expect(page.getByRole('heading',{name:/Welcome back,/})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:/Welcome back,/})).toBeVisible();expect(hydration).toEqual([]);expect(errors).toEqual([]);
});
