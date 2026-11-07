/** Actual Express/Mongo and admin UI. Reuses test-only seeded .invalid accounts. */
import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const origin='http://localhost:3000',password='Browser-Only-Fixture-2026!';
type Portal='client_admin'|'super_admin'|'student';
const identity={client_admin:'client-admin@browser-fixture.invalid',super_admin:'super-admin@browser-fixture.invalid',student:'us-student@browser-fixture.invalid'};
async function login(context:BrowserContext,portal:Portal){const endpoint=portal==='client_admin'?'/api/auth/admin/login':portal==='super_admin'?'/api/auth/super-admin/login':'/api/auth/login';const response=await context.request.post(endpoint,{headers:{Origin:origin,'X-SA-Portal':portal,'X-SA-CSRF':'1'},data:{email:identity[portal],password}});expect(response.ok(),await response.text()).toBe(true);}
async function save(page:Page){await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm & save',exact:true}).click();}

test('client admin publishes and edits a Zoom webinar through Events and students see the actual joining details',async({page,context,browser})=>{
 const suffix=randomUUID().slice(0,8),title='Browser webinar '+suffix,slug='browser-webinar-'+suffix,url='https://us02web.zoom.us/j/12345678901?pwd=synthetic-fixture';
 await login(context,'client_admin');await page.goto('/admin?section=events');await page.getByRole('button',{name:'＋ Add event',exact:true}).click();
 await page.getByLabel('Event title',{exact:true}).fill(title);await page.getByLabel('URL slug (leave blank to generate)',{exact:true}).fill(slug);await page.getByRole('combobox',{name:'Session type',exact:true}).selectOption('webinar');await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('published');await page.getByLabel('Date & time (your browser timezone)',{exact:true}).fill('2027-01-15T14:30');await page.getByRole('textbox',{name:'Webinar details',exact:true}).fill('An administrator-authored agenda and professional discussion.');
 await save(page);await expect(page.locator('.errorNotice[role="alert"]:visible')).toContainText('valid HTTPS Zoom');
 await page.getByLabel('Zoom joining link',{exact:true}).fill(url);await save(page);
 await page.getByRole('textbox',{name:'Search Events',exact:true}).fill(title);const row=page.getByRole('row').filter({hasText:title});await expect(row).toBeVisible();await expect(row).toContainText('Webinar');await row.getByRole('button',{name:'Edit',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Session type',exact:true})).toHaveValue('webinar');await expect(page.getByLabel('Zoom joining link',{exact:true})).toHaveValue(url);
 const details=page.getByRole('textbox',{name:'Webinar details',exact:true});await expect(details).toHaveValue('An administrator-authored agenda and professional discussion.');await details.fill('Updated agenda with a question and answer session.');await save(page);await expect(row).toBeVisible();
 const student=await browser.newContext({baseURL:origin});try{await login(student,'student');const response=await student.request.get('/api/content/events');expect(response.ok()).toBe(true);const item=(await response.json()).events.find((event:any)=>event.slug===slug);expect(item.type).toBe('webinar');expect(item.zoomUrl).toBe(url);expect(item.description).toBe('Updated agenda with a question and answer session.');const view=await student.newPage();await view.goto('/events');const card=view.getByRole('article').filter({has:view.getByRole('heading',{name:title,exact:true})});await expect(card).toContainText(item.description);await expect(card.getByRole('link',{name:'Join webinar on Zoom',exact:true})).toHaveAttribute('href',url);}finally{await student.close();}
});

for(const portal of ['client_admin','super_admin'] as const)test(`${portal} downloads the complete Excel-compatible student CSV from the Students UI`,async({page,context})=>{
 await login(context,portal);await page.goto((portal==='super_admin'?'/super-admin':'/admin')+'?section=students');await expect(page.getByRole('heading',{name:'Students',exact:true})).toBeVisible();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export all students CSV',exact:true}).click();const download=await downloadPromise;expect(await download.failure()).toBeNull();expect(download.suggestedFilename()).toMatch(/^singh-academy-students-\d{4}-\d{2}-\d{2}\.csv$/);const file=await download.path();expect(file).not.toBeNull();const bytes=await readFile(file!);expect([...bytes.subarray(0,3)]).toEqual([239,187,191]);const csv=bytes.toString('utf8');expect(csv.split('\r\n')[0]).toBe('\uFEFF"Name","Email","Phone","Country","Registration date (UTC)","Status"');expect(csv).toContain('us-student@browser-fixture.invalid');expect(csv).not.toContain('client-admin@browser-fixture.invalid');expect(csv).not.toContain('super-admin@browser-fixture.invalid');await expect(page.getByRole('status').filter({hasText:'Student CSV downloaded.'})).toBeVisible();
});
