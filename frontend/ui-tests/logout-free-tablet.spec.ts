/** Real Next.js UI with controlled API responses. Separate from real DB/provider acceptance. */
import {test,expect,BrowserContext} from '@playwright/test';
import {waitForSignedOutPage} from './helpers/signed-out-page';
const learner={id:'111111111111111111111111',role:'student',name:'Jinjua Test',email:'learner@example.invalid',emailVerified:true};
async function api(context:BrowserContext){
 const signedIn=await context.request.post('http://127.0.0.1:3108/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});
 expect(signedIn.ok()).toBe(true);
 const state={loggedIn:true,calls:[] as string[],logoutCalls:0,certIssued:false};
 await context.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;state.calls.push(`${request.method()} ${path}`);
  let body:any={success:true};
  if(path==='/api/auth/logout'){state.logoutCalls++;body={success:true,signedOut:true,portal:'student'};}
  // Deliberately keep returning the old session after logout: the browser logout fence must ignore it.
  else if(path==='/api/auth/session')body={success:true,user:state.loggedIn?learner:null,enrollment:null};
  else if(path==='/api/auth/login'){state.loggedIn=true;body={success:true,user:learner};}
  else if(path==='/api/content/site')body={success:true,content:{}};
  else if(path==='/api/content/team')body={success:true,team:[]};
  else if(path==='/api/content/events')body={success:true,events:[]};
  else if(path==='/api/reviews')body={success:true,reviews:[]};
  else if(path==='/api/courses/enrolled/mine')body={success:true,courses:[{_id:'222222222222222222222222',slug:'free-demo',title:'Free Learning Test',progress:100,completion:{_id:'cccccccccccccccccccccccc',courseSlug:'free-demo',courseTitle:'Free Learning Test',status:'pending',completedAt:'2026-10-01T12:00:00Z'}}]};
  else if(path==='/api/certificates/status')body={success:true,items:[{_id:'cccccccccccccccccccccccc',courseSlug:'free-demo',courseTitle:'Free Learning Test',status:state.certIssued?'issued':'pending',certificateNumber:state.certIssued?'SA-UI-FIXTURE':undefined}]};
  else if(path==='/api/courses')body={success:true,courses:[]};
  else if(path==='/api/payments/membership-status')body={success:true,membershipActive:false,membershipEndsAt:null,courseAccesses:[],sectionAccesses:[]};
  else if(path==='/api/courses/free-demo')body={success:true,course:{_id:'222222222222222222222222',slug:'free-demo',title:'Free Learning Test',accessType:'free',description:'A free published course.',instructor:'Academy Faculty'},modules:[]};
  else if(path==='/api/courses/free-demo/enroll')body={success:true,enrollment:{courseSlug:'free-demo',user:learner.id}};
  else if(path==='/api/courses/free-demo/learn')body={success:true,course:{slug:'free-demo',title:'Free Learning Test',accessType:'free'},modules:[],completedLessonIds:[],attempt:{number:1}};
  else if(path==='/api/payments/catalog')body={success:true,purchase:{kind:'course',product:'free-demo',title:'Free Learning Test',free:true,options:[]}};
  else if(path==='/api/payments/methods')body={success:true,methods:{enabled:true,stripe:{ready:true},paypal:{ready:true}}};
  else body={success:false,message:'Unmocked test endpoint: '+path};
  await route.fulfill({status:body.success?200:404,contentType:'application/json',headers:{'Cache-Control':'private, no-store'},body:JSON.stringify(body)});
 });
 return state;
}
test('explicit logout remains logged out after Back and Refresh until credentials are submitted',async({context,page})=>{
 const state=await api(context);await page.goto('/team');await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();
 await page.goto('/courses/free-demo');
 await waitForSignedOutPage(page,{expectedPath:'/',navigate:()=>page.getByRole('button',{name:'Logout',exact:true}).click()});
 await expect(page).toHaveURL('http://127.0.0.1:3108/');
 // Back can schedule a logout-fence document redirect. Wait for the guest
 // document before the user's next Refresh instead of aborting that redirect.
 await waitForSignedOutPage(page,{navigate:()=>page.goBack({waitUntil:'domcontentloaded'})});
 await waitForSignedOutPage(page,{navigate:()=>page.reload()});
 await page.goto('/login');await expect(page.getByLabel('Email',{exact:true})).toBeVisible();expect(state.logoutCalls).toBe(1);
 await page.getByLabel('Email',{exact:true}).fill('learner@example.invalid');await page.locator('input[name=password]').fill('TestPassword123!');await page.getByRole('button',{name:'Sign in →',exact:true}).click();
 await expect(page).toHaveURL(/\/home$/);await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();
});
test('a separately opened tab observes logout without refreshing repeatedly',async({context,page})=>{
 await api(context);await page.goto('/team');const second=await context.newPage();await second.goto('/team');
 await expect(second.getByRole('button',{name:'Logout',exact:true})).toBeVisible();
 await waitForSignedOutPage(second,{expectedPath:'/',navigate:()=>page.getByRole('button',{name:'Logout',exact:true}).click()});
 await expect(second).toHaveURL('http://127.0.0.1:3108/');
 await waitForSignedOutPage(second,{expectedPath:'/',navigate:()=>second.reload()});
});
test('an unexpired session remains signed in when no logout has been requested',async({context,page})=>{
 await api(context);await page.goto('/team');await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();
});
test('free course Start enrolls directly without a purchase request',async({context,page})=>{
 const state=await api(context);await page.goto('/courses/free-demo');await expect(page.getByRole('button',{name:'Start Course →',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Purchase/})).toHaveCount(0);await page.getByRole('button',{name:'Start Course →',exact:true}).click();await expect(page).toHaveURL(/\/learn\/free-demo$/);
 expect(state.calls.filter(x=>x==='POST /api/courses/free-demo/enroll')).toHaveLength(1);expect(state.calls.some(x=>/payments\/(checkout|access)/.test(x))).toBe(false);
});
test('manually visiting checkout for a free course does not show payment-provider buttons',async({context,page})=>{
 await api(context);await page.goto('/checkout?course=free-demo');await expect(page.getByRole('link',{name:/Start Course/})).toBeVisible();await expect(page.locator('button.paymentMethod')).toHaveCount(0);
});
for(const width of [375,768,901,1024,1228,1366,1440])test(`header fits ${width}px without overlap and compact menu can open`,async({context,page})=>{
 await api(context);await page.setViewportSize({width,height:900});await page.goto('/team');await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(width<=900){const toggle=page.getByRole('button',{name:'Toggle navigation'});await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'My Billing',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(toggle).toHaveAttribute('aria-expanded','false');}
});

