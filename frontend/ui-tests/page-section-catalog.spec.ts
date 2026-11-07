/** Real Next pages with controlled catalog DTOs; no payment/provider traffic. */
import {test,expect,type BrowserContext} from '@playwright/test';
const origin='http://127.0.0.1:3108';
const section={_id:'777777777777777777777777',slug:'published-mediation',title:'Published Mediation Section',shortDescription:'A focused section of practical learning.',thumbnail:'/images/courses/course-placeholder.jpg',currency:'USD',pricing:[{key:'five',price:27,durationMonths:5}]};
const pages=[{path:'/',selector:'#courses'},{path:'/home',selector:'#course-store'},{path:'/about',selector:'#about-sections'}];
async function setup(context:BrowserContext,publicPage:boolean){
 if(!publicPage){const response=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});expect(response.ok()).toBe(true);}
 const state={mode:'published' as 'published'|'empty'|'error'};
 const reply=()=>({success:true,sections:state.mode==='published'?[section]:[],courses:[{slug:'old-course',title:'Old standalone sale must not render'}],team:[],reviews:[]});
 await context.route('**/api/content/landing',route=>route.fulfill({status:state.mode==='error'?503:200,json:state.mode==='error'?{success:false,message:'Published sections temporarily unavailable'}:reply()}));
 await context.route('**/api/sections',route=>route.fulfill({status:state.mode==='error'?503:200,json:state.mode==='error'?{success:false,message:'Published sections temporarily unavailable'}:reply()}));
 await context.route('**/api/payments/membership-status',route=>route.fulfill({json:{success:true,membershipActive:false,courseAccesses:[],sectionAccesses:[]}}));
 await context.route('**/api/content/site',route=>route.fulfill({json:{success:true,content:{websiteContent:{text:{'landing-006':'Discover Full Academy Access','landing-123':'Complete Access','landing-125':'View membership →'},images:[]}}}}));
 return state;
}
for(const {path,selector} of pages){
 test(path+' shows published section cards in its existing layout',async({page,context})=>{
  await setup(context,path==='/');await page.goto(path);const catalog=page.locator(selector);
  await expect(catalog.getByRole('heading',{name:section.title,exact:true})).toBeVisible();await expect(catalog.locator('[data-product-kind="section"]')).toHaveCount(1);await expect(catalog.locator('[data-product-kind="course"]')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Old standalone sale must not render',exact:true})).toHaveCount(0);
  await expect(catalog.getByRole('link',{name:/^Explore section →$/i})).toHaveAttribute('href','/sections/published-mediation');
  await expect(page.getByRole('link',{name:/View membership|Discover Full Academy Access/})).toHaveCount(0);
  if(path==='/'){await expect(catalog.locator('.card.courseLiveCard')).toHaveCount(1);await expect(page.locator('#pricing .priceCards article')).toHaveCount(1);}
  else{await expect(catalog.locator('.courseVisualCard .courseCardBody .courseMeta')).toHaveCount(1);await expect(catalog.getByText('$27',{exact:true})).toBeVisible();await expect(catalog.getByText('5 months access',{exact:true})).toBeVisible();}
 });
 test(path+' keeps empty and failed section responses honest',async({page,context})=>{
  const state=await setup(context,path==='/');state.mode='empty';await page.goto(path);const catalog=page.locator(selector);
  await expect(catalog.getByText(/No (published )?sections/)).toBeVisible();await expect(catalog.locator('[data-product-kind]')).toHaveCount(0);
  // Browser interception changes the refresh, while anonymous SSR still reads
  // the local fixture API. A confirmed SSR snapshot survives a failed refresh.
  const serverSnapshot=path==='/'?(await(await context.request.get(origin+'/api/content/landing')).json()).sections:[];
  state.mode='error';await page.reload();await expect(catalog.getByRole('alert').filter({hasText:'Published sections temporarily unavailable'})).toBeVisible();await expect(catalog.getByText(/No (published )?sections/)).toHaveCount(0);await expect(catalog.locator('[data-product-kind]')).toHaveCount(serverSnapshot.length);
  for(const item of serverSnapshot)await expect(catalog.getByRole('heading',{name:item.title,exact:true})).toBeVisible();
 });
}
