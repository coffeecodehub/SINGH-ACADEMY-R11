/** Full Next.js UI regression cases with controlled API fault injection.
 * Run with npm --prefix frontend run test:browser against the isolated test stack.
 * These do NOT validate live Hostinger, Stripe/PayPal or real SMTP delivery. */
import {test,expect,Page} from '@playwright/test';import {browserStudent} from './account-fixture';
async function mockApi(page:Page){
 const learner=await browserStudent(page);
 const state={sessionFailure:false,teamFailure:false,courseFailure:false,learnFailure:false};
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  let status=200,body:any={success:true};
  if(path==='/api/auth/session'){status=state.sessionFailure?503:200;body=state.sessionFailure?{success:false,message:'Temporary session service outage'}:{success:true,user:learner,enrollment:null};}
  else if(path==='/api/content/site')body={success:true,content:{}};
  else if(path==='/api/content/team'){status=state.teamFailure?503:200;body=state.teamFailure?{success:false,message:'Temporary team service outage'}:{success:true,team:[{_id:'faculty-one',name:'Faculty One',category:'faculty',role:'Faculty',bio:'Learning faculty'}]};}
  else if(path==='/api/courses/demo'){status=state.courseFailure?503:200;body=state.courseFailure?{success:false,message:'Temporary course service outage'}:{success:true,course:{_id:'course-one',slug:'demo',title:'Negotiation Skills',description:'Published course',instructor:'Academy Faculty'},modules:[]};}
  else if(path==='/api/courses/demo/learn'){status=state.learnFailure?503:200;body=state.learnFailure?{success:false,message:'Temporary learning service outage'}:{success:true,course:{slug:'demo',title:'Negotiation Skills'},modules:[],completedLessonIds:[],attempt:{number:1}};}
  else if(path==='/api/payments/membership-status')body={success:true,membershipActive:false,membershipEndsAt:null,courseAccesses:[],sectionAccesses:[]};
  else if(path==='/api/courses')body={success:true,courses:[]};
  else if(path==='/api/reviews')body={success:true,reviews:[]};
  else if(path==='/api/content/events')body={success:true,events:[]};
  else return route.fallback();
  await route.fulfill({status,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(body)});
 });
 return state;
}
test('team API failure is an explicit retry state, not a fake empty team',async({page})=>{
 const state=await mockApi(page);state.teamFailure=true;await page.goto('/team');
 await expect(page.getByText('Unable to load this content right now.')).toBeVisible();
 await expect(page.getByText('No team members in this category yet.')).toHaveCount(0);
 state.teamFailure=false;await page.getByRole('button',{name:'Retry',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Faculty One'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();
});
test('course API outage never pretends the published course is coming soon',async({page})=>{
 const state=await mockApi(page);state.courseFailure=true;await page.goto('/courses/demo');
 await expect(page.getByText('Unable to load this content right now.')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Course content coming soon'})).toHaveCount(0);
 state.courseFailure=false;await page.getByRole('button',{name:'Retry',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Negotiation Skills',exact:true})).toBeVisible();
 await expect(page).toHaveURL(/\/courses\/demo$/);
});
test('focus-time session outage retains signed-in header and public navigation',async({page})=>{
 const state=await mockApi(page);await page.goto('/team');
 await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();state.sessionFailure=true;
 await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+60000;window.dispatchEvent(new Event('focus'));});
 await expect(page.getByText(/Connection interrupted\. Reconnecting/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();
 await expect(page).toHaveURL(/\/team$/);
 state.sessionFailure=false;await page.getByRole('button',{name:'Retry connection',exact:true}).click();
 await expect(page.getByText(/Connection interrupted\. Reconnecting/)).toHaveCount(0);
});
test('learning API outage stays on the selected course with Retry, not a login redirect',async({page})=>{
 const state=await mockApi(page);state.learnFailure=true;await page.goto('/learn/demo');
 await expect(page.getByText('Unable to load this content right now.')).toBeVisible();
 await expect(page).toHaveURL(/\/learn\/demo$/);await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();
});