test('newly issued certificate appears on the already open My Courses page',async({context,page})=>{
 const state=await api(context);let documents=0;
 // framenavigated also fires for history.replaceState: count DOCUMENT requests,
 // and keep an in-memory marker to prove that certificate polling never reloads.
 page.on('request',request=>{if(request.isNavigationRequest()&&request.resourceType()==='document'&&request.frame()===page.mainFrame())documents++;});
 await page.goto('/my-course');await expect(page.getByText('Waiting for certificate',{exact:true})).toBeVisible();
 const timeOrigin=await page.evaluate(()=>{(window as any).__certificateDocumentMarker='same-document';return performance.timeOrigin;});
 state.certIssued=true;
 await expect(page.getByRole('button',{name:'Download certificate (PDF)',exact:true})).toBeVisible({timeout:10000});
 expect(documents).toBe(1);expect(await page.evaluate(()=>performance.timeOrigin)).toBe(timeOrigin);
 expect(await page.evaluate(()=>(window as any).__certificateDocumentMarker)).toBe('same-document');
 await expect(page).toHaveURL('http://127.0.0.1:3108/my-course');
});
test('direct About request without a cookie redirects to sign-in',async({context,page})=>{const state=await api(context);state.loggedIn=false;await context.clearCookies();await page.goto('/about');await expect(page).toHaveURL(/\/login\?next=%2Fabout/);await expect(page.getByRole('heading',{name:/Practical learning/})).toHaveCount(0);});
