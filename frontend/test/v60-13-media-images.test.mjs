import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {compileModule,browserGlobals} from './compile.mjs';import {hookHarness} from './hooks.mjs';
const sources=compileModule('../lib/imageSources.ts');
const videoSources=compileModule('../lib/video.ts');
function nodes(t,type){if(!t||typeof t!=='object')return[];return[...(t.type===type?[t]:[]),...[t.props?.children].flat(Infinity).flatMap(x=>nodes(x,type))];}
function media(url='https://vimeo.com/123456789/abcd1234#t=30s',props={}){
 const h=hookHarness(),b=browserGlobals(),messages=[];let p={url,poster:'/poster.jpg',...props};
 const component=compileModule('../components/learning/LessonMedia.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../AcademyImage':{default:()=>null},'../../lib/api':{portalMediaUrl:x=>x},'../../lib/playerFrameGate':compileModule('../lib/playerFrameGate.ts'),'../../lib/video':videoSources},globals:{...b,...h.globals}});
 h.mount(()=>component.default(p));
 const find=type=>nodes(h.tree,type)[0];const target={postMessage:(raw,origin)=>messages.push({body:JSON.parse(raw),origin})};
 const attach=()=>{const f=find('iframe');if(f&&!f.props.ref.current)f.props.ref.current={contentWindow:target,src:f.props.src,isConnected:true,contentDocument:null};return f;};attach();
 return {h,b,messages,find,target,attach,update(next){p={...p,...next};h.render();},async message(data,{source=target,origin='https://player.vimeo.com'}={}){const event=new Event('message');Object.assign(event,{data,source,origin});b.window.dispatchEvent(event);await h.settle();},text:()=>JSON.stringify(h.tree)};
}
test('both lesson and CMS iframes keep modern fullscreen without the conflicting legacy attribute',()=>{
 for(const path of ['../components/learning/LessonMedia.tsx','../components/cms/LessonEditor.tsx']){const source=fs.readFileSync(new URL(path,import.meta.url),'utf8');assert.match(source,/allow="[^"]*fullscreen/);assert.doesNotMatch(source,/allowFullScreen|allowfullscreen=/);}
});
for(const provider of ['vimeo','youtube'])test(provider+' DOM load alone is not accepted as player readiness',async t=>{
 const f=media(provider==='vimeo'?'https://vimeo.com/123456789':'https://youtu.be/abcdefghijk',{poster:''});t.after(()=>f.h.cleanup());await f.h.settle();f.attach().props.onLoad({currentTarget:f.attach().props.ref.current});await f.h.settle();assert.match(f.text(),/Loading video/);
 assert.ok(f.messages.some(m=>m.body.method==='ping'||m.body.event==='listening'));
 await f.message({event:provider==='vimeo'?'ready':'onReady'},{origin:provider==='vimeo'?'https://player.vimeo.com':'https://www.youtube-nocookie.com'});
 assert.doesNotMatch(f.text(),/Loading video/);
});
test('Vimeo missed-ready ping recovers without autoplay or seeking before user input',async t=>{
 const f=media();t.after(()=>f.h.cleanup());await f.h.settle();f.attach().props.onLoad({currentTarget:f.attach().props.ref.current});await f.message({method:'ping'});
 assert.equal(f.messages.filter(m=>['play','setCurrentTime'].includes(m.body.method)).length,0);
 assert.equal(f.messages.filter(m=>m.body.method==='addEventListener').length,6);
});
test('early Vimeo Play waits for readiness without reloading iframe or repeated ready playback',async t=>{
 const f=media();t.after(()=>f.h.cleanup());await f.h.settle();const initial=f.find('iframe').props.src;
 f.find('button').props.onClick();await f.h.settle();assert.equal(f.find('iframe').props.src,initial);assert.equal(f.messages.filter(m=>m.body.method==='play').length,0);
 await f.message({event:'ready'});assert.equal(f.messages.filter(m=>m.body.method==='play').length,1);
 await f.message({method:'ping'});await f.message({event:'ready'});assert.equal(f.messages.filter(m=>m.body.method==='play').length,1);
 assert.equal(f.messages.every(m=>m.origin==='https://player.vimeo.com'),true);
});
for(const kind of ['origin','source'])test('player rejects forged '+kind+' readiness messages',async t=>{
 const f=media(undefined,{poster:''});t.after(()=>f.h.cleanup());await f.h.settle();await f.message({event:'ready'},kind==='origin'?{origin:'https://attacker.invalid'}:{source:{}});assert.match(f.text(),/Loading video/);assert.equal(f.messages.length,0);
});
test('malformed provider message is ignored without crashing the course',async t=>{const f=media(undefined,{poster:''});t.after(()=>f.h.cleanup());await f.h.settle();await f.message('{bad json');await f.message(null);assert.match(f.text(),/Loading video/);});
test('provider handshake is bounded and all timers/listeners clean up with lesson',async()=>{
 const f=media();await f.h.settle();f.attach().props.onLoad({currentTarget:f.attach().props.ref.current});await f.h.settle();for(let i=0;i<40;i++)f.h.run(500);assert.equal(f.messages.length,12);assert.equal([...f.h.timers.values()].some(t=>t.repeat),false);f.h.cleanup();const before=f.messages.length;await f.message({event:'ready'});assert.equal(f.messages.length,before);assert.equal(f.h.timers.size,0);
});
test('changing lesson source forgets previous play intent and readiness',async t=>{
 const f=media();t.after(()=>f.h.cleanup());await f.h.settle();f.find('button').props.onClick();await f.h.settle();await f.message({event:'ready'});f.find('iframe').props.ref.current=null;f.update({url:'https://vimeo.com/987654321#t=45s'});await f.h.settle();f.attach();const playCount=f.messages.filter(m=>m.body.method==='play').length;await f.message({event:'ready'});assert.equal(f.messages.filter(m=>m.body.method==='play').length,playCount);assert.match(f.find('iframe').props.src,/#t=0s$/);assert.ok(f.find('button'));
});
test('autoplay-blocked is honest and leaves provider controls usable',async t=>{
 const f=media();t.after(()=>f.h.cleanup());await f.h.settle();f.find('button').props.onClick();await f.h.settle();await f.message({event:'ready'});await f.message({event:'error',data:{method:'play',name:'NotAllowedError'}});assert.match(f.text(),/Press Play in the video player/);assert.ok(f.find('iframe'));await f.message({event:'playing'});assert.doesNotMatch(f.text(),/Press Play|Loading video/);
});
test('buffering then bufferend updates existing video status, not the frame URL',async t=>{
 const f=media(undefined,{poster:''});t.after(()=>f.h.cleanup());await f.h.settle();const src=f.find('iframe').props.src;await f.message({event:'ready'});await f.message({event:'bufferstart'});assert.match(f.text(),/Loading video/);await f.message({event:'bufferend'});assert.doesNotMatch(f.text(),/Loading video/);assert.equal(f.find('iframe').props.src,src);
});
test('no attempt to silence provider diagnostics or re-enable deprecated unload',()=>{
 const src=fs.readFileSync(new URL('../components/learning/LessonMedia.tsx',import.meta.url),'utf8');assert.doesNotMatch(src,/console\.(?:warn|error)\s*=|unload\s*[=*]|powerPreference|requestAdapter/);
});
function warmFixture(){
 const h=hookHarness(),b=browserGlobals(),images=[];let now=1000;
 const mod=compileModule('../lib/imageWarmup.ts',{imports:{'./image-manifest.json':{default:{'/saved.jpg':{src:'/optimized/saved.webp',variants:[{src:'/optimized/saved.webp',width:480}]}}},'./imageSources':sources,'./api':{portalMediaUrl:x=>x}},globals:{...b,...h.globals,navigator:{onLine:true,connection:{saveData:false}}}});
 const warmer=mod.createImageWarmer({makeImage:()=>{const image={src:'',srcset:'',sizes:'',fetchPriority:'',decoding:'',onload:null,onerror:null};images.push(image);return image;},clock:()=>now});
 return {mod,warmer,images,h,b,advance(ms){now+=ms;},finish(){for(let i=0;i<images.length;i++)images[i].onload?.();h.cleanup();}};
}
const picture=i=>({src:'/images/courses/photo-'+i+'.jpg',sizes:sources.COURSE_CARD_SIZES});
test('image priority no longer forces full viewport sizes for course/team cards',()=>{
 for(const[name,constant]of [['../components/catalog/CatalogCard.tsx','COURSE_CARD_SIZES'],['../app/team/page.tsx','TEAM_CARD_SIZES']]){const s=fs.readFileSync(new URL(name,import.meta.url),'utf8');assert.ok(s.includes('sizes={'+constant+'}'));}
 assert.doesNotMatch(sources.COURSE_CARD_SIZES,/^100vw$/);assert.match(sources.TEAM_CARD_SIZES,/21vw/);
});
test('photo warmup uses exactly the card srcset/sizes and never blocks rendering',t=>{
 const f=warmFixture();t.after(()=>f.finish());const jobs=f.mod.catalogPictures('/courses',{courses:[{thumbnail:'/api/media/'+'a'.repeat(24)}]});assert.equal(jobs[0].sizes,sources.COURSE_CARD_SIZES);assert.equal(jobs[0].srcSet,sources.academyImageVariants('/api/media/'+'a'.repeat(24)).srcSet);
 f.warmer.warm(jobs);assert.equal(f.images.length,1);assert.equal(f.images[0].sizes,jobs[0].sizes);assert.equal(f.images[0].srcset,jobs[0].srcSet);assert.equal(f.images[0].fetchPriority,'low');
});
test('warmup deduplicates images and caps network concurrency',t=>{
 const f=warmFixture();t.after(()=>f.finish());const jobs=Array.from({length:15},(_,i)=>picture(i));f.warmer.warm(jobs);f.warmer.warm(jobs);assert.equal(f.images.length,2);assert.equal(f.warmer.stats().queued,6);f.images[0].onload();assert.equal(f.images.length,3);assert.equal(f.warmer.stats().active,2);
});
test('warmup cache is bounded and successful images are not prefetched again',t=>{
 const f=warmFixture();t.after(()=>f.finish());for(let i=0;i<30;i++){f.warmer.warm([picture(i)]);f.images.at(-1).onload();}assert.ok(f.warmer.stats().remembered<=12);const count=f.images.length;f.warmer.warm([picture(29)]);assert.equal(f.images.length,count);
});
test('foreground/account validity is rechecked before each queued photo',t=>{
 const f=warmFixture();t.after(()=>f.finish());let valid=true;f.warmer.warm([picture(1),picture(2),picture(3)],()=>valid);valid=false;f.images[0].onload();f.images[1].onload();assert.equal(f.images.length,2);assert.equal(f.warmer.stats().queued,0);
});
for(const src of ['https://external.invalid/signed.jpg','//external.invalid/a.jpg','/api/certificates/mine','/api/media/'+ 'a'.repeat(24)+'?portal=client_admin','/api/media/'+ 'a'.repeat(24)+'?download=1'])test('warmup refuses external/private/staff/download source '+src,t=>{
 const f=warmFixture();t.after(()=>f.finish());f.warmer.warm([{src,sizes:'420px'}]);assert.equal(f.images.length,0);
});
test('missing/offline/hidden context does not launch speculative images',t=>{
 const f=warmFixture();t.after(()=>f.finish());assert.equal(f.mod.canWarmCatalogImages(),true);f.b.document.visibilityState='hidden';assert.equal(f.mod.canWarmCatalogImages(),false);
});
test('first-row image list is bounded and uses the saved website replacement',t=>{
 const f=warmFixture();t.after(()=>f.finish());const items=Array.from({length:20},()=>({thumbnail:'/old.jpg',image:'/old.jpg'})),r=[{src:'/old.jpg',url:'/saved.jpg'}];
 const courses=f.mod.catalogPictures('/courses',{courses:items},r),team=f.mod.catalogPictures('/content/team',{team:items},r);assert.equal(courses.length,3);assert.equal(team.length,4);assert.equal(courses[0].src,'/optimized/saved.webp');assert.equal(team[0].sizes,sources.TEAM_CARD_SIZES);
});
test('Academy Plans sections and Events prepare their saved first-row images with the same responsive sources as cards',t=>{
 const f=warmFixture();t.after(()=>f.finish());const photo='/api/media/'+'b'.repeat(24);
 for(const [path,field,property]of [['/sections','sections','thumbnail'],['/content/events','events','image']]){
  const jobs=f.mod.catalogPictures(path,{[field]:Array.from({length:20},()=>({[property]:photo}))});
  assert.equal(jobs.length,3);assert.equal(jobs[0].sizes,sources.COURSE_CARD_SIZES);assert.equal(jobs[0].srcSet,sources.academyImageVariants(photo).srcSet);
 }
 assert.equal(f.mod.catalogPictures('/content/events',{events:[{title:'Optional image is absent'}]}).length,0,'missing optional images do not create bogus media requests');
});
test('custom page image warmup prioritizes before-introduction originals and stays within a first-row budget',t=>{
 const f=warmFixture();t.after(()=>f.finish());const jobs=f.mod.catalogPictures('/page-sections/about',{blocks:[{imageUrl:'/later.jpg',placement:'end'},{placement:'start',galleryLayout:'carousel',gallery:Array.from({length:12},(_,i)=>({imageUrl:'/first-'+i+'.jpg'}))}]});
 assert.equal(jobs.length,3);assert.equal(jobs[0].src,'/first-0.jpg');assert.equal(jobs[0].sizes,'(max-width: 760px) 85vw, 700px');
});
test('failed speculative image is not remembered as success and may retry later',t=>{
 const f=warmFixture();t.after(()=>f.finish());f.warmer.warm([picture(1)]);f.images[0].onerror();f.warmer.warm([picture(1)]);assert.equal(f.images.length,2);
});
test('timed-out speculative image is cancelled and releases its queue slot',t=>{
 const f=warmFixture();t.after(()=>f.finish());f.warmer.warm([picture(1)]);f.h.run(8000);assert.equal(f.images[0].src,'data:,');assert.equal(f.warmer.stats().active,0);
});

test('unsupported Vimeo playback is reported as unavailable, not as an autoplay permission prompt',async t=>{
 const f=media();t.after(()=>f.h.cleanup());await f.h.settle();f.find('button').props.onClick();await f.h.settle();await f.message({event:'error',data:{method:'play',name:'NotSupportedError'}});assert.match(f.text(),/Video is unavailable/);assert.doesNotMatch(f.text(),/Press Play in the video player/);
});
