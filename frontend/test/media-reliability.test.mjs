import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {compileModule,browserGlobals} from './compile.mjs';import {hookHarness} from './hooks.mjs';
const {resolveVideoSource,autoplayVideoSource}=compileModule('../lib/video.ts',{globals:browserGlobals()});
for(const input of ['https://www.youtube.com/watch?v=abcdefghijk&t=30s','https://youtu.be/abcdefghijk?t=20','https://www.youtube.com/embed/abcdefghijk?start=35&autoplay=1','https://youtube.com/shorts/abcdefghijk?feature=share&t=00m30s'])test('YouTube recorded lesson always opens paused at zero '+input,()=>{const out=resolveVideoSource(input),u=new URL(out.src);assert.equal(out.kind,'embed');assert.equal(u.searchParams.get('start'),'0');assert.equal(u.searchParams.get('autoplay'),'0');assert.equal(u.searchParams.has('t'),false);assert.equal(new URL(autoplayVideoSource(out)).searchParams.get('autoplay'),'1');});
for(const input of ['https://vimeo.com/123456789/abcdef1234#t=30s','https://player.vimeo.com/video/123456789?h=abcdef1234&autoplay=1#t=20s'])test('Vimeo keeps unlisted hash but starts at zero '+input,()=>{const u=new URL(resolveVideoSource(input).src);assert.equal(u.searchParams.get('h'),'abcdef1234');assert.equal(u.searchParams.get('autoplay'),'0');assert.equal(u.hash,'#t=0s');});
test('native video fragment seek is removed while signed query is preserved',()=>{const u=resolveVideoSource('https://cdn.example.test/lesson.mp4?signature=secret#t=30');assert.equal(u.src,'https://cdn.example.test/lesson.mp4?signature=secret');assert.equal(resolveVideoSource('/api/media/'+'a'.repeat(24)+'#t=20').src,'/api/media/'+'a'.repeat(24));});
for(const value of ['javascript:alert(1)','data:video/mp4;base64,ABC','https://user:pass@videos.example.test/lesson.mp4'])test('unsafe video URL rejected '+value,()=>assert.equal(resolveVideoSource(value),null));
test('look-alike YouTube host is never trusted as a YouTube iframe',()=>assert.equal(resolveVideoSource('https://notyoutube.com/watch?v=abc').kind,'external'));
test('Twitch recorded video has one autoplay flag and zero timestamp',()=>{const u=new URL(resolveVideoSource('https://www.twitch.tv/videos/123456?t=30s').src);assert.deepEqual(u.searchParams.getAll('autoplay'),['false']);assert.equal(u.searchParams.get('time'),'0s');});
function nodes(tree,predicate){if(!tree||typeof tree!=='object')return [];const kids=Array.isArray(tree.props?.children)?tree.props.children:[tree.props?.children];return [...(predicate(tree)?[tree]:[]),...kids.flatMap(x=>Array.isArray(x)?x.flatMap(y=>nodes(y,predicate)):nodes(x,predicate))];}
function mediaFixture(url,poster){const h=hookHarness(),b=browserGlobals();const mod=compileModule('../components/learning/LessonMedia.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../AcademyImage':{default:()=>null},'../../lib/api':{portalMediaUrl:x=>x},'../../lib/playerFrameGate':compileModule('../lib/playerFrameGate.ts'),'../../lib/video':{resolveVideoSource,autoplayVideoSource}},globals:{...b,...h.globals}});h.mount(()=>mod.default({url,poster}));return {h,b,find:type=>nodes(h.tree,n=>n.type===type)[0]};}
test('native player prepares metadata and resets to 0 without autoplay before user input',async t=>{const f=mediaFixture('https://cdn.example.test/lesson.mp4#t=30');t.after(()=>f.h.cleanup());await f.h.settle();const node=f.find('video');assert.ok(node);let plays=0;const player={currentTime:30,play:async()=>plays++};node.props.onLoadedMetadata({currentTarget:player});assert.equal(player.currentTime,0);assert.equal(plays,0);assert.equal(node.props.preload,'metadata');assert.equal(node.props.src.includes('#t'),false);});
test('poster prewarms paused; early Play waits for API ready and does not reload source',async t=>{
 const f=mediaFixture('https://youtu.be/abcdefghijk?t=30','/poster.jpg');t.after(()=>f.h.cleanup());await f.h.settle();
 const frame=f.find('iframe'),poster=f.find('button'),messages=[];assert.ok(frame);assert.ok(poster);const src=frame.props.src;
 assert.equal(new URL(src).searchParams.get('autoplay'),'0');assert.equal(new URL(src).searchParams.get('start'),'0');assert.equal(new URL(src).searchParams.get('enablejsapi'),'1');
 const target={postMessage:(body,origin)=>messages.push({body:JSON.parse(body),origin})};
 frame.props.ref.current={contentWindow:target,src,isConnected:true,contentDocument:null};
 poster.props.onClick();await f.h.settle();assert.equal(f.find('button'),undefined);assert.equal(f.find('iframe').props.src,src);assert.equal(messages.length,0);
 const ready=new Event('message');Object.assign(ready,{source:target,origin:new URL(src).origin,data:{event:'onReady'}});f.b.window.dispatchEvent(ready);await f.h.settle();
 const plays=messages.filter(m=>m.body.func==='playVideo');assert.equal(plays.length,1);assert.equal(plays[0].origin,new URL(src).origin);assert.equal(f.find('iframe').props.src,src);
});
test('lesson identity is part of main and block player keys',()=>{const s=fs.readFileSync(new URL('../app/learn/[course]/page.tsx',import.meta.url),'utf8');assert.match(s,/key=\{String\(lesson\._id\)\+':main:'/);assert.match(s,/key=\{String\(lesson\._id\)\+':block:'/);});
const sources=compileModule('../lib/imageSources.ts');
test('only internal GridFS IDs get bounded responsive image URLs',()=>{const out=sources.academyImageVariants('/api/media/'+'a'.repeat(24)+'?portal=client_admin');assert.match(out.src,/w=720/);assert.match(out.src,/portal=client_admin/);assert.equal(out.srcSet.split(',').length,5);assert.equal(sources.academyImageVariants('https://outside.test/photo.jpg'),null);assert.equal(sources.academyImageVariants('/api/media/bad'),null);});
test('external signed images are not modified during retries',()=>assert.equal(sources.retryImageSource('https://external.test/photo?signature=x'),'https://external.test/photo?signature=x'));
function imageFixture(props={},onCommit){
 const h=hookHarness(),committed=new Set();let actualProps=props;
 const element={src:'',srcSet:undefined,complete:false,naturalWidth:0,naturalHeight:0,
  removeAttribute(name){if(name==='srcset')this.srcSet=undefined;},
  getAttribute(name){return name==='src'?this.src:name==='srcset'?this.srcSet:null;}
 };
 // Simulate DOM commit before passive effects. Cached images may already be
 // complete, and native load/error events may arrive in that same interval.
 function jsx(type,p,key){
  if(type==='img'){
   if(element.src!==p.src){element.src=p.src;element.complete=false;element.naturalWidth=0;element.naturalHeight=0;}
   element.srcSet=p.srcSet;if(p.ref)p.ref.current=element;
   if(!committed.has(p.src)){committed.add(p.src);onCommit?.(p,element);}
  }
  return h.jsx(type,p,key);
 }
 const mod=compileModule('../components/AcademyImage.tsx',{imports:{react:h.React,'react/jsx-runtime':{...h,jsx,jsxs:jsx},'../lib/image-manifest.json':{default:{'/saved.jpg':{src:'/optimized/saved.webp',variants:[{src:'/optimized/saved.webp',width:480}]}}},'./WebsiteContent':{useWebsiteContent:()=>({images:[]})},'../lib/api':{portalMediaUrl:x=>x},'../lib/useHydrated':{useHydrated:()=>true},'../lib/imageSources':sources},globals:{...browserGlobals(),...h.globals}});
 h.mount(()=>mod.default(actualProps));
 return{...h,element,props:()=>h.tree.props,
  async error(){h.tree.props.onError({currentTarget:element});await h.settle();},
  async load(){element.complete=true;element.naturalWidth=480;element.naturalHeight=320;h.tree.props.onLoad({currentTarget:element});await h.settle();},
  update(p){actualProps=p;h.render();},h};
}
test('broken optimized variant falls back to original image before placeholder',async t=>{let caller=0;const f=imageFixture({src:'/saved.jpg',onError:()=>caller++});t.after(()=>f.h.cleanup());await f.h.settle();assert.equal(f.props().src,'/optimized/saved.webp');await f.error();assert.equal(f.props().src,'/saved.jpg');assert.equal(f.props().srcSet,undefined);assert.equal(caller,0);});
test('transient original failure retries once, then uses safe placeholder without looping',async t=>{const f=imageFixture({src:'/unknown.jpg'});t.after(()=>f.h.cleanup());await f.h.settle();await f.error();f.h.run(300);await f.h.settle();assert.match(f.props().src,/sa_image_retry=1/);await f.error();assert.match(f.props().src,/course-placeholder/);await f.error();assert.equal(f.props()['data-image-state'],'unavailable');assert.equal(f.h.timers.size,0);});
test('changing image resets error state and cancels stale retry',async t=>{const f=imageFixture({src:'/old.jpg'});t.after(()=>f.h.cleanup());await f.h.settle();await f.error();f.update({src:'/new.jpg'});await f.h.settle();f.h.run(300);await f.h.settle();assert.equal(f.props().src,'/new.jpg');assert.equal(f.h.timers.size,0);});
test('already complete image is synchronized after hydration without another native load event',async t=>{
 let loads=0;const f=imageFixture({src:'/cached.jpg',onLoad:()=>loads++},(_p,image)=>{image.complete=true;image.naturalWidth=1600;image.naturalHeight=1000;});
 t.after(()=>f.h.cleanup());await f.h.settle();assert.equal(f.props()['data-image-state'],'loaded');assert.equal(f.props().src,'/cached.jpg');assert.equal(loads,0);
});
test('cached load before the initial passive effect stays loaded and calls the caller once',async t=>{
 let loads=0;const f=imageFixture({src:'/early.jpg',onLoad:()=>loads++},(p,image)=>{image.complete=true;image.naturalWidth=1600;image.naturalHeight=1000;p.onLoad({currentTarget:image});});
 t.after(()=>f.h.cleanup());await f.h.settle();assert.equal(f.props()['data-image-state'],'loaded');assert.equal(loads,1);
});
test('cached source change is loaded before its effect while a cold source and stale event stay pending',async t=>{
 const cached=new Set(['/first.jpg','/second.jpg']);
 const f=imageFixture({src:'/first.jpg'},(p,image)=>{if(cached.has(p.src)){image.complete=true;image.naturalWidth=1600;image.naturalHeight=1000;p.onLoad({currentTarget:image});}});
 t.after(()=>f.h.cleanup());await f.h.settle();assert.equal(f.props()['data-image-state'],'loaded');
 f.update({src:'/second.jpg'});await f.h.settle();assert.equal(f.props().src,'/second.jpg');assert.equal(f.props()['data-image-state'],'loaded');
 const staleLoad=f.props().onLoad;f.update({src:'/cold.jpg'});await f.h.settle();
 assert.equal(f.props()['data-image-state'],'loading');staleLoad({currentTarget:f.element});await f.h.settle();assert.equal(f.props()['data-image-state'],'loading');assert.equal(f.props().src,'/cold.jpg');
 await f.load();assert.equal(f.props()['data-image-state'],'loaded');
});
test('optimized failure before the passive effect keeps the original fallback through its successful load',async t=>{
 const f=imageFixture({src:'/saved.jpg'},(p,image)=>{if(p.src==='/optimized/saved.webp')p.onError({currentTarget:image});});
 t.after(()=>f.h.cleanup());await f.h.settle();assert.equal(f.props().src,'/saved.jpg');assert.equal(f.props().srcSet,undefined);
 await f.load();assert.equal(f.props()['data-image-state'],'loaded');assert.equal(f.props().src,'/saved.jpg');assert.equal(f.props().srcSet,undefined);
});
test('original failure before the passive effect keeps its one retry and successful retry source',async t=>{
 const f=imageFixture({src:'/early-retry.jpg',srcSet:'/early-retry.jpg 1x'},(p,image)=>{if(p.src==='/early-retry.jpg')p.onError({currentTarget:image});});
 t.after(()=>f.h.cleanup());await f.h.settle();assert.equal(f.props().srcSet,undefined);
 f.h.run(300);await f.h.settle();const retry=f.props().src;assert.match(retry,/sa_image_retry=1/);
 await f.load();assert.equal(f.props()['data-image-state'],'loaded');assert.equal(f.props().src,retry);assert.equal(f.h.timers.size,0);
});
