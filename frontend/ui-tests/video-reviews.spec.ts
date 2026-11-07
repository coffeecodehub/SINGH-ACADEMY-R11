/** Actual browser media/readiness checks with local video + intercepted provider
 * documents. No third-party account, SDK or real provider request is used. */
import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const academy='http://127.0.0.1:3108',media='/api/media/'+'7'.repeat(24);
const video=fs.readFileSync(path.join(__dirname,'fixtures','video-review.webm'));
const poster='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"><rect width="960" height="600" fill="#9f6b40"/></svg>';
function observe(page:Page){const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/hydration|didn't match|postMessage|target origin|recipient window/i.test(m.text()))errors.push(m.text());});return errors;}
async function reviews(context:BrowserContext,url=media,teaserSeconds=15){
 await context.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:poster}));
 await context.route('**/api/video-reviews',route=>route.fulfill({json:{success:true,items:[{_id:'8'.repeat(24),title:'A community perspective',description:'An original published video review.',videoUrl:url,teaserSeconds,order:0}]}}));
 await context.route('**'+media+'*',route=>{
  if(new URL(route.request().url()).searchParams.get('poster')==='1')return route.fulfill({contentType:'image/svg+xml',body:poster});
  const range=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/),start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),video.length-1):video.length-1;
  return route.fulfill({status:range?206:200,contentType:'video/webm',headers:{'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${video.length}`}:{})},body:video.subarray(start,end+1)});
 });
}
for(const width of [390,1440])test.describe('public video reviews at '+width+'px',()=>{
 test.use({viewport:{width,height:960}});
 test('legacy 10-second review automatically gets a 15-second muted preview and complete native playback',async({context,page})=>{
  const errors=observe(page);await reviews(context,media,10);await page.goto('/video-reviews');await expect(page).toHaveURL(academy+'/video-reviews');await expect(page.locator('.videoReviewCard small')).toHaveCount(0);
  const preview=page.locator('.videoReviewCard video');await preview.scrollIntoViewIfNeeded();await expect(preview).toBeVisible();
  await expect.poll(()=>preview.evaluate((v:HTMLVideoElement)=>v.readyState>=2&&v.currentTime>0&&!v.paused)).toBe(true);
  expect(await preview.evaluate((v:HTMLVideoElement)=>({muted:v.muted,loop:v.loop,controls:v.controls,duration:v.duration}))).toEqual({muted:true,loop:true,controls:false,duration:22});
  await preview.evaluate((v:HTMLVideoElement)=>{v.currentTime=15.2;});await expect.poll(()=>preview.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeLessThan(2);
  await expect(page.getByRole('button',{name:/^(Pause|Play) video previews$/})).toHaveCount(0);
  const open=page.getByRole('button',{name:'Watch full video review: A community perspective',exact:true});await open.click();const modal=page.getByRole('dialog',{name:'A community perspective'});await expect(modal).toBeVisible();await expect.poll(()=>preview.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
  const full=modal.locator('video');await expect.poll(()=>full.evaluate((v:HTMLVideoElement)=>v.readyState>=2)).toBe(true);expect(await full.evaluate((v:HTMLVideoElement)=>({controls:v.controls,loop:v.loop,muted:v.muted}))).toEqual({controls:true,loop:false,muted:false});
  await full.evaluate((v:HTMLVideoElement)=>{v.currentTime=17;});await expect.poll(()=>full.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThanOrEqual(17);
  await expect(page).toHaveURL(academy+'/video-reviews');await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);await expect(open).toBeFocused();await expect.poll(()=>preview.evaluate((v:HTMLVideoElement)=>!v.paused&&v.muted)).toBe(true);
  if(width===390)await page.getByRole('button',{name:'Toggle navigation',exact:true}).click();await expect(page.getByRole('link',{name:'Video Reviews',exact:true})).toHaveAttribute('href','/video-reviews');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 });
});
test('native review keeps its poster, pauses outside viewport and resumes when returned into view',async({context,page})=>{
 await reviews(context);await page.goto('/video-reviews');const preview=page.locator('.videoReviewCard video');await preview.scrollIntoViewIfNeeded();await expect(preview).toHaveAttribute('poster',media+'?poster=1');await expect.poll(()=>preview.evaluate((v:HTMLVideoElement)=>!v.paused&&v.currentTime>0)).toBe(true);
 await page.evaluate(()=>{document.body.style.paddingBottom='2000px';scrollTo(0,document.documentElement.scrollHeight);});await expect.poll(()=>preview.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);await preview.scrollIntoViewIfNeeded();await expect.poll(()=>preview.evaluate((v:HTMLVideoElement)=>!v.paused)).toBe(true);
});
function providerHtml(provider:string){return `<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Synthetic review player</h1><script>
window.commands=[];window.ready=false;window.premature=0;
function reply(value){parent.postMessage(value,${JSON.stringify(academy)});}
window.releasePlayer=()=>{window.ready=true;reply({event:${JSON.stringify(provider==='youtube'?'onReady':'ready')}});};
window.advancePreview=()=>reply(${JSON.stringify(provider==='youtube'?{event:'infoDelivery',info:{currentTime:16,playerState:1}}:{event:'timeupdate',data:{seconds:16}})});
addEventListener('message',event=>{if(event.source!==parent||event.origin!==${JSON.stringify(academy)})return;let data=event.data;try{if(typeof data==='string')data=JSON.parse(data);}catch{return;}window.commands.push(data);if((data.func==='playVideo'||data.method==='play')&&!window.ready)window.premature++;});
</script></body></html>`;}
for(const provider of ['youtube','vimeo'])test(provider+' teaser waits for player ready, loops first15 seconds, pauses without reloading, and opens a public full player',async({context,page})=>{
 const errors=observe(page),remote=provider==='youtube'?'https://www.youtube-nocookie.com':'https://player.vimeo.com';await reviews(context,provider==='youtube'?'https://youtu.be/abcdefghijk':'https://vimeo.com/123456789');
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requests=0;
 await context.route(remote+'/**',async route=>{requests++;await held;await route.fulfill({contentType:'text/html; charset=utf-8',body:providerHtml(provider)});});
 try{
  await page.goto('/video-reviews',{waitUntil:'domcontentloaded'});const iframe=page.locator('.videoReviewCard iframe');await iframe.scrollIntoViewIfNeeded();await expect(iframe).toBeVisible();await expect.poll(()=>requests).toBe(1);const original=await iframe.getAttribute('src'),params=new URL(original!).searchParams;
  expect(params.get('autoplay')).toBe('1');expect(params.get(provider==='youtube'?'mute':'muted')).toBe('1');expect(params.get('playsinline')).toBe('1');
  await page.waitForTimeout(650);if(provider==='youtube'){const poster=page.locator('.videoReviewPoster');await expect(poster).toBeVisible();await expect.poll(()=>poster.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);expect(await poster.evaluate(image=>Number(getComputedStyle(image).zIndex))).toBeGreaterThan(0);}expect(errors).toEqual([]);release();await expect.poll(()=>page.frames().some(f=>f.url().startsWith(remote+'/'))).toBe(true);
  const frame=page.frames().find(f=>f.url().startsWith(remote+'/'))!;await frame.waitForFunction(()=>typeof (window as any).releasePlayer==='function');
  expect(await frame.evaluate(()=>(window as any).commands.some((m:any)=>m.func==='playVideo'||m.method==='play'))).toBe(false);
  await frame.evaluate(()=>{(window as any).releasePlayer();(window as any).releasePlayer();});await expect.poll(()=>frame.evaluate(()=>(window as any).commands.filter((m:any)=>m.func==='playVideo'||m.method==='play').length)).toBe(1);
  expect(await frame.evaluate(()=>(window as any).premature)).toBe(0);expect(await iframe.getAttribute('src')).toBe(original);
  await frame.evaluate(()=>(window as any).advancePreview());await expect.poll(()=>frame.evaluate(()=>(window as any).commands.some((m:any)=>m.func==='seekTo'&&m.args[0]===0||m.method==='setCurrentTime'&&m.value===0))).toBe(true);
  await expect(page.getByRole('button',{name:/^(Pause|Play) video previews$/})).toHaveCount(0);expect(requests).toBe(1);
  await page.getByRole('button',{name:'Watch full video review: A community perspective',exact:true}).click();const modal=page.getByRole('dialog',{name:'A community perspective'});await expect(modal).toBeVisible();await expect.poll(()=>frame.evaluate(()=>(window as any).commands.some((m:any)=>m.func==='pauseVideo'||m.method==='pause'))).toBe(true);const full=new URL((await modal.locator('iframe').getAttribute('src'))!);expect(full.searchParams.get('controls')).toBe('1');expect(full.searchParams.has('end')).toBe(false);await expect(page).toHaveURL(academy+'/video-reviews');
  await modal.getByRole('button',{name:'Close video review',exact:true}).click();await expect(modal).toHaveCount(0);expect(errors).toEqual([]);
 }finally{release();}
});
for(const provider of ['youtube','vimeo'])test(provider+' pauses outside viewport and resumes the same ready iframe',async({context,page})=>{
 const remote=provider==='youtube'?'https://www.youtube-nocookie.com':'https://player.vimeo.com';await reviews(context,provider==='youtube'?'https://youtu.be/abcdefghijk':'https://vimeo.com/123456789');await context.route(remote+'/**',route=>route.fulfill({contentType:'text/html',body:providerHtml(provider)}));await page.goto('/video-reviews');const iframe=page.locator('.videoReviewCard iframe');await iframe.scrollIntoViewIfNeeded();const source=await iframe.getAttribute('src');const frame=page.frames().find(f=>f.url().startsWith(remote+'/'))!;await frame.waitForFunction(()=>typeof(window as any).releasePlayer==='function');await frame.evaluate(()=>(window as any).releasePlayer());await expect.poll(()=>frame.evaluate(()=>(window as any).commands.some((m:any)=>m.func==='playVideo'||m.method==='play'))).toBe(true);
 await frame.evaluate(()=>{(window as any).commands=[];});await page.evaluate(()=>{document.body.style.paddingBottom='2000px';scrollTo(0,document.documentElement.scrollHeight);});await expect.poll(()=>frame.evaluate(()=>(window as any).commands.some((m:any)=>m.func==='pauseVideo'||m.method==='pause'))).toBe(true);await frame.evaluate(()=>{(window as any).commands=[];});await iframe.scrollIntoViewIfNeeded();await expect.poll(()=>frame.evaluate(()=>(window as any).commands.some((m:any)=>m.func==='playVideo'||m.method==='play'))).toBe(true);await expect(iframe).toHaveAttribute('src',source!);
});
test('unsupported social review stays an external link with no fake embedded player',async({context,page})=>{
 const errors=observe(page),url='https://www.facebook.com/watch/?v=123456';await reviews(context,url);await page.goto('/video-reviews');await expect(page.locator('.videoReviewCard iframe,.videoReviewCard video')).toHaveCount(0);
 await page.getByRole('button',{name:'Open video review: A community perspective',exact:true}).click();const link=page.getByRole('dialog').getByRole('link',{name:'Open full video at source ↗'});await expect(link).toHaveAttribute('href',url);await expect(link).toHaveAttribute('rel','noopener noreferrer');await expect(page).toHaveURL(academy+'/video-reviews');expect(errors).toEqual([]);
});
test('published landing video card opens full public review without navigation or signup',async({context,page})=>{
 const errors=observe(page);await reviews(context,media,10);await page.goto('/');const card=page.locator('.videoReviewCard');await expect(card).toHaveCount(1);expect(await card.evaluate(element=>Array.from(element.querySelectorAll('video')).every(video=>video.paused))).toBe(true);const open=page.getByRole('button',{name:'Watch full video review: A community perspective',exact:true});await open.scrollIntoViewIfNeeded();const preview=card.locator('video');await expect.poll(()=>preview.evaluate((video:HTMLVideoElement)=>video.currentTime>0&&!video.paused&&video.muted&&video.playsInline)).toBe(true);await expect(card.locator('small')).toHaveCount(0);await preview.evaluate((video:HTMLVideoElement)=>{video.currentTime=15.2;});await expect.poll(()=>preview.evaluate((video:HTMLVideoElement)=>video.currentTime)).toBeLessThan(2);await open.click();const full=page.getByRole('dialog',{name:'A community perspective'}).locator('video');await expect(full).toBeVisible();expect(await full.evaluate((video:HTMLVideoElement)=>({controls:video.controls,loop:video.loop,muted:video.muted}))).toEqual({controls:true,loop:false,muted:false});await expect(page).toHaveURL(academy+'/');await expect(page.getByRole('link',{name:'All video reviews →',exact:true})).toHaveAttribute('href','/video-reviews');expect(errors).toEqual([]);
});

test('TikTok uses its origin-bound player API for a short preview and public full playback',async({context,page})=>{
 const errors=observe(page),remote='https://www.tiktok.com';await reviews(context,remote+'/@academy/video/123456789');
 await context.route(remote+'/**',route=>route.fulfill({contentType:'text/html',body:`<html><body><script>window.commands=[];window.ready=()=>parent.postMessage({type:'onPlayerReady','x-tiktok-player':true},'${academy}');window.advance=()=>parent.postMessage({type:'onCurrentTime',value:{currentTime:16},'x-tiktok-player':true},'${academy}');addEventListener('message',e=>{if(e.origin==='${academy}')window.commands.push(e.data)});<\/script></body></html>`}));
 await page.goto('/video-reviews');const iframe=page.locator('.videoReviewCard iframe');await iframe.scrollIntoViewIfNeeded();await expect(iframe).toBeVisible();
 await expect.poll(()=>page.frames().some(f=>f.url().startsWith(remote+'/player/'))).toBe(true);const frame=page.frames().find(f=>f.url().startsWith(remote+'/player/'))!;await frame.waitForFunction(()=>typeof(window as any).ready==='function');
 await frame.evaluate(()=>(window as any).ready());await expect.poll(()=>frame.evaluate(()=>(window as any).commands.some((m:any)=>m.type==='play'&&m['x-tiktok-player']===true))).toBe(true);
 await frame.evaluate(()=>(window as any).advance());await expect.poll(()=>frame.evaluate(()=>(window as any).commands.some((m:any)=>m.type==='seekTo'&&m.value===0))).toBe(true);
 await expect(page.getByRole('button',{name:/^(Pause|Play) video previews$/})).toHaveCount(0);
 await page.getByRole('button',{name:'Watch full video review: A community perspective',exact:true}).click();await expect.poll(()=>frame.evaluate(()=>(window as any).commands.some((m:any)=>m.type==='pause'))).toBe(true);const full=new URL((await page.getByRole('dialog').locator('iframe').getAttribute('src'))!);expect(full.searchParams.get('controls')).toBe('1');expect(full.searchParams.get('muted')).toBe('0');expect(errors).toEqual([]);
});
test('Instagram full review uses official public embed and always offers its original source',async({context,page})=>{
 const url='https://www.instagram.com/reel/community-review/';await reviews(context,url);await context.route('https://www.instagram.com/**',route=>route.fulfill({contentType:'text/html',body:'<html><body>Provider controlled Instagram video</body></html>'}));await page.goto('/video-reviews');await page.getByRole('button',{name:'Watch full video review: A community perspective',exact:true}).click();const modal=page.getByRole('dialog');await expect(modal.locator('iframe')).toHaveAttribute('src',url+'embed/');await expect(modal.getByRole('link',{name:'Open original video ↗',exact:true})).toHaveAttribute('href',url);await expect(page).toHaveURL(academy+'/video-reviews');
});

test('published CMS video starts a silent looping preview and opens the complete original without sign-in',async({context,page})=>{
 const errors=observe(page);await reviews(context);await context.route('**/api/video-reviews',route=>route.fulfill({json:{success:true,items:[]}}));await context.route('**/api/page-sections/landing',route=>route.fulfill({json:{success:true,blocks:[{id:'cms-video-autoplay',type:'video',title:'An academy conversation',description:'Public professional learning.',videoUrl:media,published:true,placement:'after-hero',theme:'cream',align:'left',layout:'stack'}]}}));
 await page.goto('/');await page.locator('.pageSectionVideoPreview').scrollIntoViewIfNeeded();const preview=page.locator('.pageSectionVideoPreview video');await expect(preview).toBeVisible();await expect.poll(()=>preview.evaluate((video:HTMLVideoElement)=>video.currentTime>0&&!video.paused&&video.muted)).toBe(true);expect(await preview.evaluate((video:HTMLVideoElement)=>({loop:video.loop,controls:video.controls,duration:video.duration}))).toEqual({loop:true,controls:false,duration:22});
 await preview.evaluate((video:HTMLVideoElement)=>{video.currentTime=15.2;});await expect.poll(()=>preview.evaluate((video:HTMLVideoElement)=>video.currentTime)).toBeLessThan(2);
 const open=page.getByRole('button',{name:'Open full page video: An academy conversation',exact:true});await open.click();const modal=page.getByRole('dialog',{name:'An academy conversation',exact:true});await expect(modal).toBeVisible();await expect.poll(()=>preview.evaluate((video:HTMLVideoElement)=>video.paused)).toBe(true);const full=modal.locator('video');await expect.poll(()=>full.evaluate((video:HTMLVideoElement)=>video.readyState>=2)).toBe(true);await full.evaluate((video:HTMLVideoElement)=>{video.currentTime=20.5;});await expect.poll(()=>full.evaluate((video:HTMLVideoElement)=>video.currentTime)).toBeGreaterThanOrEqual(20.5);expect(await full.evaluate((video:HTMLVideoElement)=>({controls:video.controls,loop:video.loop,muted:video.muted}))).toEqual({controls:true,loop:false,muted:false});
 await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);await expect(open).toBeFocused();await expect.poll(()=>preview.evaluate((video:HTMLVideoElement)=>!video.paused&&video.muted)).toBe(true);await expect(page.getByRole('button',{name:/^(Pause|Play) video previews$/})).toHaveCount(0);await expect(page).toHaveURL(academy+'/');expect(errors).toEqual([]);
});

for(const provider of ['youtube','vimeo'])test(provider+' preview can start muted without a provider-ready message',async({context,page})=>{
 const remote=provider==='youtube'?'https://www.youtube-nocookie.com':'https://player.vimeo.com';await reviews(context,provider==='youtube'?'https://youtu.be/abcdefghijk':'https://vimeo.com/123456789');
 await context.route(remote+'/**',route=>route.request().url().endsWith('/fixture-preview.webm')?route.fulfill({contentType:'video/webm',body:video}):route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><video muted playsinline loop src="${remote}/fixture-preview.webm"></video><script>const v=document.querySelector('video'),q=new URLSearchParams(location.search);v.muted=q.get('mute')==='1'||q.get('muted')==='1';if(q.get('autoplay')==='1'){v.autoplay=true;v.play().catch(()=>{});}<\/script></body></html>`}));
 await page.goto('/video-reviews');await expect(page.locator('.videoReviewCard')).toHaveCount(1);await page.locator('.videoReviewPreview').scrollIntoViewIfNeeded();const iframe=page.locator('.videoReviewCard iframe');await expect(iframe).toBeVisible();const source=new URL((await iframe.getAttribute('src'))!);expect(source.searchParams.get('autoplay')).toBe('1');expect(source.searchParams.get(provider==='youtube'?'mute':'muted')).toBe('1');
 await expect.poll(async()=>{const frame=page.frames().find(f=>f.url().startsWith(remote+'/'));return frame?frame.evaluate(()=>{const v=document.querySelector('video');return !!v&&v.muted&&!v.paused&&v.currentTime>0;}):false;}).toBe(true);
 // Without an API-ready acknowledgement, detaching is the only dependable
 // offscreen pause. A normal ready player keeps its frame (tested above).
 const original=await iframe.getAttribute('src');await page.evaluate(()=>{document.body.style.paddingBottom='2000px';scrollTo(0,document.documentElement.scrollHeight);});await expect(iframe).toHaveCount(0);
 await page.locator('.videoReviewPreview').scrollIntoViewIfNeeded();await expect(iframe).toBeVisible();await expect(iframe).toHaveAttribute('src',original!);
 await expect.poll(async()=>{const frame=page.frames().find(f=>f.url().startsWith(remote+'/'));return frame?frame.evaluate(()=>{const v=document.querySelector('video');return !!v&&v.muted&&!v.paused&&v.currentTime>0;}):false;}).toBe(true);
});

for(const provider of ['native','youtube'])test(provider+' review autoplays before any click with Windows reduced animation enabled',async({context,page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await reviews(context,provider==='native'?media:'https://youtu.be/abcdefghijk');
 if(provider==='youtube'){const remote='https://www.youtube-nocookie.com';await context.route(remote+'/**',route=>route.request().url().endsWith('/fixture-preview.webm')?route.fulfill({contentType:'video/webm',body:video}):route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><video muted playsinline loop src="${remote}/fixture-preview.webm"></video><script>const v=document.querySelector('video'),q=new URLSearchParams(location.search);v.muted=q.get('mute')==='1';if(q.get('autoplay')==='1'){v.autoplay=true;v.play().catch(()=>{});}<\/script></body></html>`}));}
 await page.goto('/video-reviews');await page.locator('.videoReviewPreview').scrollIntoViewIfNeeded();
 if(provider==='native'){const native=page.locator('.videoReviewCard video');await expect.poll(()=>native.evaluate((v:HTMLVideoElement)=>v.muted&&v.playsInline&&!v.paused&&v.currentTime>0)).toBe(true);}
 else await expect.poll(async()=>{const frame=page.frames().find(f=>f.url().startsWith('https://www.youtube-nocookie.com/'));return frame?frame.evaluate(()=>{const v=document.querySelector('video');return !!v&&v.muted&&v.playsInline&&!v.paused&&v.currentTime>0;}):false;}).toBe(true);
});
