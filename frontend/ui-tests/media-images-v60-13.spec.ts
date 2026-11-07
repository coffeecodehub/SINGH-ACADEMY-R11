/** Actual Next component tests with synthetic, cross-origin player documents.
 * Not a claim about Vimeo/YouTube's private scripts or real stream delivery. */
import {test,expect,type BrowserContext,type Locator,type Page} from '@playwright/test';
import {COURSE_CARD_SIZES,TEAM_CARD_SIZES} from '../lib/imageSources';
import {CATALOG_PHOTO_PATH,CATALOG_PHOTO_WIDTHS,CATALOG_PHOTO_ORIGINAL_WIDTH,catalogPhotoResponse} from './helpers/catalog-photo-fixture.mjs';
const origin='http://127.0.0.1:3108';
const photo=CATALOG_PHOTO_PATH;
async function signIn(context:BrowserContext){
 const response=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});expect(response.ok()).toBe(true);
}
async function photoApi(context:BrowserContext){
 await context.route('**/api/sections',route=>route.fulfill({json:{success:true,sections:[]}}));
 await context.route('**/api/media/**',route=>route.fulfill(catalogPhotoResponse(route.request().url())));
 await context.route('**/api/courses',route=>route.fulfill({json:{success:true,courses:[{_id:'f'.repeat(24),slug:'free-demo',title:'Catalog photo fixture',accessType:'free',thumbnail:photo}]}}));
 await context.route('**/api/content/team',route=>route.fulfill({json:{success:true,team:[{_id:'e'.repeat(24),name:'Photo Fixture',category:'founder',role:'Faculty',image:photo}]}}));
}
for(const provider of ['vimeo','youtube'])test(provider+' player prepares paused, acknowledges Play once ready, and keeps the same iframe',async({context,page})=>{
 await signIn(context);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&/postMessage|target origin|recipient window/i.test(message.text()))errors.push(message.text());});
 const video=provider==='vimeo'?'https://vimeo.com/123456789/abcdef1234#t=30s':'https://youtu.be/abcdefghijk?t=30';
 await context.route('**/api/courses/free-demo/learn',route=>route.fulfill({json:{success:true,course:{slug:'free-demo',title:'Media fixture',accessType:'free'},attempt:{number:1,lastLesson:'a'.repeat(24)},completedLessonIds:[],modules:[{_id:'b'.repeat(24),title:'Module',sequential:false,lessons:[{_id:'a'.repeat(24),title:'Recorded video fixture',type:'video',videoUrl:video,videoThumbnailUrl:photo}]}]}}));
 await context.route('**/api/media/**',route=>route.fulfill(catalogPhotoResponse(route.request().url())));
 let loads=0;
 await context.route(provider==='vimeo'?'https://player.vimeo.com/video/**':'https://www.youtube-nocookie.com/embed/**',route=>{
  loads++;
  return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Controlled ${provider} video</h1><script>
  const provider=${JSON.stringify(provider)};window.messages=[];let ready=false;
  function send(data){parent.postMessage(data,${JSON.stringify(origin)});}
  window.releasePlayer=()=>{ready=true;send({event:provider==='vimeo'?'ready':'onReady'});};
  addEventListener('message',event=>{if(event.source!==parent||event.origin!==${JSON.stringify(origin)})return;let data=event.data;try{if(typeof data==='string')data=JSON.parse(data);}catch{return;}window.messages.push(data);
  if(ready&&data.method==='ping')send({method:'ping'});
  if(ready&&(data.method==='play'||data.func==='playVideo'))send(provider==='vimeo'?{event:'playing'}:{event:'onStateChange',info:1});});
  </script></body></html>`});
 });
 await page.goto('/learn/free-demo');const iframe=page.locator('iframe[title="'+provider+' course video"]');await expect(iframe).toBeVisible();
 await expect(iframe).toHaveAttribute('allow',/fullscreen/);expect(await iframe.getAttribute('allowfullscreen')).toBeNull();
 const before=await iframe.getAttribute('src');const src=new URL(before!);expect(provider==='vimeo'?src.hash:src.searchParams.get('start')).toBe(provider==='vimeo'?'#t=0s':'0');
 await expect(page.getByRole('button',{name:'Play video',exact:true})).toBeVisible();
 const frameOrigin=provider==='vimeo'?'https://player.vimeo.com/':'https://www.youtube-nocookie.com/';
 await expect.poll(()=>page.frames().some(f=>f.url().startsWith(frameOrigin))).toBe(true);
 const frame=page.frames().find(f=>f.url().startsWith(frameOrigin))!;
 await frame.waitForFunction(()=>typeof (window as any).releasePlayer==='function');
 expect(await frame.evaluate(()=>(window as any).messages.some((m:any)=>m.method==='play'||m.func==='playVideo'||m.method==='setCurrentTime'))).toBe(false);
 await page.getByRole('button',{name:'Play video',exact:true}).click();
 await frame.evaluate(()=>(window as any).releasePlayer());
 await expect(page.locator('.lessonMediaStatus')).toHaveCount(0);expect(await iframe.getAttribute('src')).toBe(before);expect(loads).toBe(1);expect(errors).toEqual([]);
});
/** Wait for the real image, not just a CSS-sized visible box. Keep the original
 * five-second deadline. decode(), currentSrc and bitmap dimensions distinguish
 * density rounding from a failed response or silent placeholder fallback. */
async function expectDecodedCatalogPhoto(page:Page,image:Locator,sizes:string){
 await expect(image).toBeVisible();await expect(image).toHaveAttribute('sizes',sizes);
 await expect.poll(()=>image.evaluate(e=>{const img=e as HTMLImageElement;return img.complete&&img.naturalWidth>0&&img.naturalHeight>0;})).toBe(true);
 await image.evaluate(e=>(e as HTMLImageElement).decode());
 const current=await image.evaluate(e=>(e as HTMLImageElement).currentSrc),requested=new URL(current);
 expect(requested.pathname).toBe(photo);expect(requested.searchParams.get('w')).toMatch(/^(240|480|720)$/);
 expect(requested.searchParams.has('sa_image_retry')).toBe(false);
 expect(await image.getAttribute('srcset')).toBeTruthy();
 const bitmap=await page.evaluate(async address=>{const response=await fetch(address);if(!response.ok)throw Error('Catalog photo HTTP '+response.status);const decoded=await createImageBitmap(await response.blob());try{return {width:decoded.width,height:decoded.height};}finally{decoded.close();}},current);
 expect(bitmap.width).toBe(Number(requested.searchParams.get('w')));
 expect(bitmap.height).toBe(Math.round(bitmap.width*9/16));
}
test('catalog priority photos request a grid-sized variant, not a full-viewport original',async({context,page})=>{
 await signIn(context);await photoApi(context);await page.setViewportSize({width:1200,height:900});
 await page.goto('/courses');const cover=page.locator('.courseVisualCard img').first();
 await expectDecodedCatalogPhoto(page,cover,COURSE_CARD_SIZES);
 await expect(cover).toHaveAttribute('fetchpriority','high');await expect(cover).toHaveAttribute('loading','eager');
 await page.goto('/team');await expectDecodedCatalogPhoto(page,page.locator('.teamStatic img').first(),TEAM_CARD_SIZES);
 // Revisit on the same browser, retaining the application's warm catalog state.
 await page.goto('/courses');await expectDecodedCatalogPhoto(page,page.locator('.courseVisualCard img').first(),COURSE_CARD_SIZES);
});
test('V60.13.1 fixture PNGs decode at their declared widths before responsive density correction',async({context,page})=>{
 await signIn(context);await photoApi(context);await page.goto('/about');
 const paths=[photo,...CATALOG_PHOTO_WIDTHS.map(width=>photo+'?w='+width)];
 const results=await page.evaluate(async addresses=>{
  const results=[];
  for(const address of addresses){
   const response=await fetch(address);const blob=await response.blob();const objectURL=URL.createObjectURL(blob);const image=new Image();
   try{image.src=objectURL;await image.decode();results.push({status:response.status,type:blob.type,width:image.naturalWidth,height:image.naturalHeight});}
   finally{URL.revokeObjectURL(objectURL);}
  }
  return results;
 },paths);
 const widths=[CATALOG_PHOTO_ORIGINAL_WIDTH,...CATALOG_PHOTO_WIDTHS];
 expect(results).toHaveLength(widths.length);
 for(let index=0;index<widths.length;index++)expect(results[index]).toEqual({status:200,type:'image/png',width:widths[index],height:Math.round(widths[index]*9/16)});
});
test('home warms first-row catalog photos before user opens catalog without mutating access',async({context,page})=>{
 await signIn(context);await photoApi(context);const calls:string[]=[];
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.method()+' '+new URL(r.url()).pathname);});
 await page.goto('/about');await expect.poll(()=>calls.some(c=>c==='GET '+photo)).toBe(true);
 expect(calls.some(c=>/^POST .*\/(?:enroll|checkout)/.test(c))).toBe(false);await expect(page).toHaveURL(origin+'/about');
});
test('slightly larger wide desktop header still fits without overlap',async({context,page})=>{
 await signIn(context);await page.setViewportSize({width:1897,height:900});await page.goto('/team');await expect(page.getByRole('button',{name:'Logout',exact:true})).toBeEnabled();
 const geometry=await page.evaluate(()=>{const header=document.querySelector('header.nav')!,brand=header.querySelector('.brand')!.getBoundingClientRect(),nav=header.querySelector('nav')!.getBoundingClientRect(),actions=header.querySelector('.actions')!.getBoundingClientRect();return {font:getComputedStyle(header.querySelector('nav a')!).fontSize,height:header.getBoundingClientRect().height,fit:brand.right<=nav.left+1&&nav.right<=actions.left+1&&document.documentElement.scrollWidth<=innerWidth+1};});
 expect(geometry.fit).toBe(true);expect(geometry.font).toBe('13px');expect(geometry.height).toBe(80);
});
