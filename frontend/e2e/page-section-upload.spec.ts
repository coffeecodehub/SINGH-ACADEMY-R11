import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

test('super-admin uploads an original photograph through the real page editor and GridFS',async({page,context})=>{
 const login=await context.request.post('/api/auth/super-admin/login',{headers:{Origin:'http://localhost:3000','X-SA-CSRF':'1','X-SA-Portal':'super_admin'},data:{email:'super-admin@browser-fixture.invalid',password:'Browser-Only-Fixture-2026!'}});
 expect(login.ok(),await login.text()).toBe(true);
 const status=await context.request.get('/api/admin/page-sections/upload-status',{headers:{'X-SA-Portal':'super_admin'}});
 expect(status.ok()).toBe(true);const availability=(await status.json()).upload;
 expect(availability.configurationReady).toBe(true);expect(availability.developmentWithoutScanner).toBe(true);
 await page.goto('/super-admin?section=page_sections');
 await page.getByRole('button',{name:'＋ Add section',exact:true}).click();
 const file=path.resolve('public/images/global-learning/brazil-3.jpg'),original=await readFile(file);
 const upload=page.waitForResponse(r=>r.url().endsWith('/api/admin/page-sections/upload')&&r.request().method()==='POST');
 await page.getByLabel('Upload original image',{exact:true}).setInputFiles(file);
 const response=await upload;expect(response.status(),await response.text()).toBe(201);
 const saved=await response.json();expect(saved.originalPixelsPreserved).toBe(true);expect(saved.size).toBe(original.length);
 await expect(page.getByLabel('Image URL',{exact:true})).toHaveValue(saved.url);
 await page.getByText('Preview this section',{exact:true}).click();
 const preview=page.locator('.pageSectionMedia img');await preview.scrollIntoViewIfNeeded();
 await expect.poll(()=>preview.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
 const previewUrl=await preview.getAttribute('src');expect(previewUrl).toContain('portal=super_admin');
 const publishedMedia=await context.request.get(previewUrl!);
 expect(publishedMedia.ok(),'Owner preview HTTP '+publishedMedia.status()).toBe(true);expect(createHash('sha256').update(await publishedMedia.body()).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));
 await page.getByRole('button',{name:'Save page sections',exact:true}).first().click();
 await expect(page.getByText('Page sections saved. Only published sections appear on the page.',{exact:true})).toBeVisible();
});
