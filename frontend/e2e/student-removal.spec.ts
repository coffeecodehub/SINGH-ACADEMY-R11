/** Dedicated synthetic account, separate from every other browser fixture. */
import {test,expect} from '@playwright/test';
const password='Browser-Only-Fixture-2026!',email='removal-student@browser-fixture.invalid';
test('Super Admin confirms removal and the old student session cannot reopen protected content',async({page,context,browser,baseURL})=>{
 const student=await browser.newContext({baseURL});try{
  const login=await student.request.post('/api/auth/login',{headers:{Origin:baseURL!,'X-SA-CSRF':'1','X-SA-Portal':'student'},data:{email,password}});expect(login.ok(),await login.text()).toBe(true);
  const admin=await context.request.post('/api/auth/super-admin/login',{headers:{Origin:baseURL!,'X-SA-CSRF':'1','X-SA-Portal':'super_admin'},data:{email:'super-admin@browser-fixture.invalid',password}});expect(admin.ok(),await admin.text()).toBe(true);
  await page.goto('/super-admin?section=students');await page.getByRole('searchbox',{name:'Search students',exact:true}).fill(email);
  const row=page.getByRole('row').filter({hasText:email});await expect(row).toBeVisible();await row.getByRole('button',{name:'Remove student',exact:true}).click();
  const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Remove student account',exact:true})});await expect(dialog).toBeVisible();
  await dialog.getByLabel('Type student email to confirm',{exact:true}).fill('another@browser-fixture.invalid');await dialog.getByLabel('Reason for removal',{exact:true}).fill('Repeated abusive conduct in the dedicated browser fixture');await dialog.getByLabel('Current admin password',{exact:true}).fill(password);
  await expect(dialog.getByRole('button',{name:'Confirm account removal',exact:true})).toBeDisabled();
  await dialog.getByLabel('Type student email to confirm',{exact:true}).fill(email);await dialog.getByRole('button',{name:'Confirm account removal',exact:true}).click();await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({hasText:'Student account removed.'})).toBeVisible();await expect(row).toHaveCount(0);
  const session=await student.request.get('/api/auth/session',{headers:{'X-SA-Portal':'student'}});expect((await session.json()).user).toBeNull();
  const denied=await student.request.post('/api/auth/login',{headers:{Origin:baseURL!,'X-SA-CSRF':'1','X-SA-Portal':'student'},data:{email,password}});expect(denied.status()).toBe(401);
  const oldPage=await student.newPage();await oldPage.goto('/home');await expect(oldPage).toHaveURL(/\/login\?next=/);
 }finally{await student.close();}
});
