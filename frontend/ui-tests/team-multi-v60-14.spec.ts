/** Real Next browser UI; all media/data responses below are controlled fixtures. */
import {test,expect} from '@playwright/test';
import {CATALOG_PHOTO_PATH,catalogPhotoResponse} from './helpers/catalog-photo-fixture.mjs';
import {TEAM_MARQUEE_SIZES} from '../lib/imageSources';
const origin='http://127.0.0.1:3108';
test('marquee requests offscreen member photos before hover and preserves public preview',async({page,context})=>{
 const members=Array.from({length:12},(_,i)=>({_id:(i+500).toString(16).padStart(24,'0'),name:'Marquee Member '+i,role:'Faculty',category:'faculty',bio:'Public biography',image:'/api/media/'+(i+500).toString(16).padStart(24,'0')}));
 const requested=new Set<string>();
 await context.route('**/api/content/landing',route=>route.fulfill({json:{success:true,team:members,sections:[],courses:[],reviews:[]}}));
 await context.route('**/api/media/**',route=>{const address=new URL(route.request().url());requested.add(address.pathname);address.pathname=CATALOG_PHOTO_PATH;return route.fulfill(catalogPhotoResponse(address.href));});
 await page.setViewportSize({width:1440,height:900});await page.mouse.move(0,0);
 await page.goto('/');const images=page.locator('.teamTrackLeft img, .teamTrackRight img');
 await expect(images).not.toHaveCount(0);
 await expect.poll(()=>requested.size).toBe(12);
 const source=await images.evaluateAll(nodes=>nodes.map(n=>({load:n.getAttribute('loading'),sizes:n.getAttribute('sizes'),left:n.getBoundingClientRect().left})));
 expect(source.every(x=>x.load==='eager'&&x.sizes===TEAM_MARQUEE_SIZES)).toBe(true);
 expect(source.some(x=>x.left<0||x.left>1440)).toBe(true);
 await expect(page).toHaveURL(origin+'/');
});
test('multi-category public team tabs show the same member once without duplicating All',async({page,context})=>{
 const login=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});
 expect(login.ok()).toBe(true);
 await context.route('**/api/content/team',route=>route.fulfill({json:{success:true,team:[
  {_id:'f'.repeat(24),name:'Four Categories',category:'founder',categories:['founder','faculty','board','core'],role:'Teacher'},
  {_id:'a'.repeat(24),name:'Legacy Faculty',category:'faculty',role:'Teacher'}
 ]}}));
 await page.goto('/team');await expect(page.locator('.teamStatic article')).toHaveCount(2);
 for(const label of ['The Founder','Faculty','Board of Advisors','Core Team']){
  await page.getByRole('button',{name:label,exact:true}).click();
  await expect(page.getByRole('heading',{name:'Four Categories',exact:true})).toHaveCount(1);
  await expect(page.locator('.teamStatic article')).toHaveCount(label==='Faculty'?2:1);
 }
 await page.getByRole('button',{name:'All',exact:true}).click();await expect(page.locator('.teamStatic article')).toHaveCount(2);
});
