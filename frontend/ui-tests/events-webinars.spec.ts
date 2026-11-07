import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:3108';
for(const width of [1440,390])test(`Events distinguishes Zoom webinars and keeps joining actions safe at ${width}px`,async({page,context})=>{
 const login=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});expect(login.ok()).toBe(true);
 await context.route('**/api/content/events',route=>route.fulfill({json:{success:true,events:[
  {_id:'a'.repeat(24),slug:'professional-webinar',title:'Professional Zoom webinar',type:'webinar',date:'2027-01-15T14:30:00.000Z',description:'A professional agenda, discussion and questions.',zoomUrl:'https://us02web.zoom.us/j/12345678901?pwd=synthetic-fixture',image:'/images/events/academy-workshop.jpg'},
  {_id:'b'.repeat(24),slug:'academy-workshop',title:'Academy workshop',type:'event',date:'2027-02-15T10:00:00.000Z',description:'An in-person learning session.',location:'Academy venue',mapUrl:'https://maps.google.com/?q=academy'},
  {_id:'c'.repeat(24),slug:'past-webinar',title:'Past webinar',type:'webinar',date:'2025-01-15T14:30:00.000Z',description:'An earlier session.',zoomUrl:'https://zoom.us/j/123'},
  {_id:'d'.repeat(24),slug:'legacy-link',title:'Joining details pending',type:'webinar',description:'A legacy invalid invitation must not be opened.',zoomUrl:'https://zoom.us.evil.invalid/j/123'}
 ]}}));
 await page.setViewportSize({width,height:1000});await page.goto('/events');
 const webinar=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Professional Zoom webinar',exact:true})});
 await expect(webinar).toContainText('WEBINAR · LIVE ON ZOOM');await expect(webinar).toContainText('Online · Zoom');await expect(webinar).toContainText('A professional agenda, discussion and questions.');
 const join=webinar.getByRole('link',{name:'Join webinar on Zoom',exact:true});await expect(join).toHaveAttribute('href','https://us02web.zoom.us/j/12345678901?pwd=synthetic-fixture');await expect(join).toHaveAttribute('target','_blank');await expect(join).toHaveAttribute('rel','noopener noreferrer');
 await expect(webinar.locator('time')).toHaveAttribute('datetime','2027-01-15T14:30:00.000Z');
 const workshop=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Academy workshop',exact:true})});await expect(workshop).toContainText('Academy venue');await expect(workshop.getByRole('link',{name:'View location ↗',exact:true})).toHaveAttribute('href','https://maps.google.com/?q=academy');
 const past=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Past webinar',exact:true})});await expect(past).toContainText('PAST WEBINAR');await expect(past.getByRole('link',{name:'Join webinar on Zoom'})).toHaveCount(0);
 const pending=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Joining details pending',exact:true})});await expect(pending).toContainText('Joining details will be announced.');await expect(pending.locator('a')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
