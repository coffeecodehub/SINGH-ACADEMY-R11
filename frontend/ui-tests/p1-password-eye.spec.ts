/** Actual Next/React acceptance. Requires the existing isolated UI fixture stack.
 * All values are synthetic; no production database/provider is used. */
import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:3108';
test.beforeEach(async({context})=>{await context.route('**/*',route=>{const u=new URL(route.request().url());return ['http:','https:'].includes(u.protocol)&&u.origin!==origin?route.abort():route.continue();});});
for(const width of [390,820,1440])for(const [route,count]of [['/login',1],['/register',2],['/admin/login',1],['/super-admin/login',1],['/reset-password',2]] as const){
 test(`P1 eye controls ${route} at ${width}px`,async({page})=>{
  const errors:string[]=[];let writes=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/hydration|didn't match|server rendered/i.test(m.text()))errors.push(m.text());});
  page.on('request',r=>{if(r.method()==='POST')writes++;});
  await page.setViewportSize({width,height:940});await page.goto(route);
  const fields=page.locator('.authCard input[name="password"],.authCard input[name="confirmPassword"],.authCard input[name="confirm"]');
  await expect(fields).toHaveCount(count);await expect(page.locator('.authCard input[name="password"] ~ button')).toHaveCount(1);
  for(let i=0;i<count;i++){
   const input=fields.nth(i),container=input.locator('..'),button=container.locator('button');
   await input.fill('SyntheticPassword123!');await expect(input).toHaveAttribute('type','password');
   await expect(button).toHaveAttribute('type','button');await expect(button).toHaveAttribute('aria-label','Show password');
   await expect(button.locator('svg')).toBeVisible();await expect(button.locator('span')).toHaveCount(0);await expect(button).toHaveCSS('border-top-width','0px');await expect(button).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
   // The country field makes registration scrollable; compare stable geometry after both controls are fully in view.
   await input.scrollIntoViewIfNeeded();await button.scrollIntoViewIfNeeded();const before=await input.boundingBox();await button.click();
   await expect(input).toHaveAttribute('type','text');await expect(input).toHaveValue('SyntheticPassword123!');
   await expect(button).toHaveAttribute('aria-pressed','true');
   // Keyboard interaction with the native button must also hide the password.
   await button.focus();await page.keyboard.press('Space');await expect(input).toHaveAttribute('type','password');
   await expect(button).toHaveAttribute('aria-label','Show password');
   expect(await input.boundingBox()).toEqual(before);
   // Visibility is local to this field, not shared with the confirmation.
   for(let j=0;j<count;j++)await expect(fields.nth(j)).toHaveAttribute('type','password');
  }
  expect(writes).toBe(0);expect(errors).toEqual([]);
 });
}
test('P1 email-only forgot-password and OTP pages have no added password eye',async({page})=>{for(const route of ['/forgot-password','/verify-otp']){await page.goto(route);await expect(page.locator('input[type="password"]')).toHaveCount(0);}});
