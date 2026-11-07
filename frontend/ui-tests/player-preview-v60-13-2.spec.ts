/** Real Next/React browser regressions. Provider documents are intercepted
 * synthetic pages; no actual video/account/payment provider is contacted. */
import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {CATALOG_PHOTO_PATH,catalogPhotoResponse} from './helpers/catalog-photo-fixture.mjs';
import {openTeamPreview} from './helpers/open-team-preview';
const origin='http://127.0.0.1:3108';
function observe(page:Page){
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error'&&/postMessage|target origin|recipient window|hydration|didn't match/i.test(message.text()))errors.push(message.text());});
 return errors;
}
async function signIn(context:BrowserContext){
 const response=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});expect(response.ok()).toBe(true);
}
async function lesson(context:BrowserContext,provider:string){
 const video=provider==='vimeo'?'https://vimeo.com/123456789/abcdef1234#t=30s':'https://youtu.be/abcdefghijk?t=30';
 await context.route('**/api/courses/free-demo/learn',route=>route.fulfill({json:{success:true,course:{slug:'free-demo',title:'Delayed player fixture',accessType:'free'},attempt:{number:1,lastLesson:'a'.repeat(24)},completedLessonIds:[],modules:[{_id:'b'.repeat(24),title:'Module',sequential:false,lessons:[{_id:'a'.repeat(24),title:'Recorded lesson',type:'video',videoUrl:video,videoThumbnailUrl:CATALOG_PHOTO_PATH}]}]}}));
 await context.route('**/api/media/**',route=>route.fulfill(catalogPhotoResponse(route.request().url())));
}
function playerHTML(provider:string){return `<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Delayed ${provider}</h1><script>
window.commands=[];window.releases=0;
function reply(data){parent.postMessage(data,${JSON.stringify(origin)});}
window.releasePlayer=()=>{window.releases++;reply({event:${JSON.stringify(provider==='vimeo'?'ready':'onReady')}});};
addEventListener('message',event=>{if(event.source!==parent||event.origin!==${JSON.stringify(origin)})return;let data=event.data;try{if(typeof data==='string')data=JSON.parse(data);}catch{return;}window.commands.push(data);
if(data.method==='play'||data.func==='playVideo')reply(${JSON.stringify(provider==='vimeo'?{event:'playing'}:{event:'onStateChange',info:1})});});
</script></body></html>`;}
for(const provider of ['vimeo','youtube'])test(provider+' delayed iframe commit emits no premature postMessage; early Play is delivered once after ready',async({context,page})=>{
 const errors=observe(page);await signIn(context);await lesson(context,provider);
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let loads=0;
 const frameOrigin=provider==='vimeo'?'https://player.vimeo.com':'https://www.youtube-nocookie.com';
 await context.route(frameOrigin+'/**',async route=>{loads++;await held;await route.fulfill({contentType:'text/html; charset=utf-8',body:playerHTML(provider)});});
 try{
  // Do not wait for window.load while deliberately holding the iframe response.
  await page.goto('/learn/free-demo',{waitUntil:'domcontentloaded'});
  const iframe=page.locator('iframe[title="'+provider+' course video"]');await expect(iframe).toBeVisible();
  await expect.poll(()=>loads).toBe(1);const src=await iframe.getAttribute('src');
  await page.getByRole('button',{name:'Play video',exact:true}).click();
  // Cross the old 500ms polling boundary while the child is still about:blank.
  await page.waitForTimeout(1100);expect(errors).toEqual([]);
  release();await expect.poll(()=>page.frames().some(frame=>frame.url().startsWith(frameOrigin+'/'))).toBe(true);
  const frame=page.frames().find(frame=>frame.url().startsWith(frameOrigin+'/'))!;
  await frame.waitForFunction(()=>typeof (window as any).releasePlayer==='function');
  expect(await frame.evaluate(()=>(window as any).commands.some((m:any)=>m.method==='play'||m.func==='playVideo'))).toBe(false);
  await frame.evaluate(()=>{(window as any).releasePlayer();(window as any).releasePlayer();});
  await expect(page.locator('.lessonMediaStatus')).toHaveCount(0);
  await expect.poll(()=>frame.evaluate(()=>(window as any).commands.filter((m:any)=>m.method==='play'||m.func==='playVideo').length)).toBe(1);
  expect(await iframe.getAttribute('src')).toBe(src);expect(loads).toBe(1);expect(errors).toEqual([]);
 }finally{release();}
});
test('leaving a lesson before its Vimeo document commits does not post into the removed frame',async({context,page})=>{
 const errors=observe(page);await signIn(context);await lesson(context,'vimeo');let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requested=false;
 await context.route('https://player.vimeo.com/**',async route=>{requested=true;await held;try{await route.fulfill({contentType:'text/html; charset=utf-8',body:playerHTML('vimeo')});}catch(error){if(!page.isClosed()&&page.url().includes('/learn/'))throw error;}});
 try{
  await page.goto('/learn/free-demo',{waitUntil:'domcontentloaded'});await expect.poll(()=>requested).toBe(true);
  await page.goto('/about');release();await page.waitForTimeout(650);
  await expect(page).toHaveURL(origin+'/about');await expect(page.locator('iframe[title="vimeo course video"]')).toHaveCount(0);expect(errors).toEqual([]);
 }finally{release();}
});
for(const width of [390,1440])test.describe('landing preview input at '+width+'px',()=>{
 test.use({viewport:{width,height:940},isMobile:width===390,hasTouch:width===390});
 test('guest landing team preview remains public; full profile keeps login destination at '+width+'px',async({context,page})=>{
 const errors=observe(page),requests:string[]=[];
 await context.route('**/api/content/landing',route=>route.fulfill({json:{success:true,sections:[],courses:[],reviews:[],team:[{_id:'e'.repeat(24),name:'Preview Faculty',role:'Faculty',bio:'Saved public faculty biography.',image:CATALOG_PHOTO_PATH}]}}));
 await context.route('**/api/media/**',route=>route.fulfill(catalogPhotoResponse(route.request().url())));
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))requests.push(r.method()+' '+new URL(r.url()).pathname);});
 await page.goto('/');
 const openPreview=()=>openTeamPreview(page,width===390?'touch':'mouse');
 await openPreview();
 const modal=page.getByRole('dialog',{name:'Preview Faculty'});await expect(modal).toBeVisible();await expect(modal).toContainText('Saved public faculty biography.');await expect(page).toHaveURL(origin+'/');
 await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);await openPreview();
 await modal.getByRole('button',{name:'Close team preview',exact:true}).click();await expect(modal).toHaveCount(0);await openPreview();
 // Public catalog warmup may run while the preview is open. Repeated modal
 // opens still reuse its bounded GETs and never sign in or prefetch access data.
 for(const path of ['/api/content/team','/api/content/events','/api/video-reviews','/api/page-sections/landing'])expect(requests.filter(request=>request==='GET '+path).length).toBeLessThanOrEqual(1);
 expect(requests.filter(request=>!request.startsWith('GET '))).toEqual([]);
 expect(requests.filter(request=>/^GET \/api\/(?:courses|sections|payments|learn|notifications|student-notifications|admin|academy-admin|certificates)(?:\/|$)/.test(request))).toEqual([]);
 await modal.getByRole('link',{name:'Full faculty profile →',exact:true}).click();
 await expect(page).toHaveURL(origin+'/login?next=%2Fteam');await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
 await page.getByLabel('Email',{exact:true}).fill('learner@example.invalid');await page.locator('input[name=password]').fill('TestPassword123!');await page.getByRole('button',{name:'Sign in →',exact:true}).click();
 await expect(page).toHaveURL(origin+'/team');expect(errors).toEqual([]);
});
});
