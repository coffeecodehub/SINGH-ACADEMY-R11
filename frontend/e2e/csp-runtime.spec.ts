/** Runs against the isolated browser API in either next dev or next start.
 * All identities are seeded .invalid fixtures; no registration quota is used. */
import {test,expect,type BrowserContext,type Page} from '@playwright/test';

async function signIn(context:BrowserContext,baseURL:string,admin=false){
 const portal=admin?'client_admin':'student';
 const response=await context.request.post(admin?'/api/auth/admin/login':'/api/auth/login',{
  headers:{Origin:baseURL,'X-SA-CSRF':'1','X-SA-Portal':portal},
  data:{email:admin?'client-admin@browser-fixture.invalid':'us-student@browser-fixture.invalid',password:'Browser-Only-Fixture-2026!'}
 });
 expect(response.ok(),await response.text()).toBe(true);expect((await response.json()).user.role).toBe(portal);
}
async function observe(page:Page){
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  (window as any).__cspViolations=[];
  document.addEventListener('securitypolicyviolation',event=>{
   if(event.effectiveDirective.startsWith('script-src'))(window as any).__cspViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI});
  });
 });
 return errors;
}
const violations=(page:Page)=>page.evaluate(()=>(window as any).__cspViolations);

test('CSP permits authenticated admin lazy chunks through overview, sections and security',async({page,context,baseURL})=>{
 await signIn(context,baseURL!,true);const errors=await observe(page),chunks:string[]=[];
 page.on('response',response=>{if(response.ok()&&response.url().includes('/_next/static/chunks/'))chunks.push(response.url());});
 const response=await page.goto('/admin?section=security');expect(response?.status()).toBe(200);
 await expect(page.getByRole('heading',{name:'Change password',exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'Academy administration'}).getByRole('button',{name:'Academy Plans',exact:true}).click();
 await expect(page.getByRole('button',{name:'＋ Add section',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Academy overview',exact:true}).click();
 await expect(page.getByRole('heading',{name:/Welcome back,/})).toBeVisible();
 expect(chunks.length).toBeGreaterThan(0);
 if(response?.headers()['content-security-policy']?.includes("'unsafe-eval'")){
  expect(chunks.some(url=>url.includes('AcademyOverview'))).toBe(true);
  expect(chunks.some(url=>url.includes('SectionManager'))).toBe(true);
 }
 expect(await violations(page)).toEqual([]);expect(errors).toEqual([]);
});

test('CSP keeps the active document usable across authenticated RSC navigation',async({page,context,baseURL})=>{
 await signIn(context,baseURL!);const errors=await observe(page),rscNonces:string[]=[];
 page.on('response',response=>{
  if(response.request().headers().rsc==='1'){
   const nonce=response.headers()['content-security-policy']?.match(/'nonce-([^']+)'/)?.[1];if(nonce)rscNonces.push(nonce);
  }
 });
 await page.setViewportSize({width:1440,height:900});await page.goto('/about');
 const marker=await page.evaluate(()=>{(window as any).__cspDocument=crypto.randomUUID();return (window as any).__cspDocument;});
 for(const [label,path]of [['Team','/team'],['Academy Plans','/academy'],['Contact','/contact']]){
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:label,exact:true}).click();
  await expect(page).toHaveURL(new URL(path,baseURL!).href);
  await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).__cspDocument)).toBe(marker);
 }
 expect(rscNonces.length).toBeGreaterThan(0);expect(await violations(page)).toEqual([]);expect(errors).toEqual([]);
});

test('CSP authorizes the document nonce while blocking injected inline script',async({page})=>{
 await observe(page);
 // Inject into the actual HTML response so the browser parser, rather than
 // Playwright's privileged evaluation context, exercises CSP authorization.
 const documentResponse=await page.request.get('/terms');expect(documentResponse.ok()).toBe(true);
 const documentNonce=documentResponse.headers()['content-security-policy'].match(/'nonce-([^']+)'/)![1];
 const probes=`<script nonce="${documentNonce}">window.__cspTrusted=true</script><script>window.__cspUntrusted=true</script>`;
 const documentHtml=(await documentResponse.text()).replace('</head>',probes+'</head>');
 await page.route('**/terms',async route=>{
  await route.fulfill({response:documentResponse,body:documentHtml});
 });
 const response=await page.goto('/terms'),csp=response!.headers()['content-security-policy'];
 const nonce=csp.match(/'nonce-([^']+)'/)?.[1];expect(nonce).toBeTruthy();
 const isDevelopment=csp.includes("'unsafe-eval'");expect(csp.includes("'strict-dynamic'")).toBe(!isDevelopment);
 expect(csp.split(';').find(part=>part.trim().startsWith('script-src '))).not.toContain("'unsafe-inline'");
 expect(await page.evaluate(()=>(window as any).__cspTrusted)).toBe(true);
 expect(await page.evaluate(()=>(window as any).__cspUntrusted)).toBeUndefined();
 await expect.poll(()=>violations(page)).toEqual([{directive:'script-src-elem',blocked:'inline'}]);
});
