/** Actual Next.js/React browser integration with a loopback HTTP fixture backend.
 * These tests never use the real database, SMTP or payment provider. */
import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {fulfillObservedJson} from './helpers/fixtures.mjs';
import {waitForSignedOutPage} from './helpers/signed-out-page';
const origin='http://127.0.0.1:3108';
function observe(page:Page){const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/hydration|server rendered HTML|didn't match/i.test(m.text()))errors.push(m.text());});return errors;}
async function login(page:Page,next='/home'){
 await page.goto('/login?next='+encodeURIComponent(next));
 await page.getByLabel('Email',{exact:true}).fill('learner@example.invalid');
 await page.locator('input[name=password]').fill('TestPassword123!');
 await page.getByRole('button',{name:'Sign in →',exact:true}).click();
 await expect(page).toHaveURL(origin+next);await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();
}
// Reject unexpected external requests; this suite must never hit real payment/SMTP infrastructure.
test.beforeEach(async({context})=>{await context.route('**/*',async route=>{const u=new URL(route.request().url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin)return route.abort();await route.continue();});});
for(const width of [390,820,1440])test(`V60.11 hydration: public landing, guest auth and non-submit Back at ${width}px`,async({page})=>{
 const errors=observe(page);await page.setViewportSize({width,height:940});let logins=0;page.on('request',req=>{if(req.method()==='POST'&&req.url().endsWith('/api/auth/login'))logins++;});
 await page.goto('/');await expect(page.getByRole('link',{name:'Sign In',exact:true}).first()).toBeVisible();
 await page.goto('/login?next=%2Fevents');await page.getByLabel('Email',{exact:true}).fill('learner@example.invalid');await page.locator('input[name=password]').fill('TestPassword123!');
 const back=page.getByRole('button',{name:'← Back',exact:true});await expect(back).toHaveAttribute('type','button');await back.click();await expect(page).toHaveURL(origin+'/');
 expect(logins).toBe(0);await expect(page.getByRole('button',{name:'Logout',exact:true})).toHaveCount(0);expect(errors).toEqual([]);
});
test('V60.11 credentials go to intended protected page; root and login then resolve to Home',async({page})=>{
 const errors=observe(page);await page.goto('/about');await expect(page).toHaveURL(/\/login\?next=%2Fabout/);await login(page,'/about');
 await page.goto('/');await expect(page).toHaveURL(origin+'/home');await page.goto('/login');await expect(page).toHaveURL(origin+'/home');expect(errors).toEqual([]);
});
test('V60.11 logout from Events revokes session, clears legacy paths and always opens guest landing',async({page,context})=>{
 const errors=observe(page);await login(page,'/events');await page.getByRole('button',{name:'Logout',exact:true}).click();await expect(page).toHaveURL(origin+'/');
 const c=await context.cookies(origin);expect(c.some(x=>x.name==='sa_student_v45')).toBe(false);
 await page.reload();await expect(page.getByRole('button',{name:'Logout',exact:true})).toHaveCount(0);
 await page.goto('/events');await expect(page).toHaveURL(/\/login\?next=%2Fevents/);await page.goBack({waitUntil:'domcontentloaded'});await waitForSignedOutPage(page);
 await page.reload();await waitForSignedOutPage(page);expect(errors).toEqual([]);
});
test('V60.11 logout is observed by sibling tab; only deliberate credential submission restores session',async({page,context})=>{
 const errors=observe(page);await login(page);const second=await context.newPage();const errors2=observe(second);await second.goto('/events');
 await page.getByRole('button',{name:'Logout',exact:true}).click();await expect(page).toHaveURL(origin+'/');await expect(second).toHaveURL(origin+'/');
 await second.goto('/login?next=%2Fabout');await expect(second.getByLabel('Email',{exact:true})).toBeVisible();await login(second,'/about');expect(errors).toEqual([]);expect(errors2).toEqual([]);
});
test('V60.11 slow SSR session plus fast client resolution does not hydrate the header with a different tree',async({page,context})=>{
 const errors=observe(page);await context.addCookies([{name:'sa_student_v45',value:'b'.repeat(64),url:origin,httpOnly:true},{name:'sa_ui_unavailable',value:'1',url:origin}]);
 await context.route('**/api/auth/session*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,user:null,enrollment:null})}));
 await context.route('**/api/content/site',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,content:{websiteContent:{text:{'landing-001':'Hydration fixture text'},images:[]},footerSocial:{}}})}));
 await page.goto('/');await expect(page.getByRole('link',{name:'Sign In',exact:true}).first()).toBeVisible();await page.goto('/login');await expect(page.getByLabel('Email',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test('V60.11 warm account/content state survives normal refresh without hydration warnings or redirect loop',async({page})=>{
 const errors=observe(page);await login(page);for(const path of ['/about','/events','/team','/courses','/home']){await page.goto(path);await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeVisible();await page.reload();await expect(page).toHaveURL(origin+path);}expect(errors).toEqual([]);
});

// Keep the exact origin assertions: accepting both localhost and 127.0.0.1
// would hide the cookie-splitting redirect that failed on the user's machine.
test('V60.11.1 authenticated document redirects never change the browser hostname',async({page,context})=>{
 const errors=observe(page);await login(page,'/about');
 for(const path of ['/','/login','/login?next=%2Fevents']){
  const response=await context.request.get(origin+path,{maxRedirects:0});
  expect(response.status()).toBe(307);const target=new URL(response.headers().location,origin);
  expect(target.origin).toBe(origin);expect(target.pathname).toBe(path.includes('next=')?'/events':'/home');
 }
 expect(errors).toEqual([]);
});

test('V60.11.1 Logout is disabled before hydration and the first enabled click revokes once',async({page,context})=>{
 const errors=observe(page);
 const signIn=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});
 expect(signIn.ok()).toBe(true);
 let releaseScripts:()=>void=()=>{},held=0,logouts=0;
 const gate=new Promise<void>(resolve=>{releaseScripts=resolve;});
 await context.route(/\/_next\/.*\.js(?:\?|$)/,async route=>{if(route.request().resourceType()==='script'){held++;await gate;}await route.continue();});
 page.on('request',req=>{if(req.method()==='POST'&&new URL(req.url()).pathname==='/api/auth/logout')logouts++;});
 try{
  await page.goto('/events',{waitUntil:'commit'});
  const button=page.getByRole('button',{name:'Logout',exact:true});
  await expect(button).toBeVisible();await expect(button).toBeDisabled();
  await expect(page.locator('header.nav')).toHaveAttribute('data-auth-controls-ready','false');
  await expect.poll(()=>held).toBeGreaterThan(0);expect(logouts).toBe(0);
  releaseScripts();await expect(button).toBeEnabled();
  // The real response is buffered before delivery. Reading a CDP response
  // body after the app's immediate logout redirect loses its resource handle.
  const responses:Awaited<ReturnType<typeof fulfillObservedJson>>[]=[];
  await context.route(origin+'/api/auth/logout',async route=>{
   expect(route.request().method()).toBe('POST');
   responses.push(await fulfillObservedJson(route));
  });
  await button.click();await expect.poll(()=>responses.length).toBe(1);
  expect(responses[0].status).toBe(200);expect(responses[0].body.signedOut).toBe(true);
  await expect(page).toHaveURL(origin+'/');expect(logouts).toBe(1);
  expect((await context.cookies(origin)).some(cookie=>cookie.name==='sa_student_v45')).toBe(false);
  expect(errors).toEqual([]);
 }finally{releaseScripts();}
});
