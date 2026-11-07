/** Actual Next/browser with controlled account catalog DTOs. No provider calls. */
import {test,expect,type BrowserContext} from '@playwright/test';
const origin='http://127.0.0.1:3108',lessonId='dddddddddddddddddddddddd';
const learner={id:'111111111111111111111111',role:'student',name:'Catalog Learner',country:'PK',email:'learner@example.invalid'};
const section={slug:'mediation',title:'Mediation Section',description:'A complete mediation learning path.',currency:'USD',pricing:[{key:'five',label:'Five months',price:27,durationMonths:5}]};
const included={slug:'section-course',title:'Section Course',sectionSlug:'mediation',accessType:'one_time',currency:'USD',pricing:[{key:'two',price:7,durationMonths:2}]};
const standalone={slug:'standalone',title:'Standalone Course',accessType:'one_time',currency:'USD',price:15,accessMonths:1};
async function setup(context:BrowserContext){
 const login=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});expect(login.ok()).toBe(true);
 const state={saves:0,logouts:0};
 await context.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;let body:any={success:true};
  if(path==='/api/auth/session')body={success:true,user:learner};
  else if(path==='/api/auth/logout'){state.logouts++;body={success:true,signedOut:true};}
  else if(path==='/api/content/site')body={success:true,content:{websiteContent:{},membershipPlans:[{name:'Legacy six-month Academy membership',price:199,durationMonths:6},{name:'Legacy annual Academy membership',price:299,durationMonths:12}]}};
  else if(path==='/api/content/team')body={success:true,team:[]};
  else if(path==='/api/content/events')body={success:true,events:[]};
  else if(path==='/api/sections')body={success:true,sections:[section]};
  else if(path==='/api/sections/mediation')body={success:true,section,courses:[included],access:null};
  else if(path==='/api/courses')body={success:true,courses:[included,standalone]};
  else if(path==='/api/courses/enrolled/mine')body={success:true,courses:[]};
  else if(path==='/api/payments/membership-status')body={success:true,membershipActive:false,courseAccesses:[],sectionAccesses:[]};
  else if(path==='/api/courses/guard-demo/learn')body={success:true,course:{slug:'guard-demo',title:'Answer Guard Course'},modules:[{title:'Module One',lessons:[{_id:lessonId,title:'Reflection Lesson',type:'reflection',questions:[{prompt:'Your reflection',kind:'long-text'}]}]}],attempt:{number:1},completedLessonIds:[]};
  else if(path===`/api/courses/guard-demo/lessons/${lessonId}/submission`){
   const saved=request.method()==='PUT';if(saved)state.saves++;
   body={success:true,answers:saved?request.postDataJSON().answers:{},attempt:{number:1,status:'in_progress'},assessment:{version:1,fields:[{key:lessonId+'-0',kind:'long-text'}]},revision:saved?2:1,savedAt:saved?'2026-11-01T12:00:00Z':undefined};
  }
  await route.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'private, no-store'},body:JSON.stringify(body)});
 });
 return state;
}
test('Academy Plans discovers a section and its regional total-duration offers',async({context,page})=>{
 await setup(context);await page.goto('/academy');
 await expect(page.getByRole('heading',{name:'Academy Plans',exact:true})).toBeVisible();
 const navigation=page.getByRole('navigation',{name:'Main navigation'});await expect(navigation.getByRole('link',{name:'Academy Plans',exact:true})).toHaveCount(1);await expect(navigation.getByRole('link',{name:'Courses',exact:true})).toHaveCount(0);await expect(navigation.getByRole('link',{name:'Sections',exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:/Legacy .* Academy membership/})).toHaveCount(0);await expect(page.locator('a[href^="/checkout?plan="]')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Mediation Section',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Standalone Course',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Section Course',exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Explore Section →',exact:true}).click();await expect(page).toHaveURL(/\/sections\/mediation$/);
 const purchase=page.getByRole('complementary',{name:'Buy entire section'});await expect(purchase.getByText('$27',{exact:true})).toBeVisible();
 await expect(purchase.getByRole('link',{name:'Choose 5 months',exact:true})).toHaveAttribute('href','/checkout?section=mediation&option=five');
 await expect(page.getByRole('heading',{name:'Section Course',exact:true})).toBeVisible();await expect(page.getByText('$7',{exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Breadcrumb'}).getByRole('link',{name:'Academy Plans',exact:true})).toHaveAttribute('href','/academy');
 await expect(page.getByRole('link',{name:'View Course →',exact:true})).toHaveAttribute('href','/courses/section-course');
});
test('legacy course and section listing URLs keep the Academy catalog available',async({context,page})=>{
 await setup(context);
 for(const path of ['/courses','/sections']){await page.goto(path);await expect(page.getByRole('heading',{name:'Academy Plans',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Mediation Section',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Standalone Course',exact:true})).toBeVisible();}
});
test('unsaved lesson answers block Back, header navigation and logout until saved or discarded',async({context,page})=>{
 const state=await setup(context);await page.goto('/my-course');await page.goto('/learn/guard-demo');
 const answer=page.getByPlaceholder('Write your response…');await expect(answer).toBeEnabled();await answer.fill('Keep this unsaved reflection.');
 let nativeDialogs=0;page.on('dialog',async dialog=>{nativeDialogs++;await dialog.dismiss();});
 const decision=page.getByRole('dialog',{name:'Leave with unsaved answers?'});
 await page.getByRole('button',{name:'← Back to My Courses',exact:true}).click();await expect(decision).toBeVisible();await expect(decision.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');await expect(decision.getByRole('button',{name:'Discard and leave',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(decision.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(decision).toBeHidden();
 await expect(page).toHaveURL(/\/learn\/guard-demo$/);await expect(answer).toHaveValue('Keep this unsaved reflection.');
 const navigation=page.getByRole('navigation',{name:'Main navigation'});await navigation.getByRole('link',{name:'Academy Plans',exact:true}).click();await expect(decision).toBeVisible();await decision.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page).toHaveURL(/\/learn\/guard-demo$/);
 await page.getByRole('button',{name:'Logout',exact:true}).click();await expect(decision).toBeVisible();await decision.getByRole('button',{name:'Cancel',exact:true}).click();expect(state.logouts).toBe(0);expect(nativeDialogs).toBe(0);
 await page.getByRole('button',{name:'Save answers',exact:true}).click();await expect(page.getByText('Your answers have been saved.',{exact:true})).toBeVisible();expect(state.saves).toBe(1);
 await navigation.getByRole('link',{name:'Academy Plans',exact:true}).click();await expect(page).toHaveURL(/\/academy$/);expect(nativeDialogs).toBe(0);
});
