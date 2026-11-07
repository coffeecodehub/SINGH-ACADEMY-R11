import {test,expect} from '@playwright/test';import {browserStudent} from './account-fixture';
for(const width of [320,390,768,1440])for(const route of ['/login','/admin/login','/super-admin/login','/register','/terms','/privacy']){
 test(`open authentication/legal page ${route} at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const failures:string[]=[];page.on('pageerror',e=>failures.push(e.message));
  const response=await page.goto(route,{waitUntil:'networkidle'});expect(response?.status()).toBe(200);await expect(page.locator('main').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(failures).toEqual([]);
  const csp=response?.headers()['content-security-policy']||'';expect(csp).toContain("'nonce-");expect(csp).toContain("frame-ancestors 'none'");
  if(route.endsWith('/login'))await expect(page.locator('input[type=password]')).toBeVisible();
 });
}
for(const route of ['/home','/about','/team','/courses','/contact','/billing'])test('anonymous direct route requires sign-in '+route,async({page})=>{await page.goto(route);await expect(page).toHaveURL(/\/login\?next=/);await expect(page.locator('input[type=password]')).toBeVisible();});
test('signed-in navigation does not advertise internal administrative portals',async({page})=>{await browserStudent(page);await page.goto('/');await expect(page.locator('header a[href="/super-admin/login"],header a[href="/admin/login"]')).toHaveCount(0);});
test('retired resource route returns 404 after authentication, not demo content',async({page})=>{await browserStudent(page);const response=await page.goto('/free-resources');expect(response?.status()).toBe(404);});
test('authenticated home retains responsive image sources without oversized implicit heights',async({page})=>{await browserStudent(page);await page.goto('/');const images=page.locator('img[src*="/optimized/"]');expect(await images.count()).toBeGreaterThan(0);const first=images.first();expect(await first.getAttribute('srcset')).toBeTruthy();await expect(first).toBeVisible();expect(await first.evaluate(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<2000;})).toBe(true);});

test('guest root is public while its full Team navigation still requires sign-in',async({page})=>{
 await page.setViewportSize({width:1440,height:900});const result=await page.goto('/');
 expect(result?.status()).toBe(200);await expect(page).toHaveURL('http://localhost:3000/');
 await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Team' }).click();
 await expect(page).toHaveURL(/\/login\?next=%2Fteam$/);
});
