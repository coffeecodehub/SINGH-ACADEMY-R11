import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
import {createRequire} from 'node:module';
const gate=compileModule('../lib/playerFrameGate.ts'),video=compileModule('../lib/video.ts'),reviews=compileModule('../lib/videoReviews.ts',{imports:{'./video':video}});
test('only an explicitly prioritized review poster is present before JavaScript hydration',()=>{
 const require=createRequire(import.meta.url),React=require('react'),{renderToString}=require('react-dom/server');
 const Player=compileModule('../components/video-reviews/ReviewVideo.tsx',{imports:{react:React,'react/jsx-runtime':require('react/jsx-runtime'),'../../lib/playerFrameGate':gate,'../../lib/videoReviews':reviews}}).default;
 for(const priorityPoster of [false,true]){
  const html=renderToString(React.createElement(Player,{url:'/api/media/'+'a'.repeat(24),title:'Public review',preview:true,priorityPoster}));
  assert.equal(html.includes('class="videoReviewPoster"'),priorityPoster);
  if(priorityPoster){assert.match(html,/fetchPriority="high"/);assert.match(html,/poster=1/);}
  assert.doesNotMatch(html,/<video|<iframe/,'media still waits for the existing viewport gate');
 }
});
function nodes(tree,type){if(!tree||typeof tree!=='object')return[];return[...(tree.type===type?[tree]:[]),...[tree.props?.children].flat(Infinity).flatMap(value=>nodes(value,type))];}
async function fixture(url,{near=true,rendition,seconds=15,omitPreview=false,reducedMotion=false}={}){
 const h=hookHarness(),b=browserGlobals(),observers=[],commands=[],wrapper={};
 let selectedRendition=rendition;
 b.window.matchMedia=()=>({matches:reducedMotion,addEventListener(){},removeEventListener(){}});
 class Observer{constructor(callback,options){this.callback=callback;this.options=options;observers.push(this);}observe(){}disconnect(){}emit(isIntersecting){this.callback([{target:wrapper,isIntersecting}]);}}
 const mod=compileModule('../components/video-reviews/ReviewVideo.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../../lib/playerFrameGate':gate,'../../lib/videoReviews':reviews,'../feedback/FeedbackNotice':{default:'notice'}},globals:{...b,...h.globals,IntersectionObserver:Observer}});
 h.mount(()=>mod.default({url,title:'Public review',...(!omitPreview?{preview:true}:{}),seconds,previewRendition:selectedRendition}));h.tree.props.ref.current=wrapper;await h.settle();if(near){observers.findLast(item=>item.options.threshold===0.05)?.emit(true);observers.find(item=>item.options.rootMargin)?.emit(true);await h.settle();}
 const visibility=()=>observers.findLast(item=>item.options.threshold===0.05);
 return{h,b,commands,visibility,nodes:type=>nodes(h.tree,type),async rendition(value){selectedRendition=value;h.render();await h.settle();},async approach(){observers.find(item=>item.options.rootMargin)?.emit(true);await h.settle();},async visible(value){visibility().emit(value);await h.settle();},async hidden(value){b.document.visibilityState=value?'hidden':'visible';b.document.dispatchEvent(new Event('visibilitychange'));await h.settle();}};
}
for(const url of ['/api/media/'+'a'.repeat(24),'https://youtu.be/abcdefghijk'])test('offscreen review defers its poster and media until the existing viewport preparation margin: '+url,async t=>{
 const f=await fixture(url,{near:false});t.after(()=>f.h.cleanup());
 assert.equal(f.nodes('img').length,0);assert.equal(f.nodes('video').length,0);assert.equal(f.nodes('iframe').length,0);
 await f.approach();assert.equal(f.nodes('img').length,1);
 if(url.startsWith('/')){assert.equal(f.nodes('video').length,1);assert.equal(f.nodes('video')[0].props.autoPlay,false,'nearby native preparation must not start an offscreen preview');}
 else{assert.equal(f.nodes('iframe').length,0,'a provider URL must not be pinned paused before visibility is known');await f.visible(true);assert.equal(new URL(f.nodes('iframe')[0].props.src).searchParams.get('autoplay'),'1');}
});
test('a default native player is a muted inline teaser and legacy ten-second values loop at fifteen seconds',async t=>{
 const f=await fixture('/media/review.mp4',{seconds:10,omitPreview:true});t.after(()=>f.h.cleanup());const player=f.nodes('video')[0],target={currentTime:14.9,play:async()=>{}};
 assert.equal(player.props.muted,true);assert.equal(player.props.playsInline,true);assert.equal(player.props.autoPlay,true);assert.equal(player.props.controls,false);assert.equal(player.props.loop,true);
 player.props.onTimeUpdate({currentTarget:target});assert.equal(target.currentTime,14.9);target.currentTime=15.01;player.props.onTimeUpdate({currentTarget:target});assert.equal(target.currentTime,0);
});
test('native review exposes poster + optimized preview and pauses/resumes across viewport and tab changes',async t=>{
 const f=await fixture('/api/media/'+'a'.repeat(24));t.after(()=>f.h.cleanup());let plays=0,pauses=0;const node=f.nodes('video')[0],native={play:async()=>{plays++;},pause:()=>{pauses++;},muted:false};node.props.ref.current=native;
 assert.equal(node.props.poster,'/api/media/'+'a'.repeat(24)+'?poster=1');assert.equal(node.props.src,'/api/media/'+'a'.repeat(24)+'?preview=1&rendition='+'a'.repeat(24));assert.equal(node.props.preload,'auto');assert.equal(node.props.muted,true);assert.equal(node.props.loop,true);assert.equal(node.props.playsInline,true);assert.equal(f.nodes('img')[0].props.width,960);
 await f.visible(false);assert.equal(pauses,1);assert.equal(f.nodes('video')[0].props.autoPlay,false);assert.equal(f.nodes('video')[0].props.preload,'metadata');
 await f.visible(true);assert.equal(plays,1);await f.hidden(true);assert.equal(pauses,2);await f.hidden(false);assert.equal(plays,2);assert.equal(native.muted,true);
});
test('a prepared review uses its DTO-selected rendition without changing the original URL or player settings',async t=>{
 const id='a'.repeat(24),rendition='b'.repeat(24),f=await fixture('/api/media/'+id,{rendition});t.after(()=>f.h.cleanup());const node=f.nodes('video')[0];
 assert.equal(node.props.src,'/api/media/'+id+'?preview=1&rendition='+rendition);assert.equal(node.props.poster,'/api/media/'+id+'?poster=1');assert.equal(node.props.muted,true);assert.equal(node.props.controls,false);assert.equal(node.props.loop,true);
});
test('a refreshed native rendition clears a stale startup failure without playing while its document is hidden',async t=>{
 const id='a'.repeat(24),rendition='b'.repeat(24),f=await fixture('/api/media/'+id);t.after(()=>f.h.cleanup());let plays=0,reject=true;
 const native={currentTime:0,muted:false,play:()=>{plays++;return reject?Promise.reject(Error('autoplay blocked')):Promise.resolve();},pause(){}};
 let node=f.nodes('video')[0];node.props.ref.current=native;node.props.onPlaying();await f.h.settle();assert.equal(f.nodes('img').length,0);
 node=f.nodes('video')[0];node.props.onLoadedMetadata({currentTarget:native});node.props.onError();await f.h.settle();assert.equal(plays,1);assert.equal(f.nodes('notice').length,1);assert.equal(f.nodes('notice')[0].props.variant,'warning');assert.ok(f.nodes('notice')[0].props.children.includes('Open the full review to retry.'));
 await f.hidden(true);await f.rendition(rendition);node=f.nodes('video')[0];
 assert.equal(node.props.src,'/api/media/'+id+'?preview=1&rendition='+rendition);assert.equal(f.nodes('notice').length,0);assert.equal(f.nodes('img').length,1);assert.equal(node.props.autoPlay,false);
 reject=false;node.props.onLoadedMetadata({currentTarget:native});await f.h.settle();assert.equal(plays,1,'metadata from the new rendition must not play a hidden preview');
 await f.hidden(false);assert.equal(plays,2);f.nodes('video')[0].props.onPlaying();await f.h.settle();assert.equal(f.nodes('img').length,0);assert.equal(f.nodes('video')[0].props.muted,true);
});
test('a ready provider honors offscreen pause without replacing its iframe',async t=>{
 const f=await fixture('https://youtu.be/abcdefghijk');t.after(()=>f.h.cleanup());const node=f.nodes('iframe')[0],src=node.props.src,element={src,isConnected:true,contentDocument:null,contentWindow:{postMessage:(body,origin)=>f.commands.push({body:JSON.parse(body),origin})}};node.props.ref.current=element;node.props.onLoad({currentTarget:element});await f.h.settle();
 const ready=new Event('message');Object.assign(ready,{origin:'https://www.youtube-nocookie.com',source:element.contentWindow,data:{event:'onReady'}});f.b.window.dispatchEvent(ready);await f.h.settle();f.commands.length=0;await f.visible(false);
 assert.ok(f.commands.some(command=>command.body.func==='pauseVideo'));assert.equal(f.commands.some(command=>command.body.func==='playVideo'),false);assert.equal(f.nodes('iframe')[0].props.src,src);
 await f.visible(true);assert.ok(f.commands.some(command=>command.body.func==='playVideo'));await f.hidden(true);assert.equal(f.nodes('iframe')[0].props.src,src);
});
test('an unready provider starts from a visible autoplay URL and detaches offscreen without accepting stale readiness',async t=>{
 const f=await fixture('https://youtu.be/abcdefghijk',{near:false});t.after(()=>f.h.cleanup());await f.approach();assert.equal(f.nodes('iframe').length,0);
 await f.visible(true);const node=f.nodes('iframe')[0],src=node.props.src,element={src,isConnected:true,contentDocument:null,contentWindow:{postMessage:(body,origin)=>f.commands.push({body:JSON.parse(body),origin})}};assert.equal(new URL(src).searchParams.get('autoplay'),'1');node.props.ref.current=element;node.props.onLoad({currentTarget:element});await f.h.settle();
 await f.visible(false);assert.equal(f.nodes('iframe').length,0);element.isConnected=false;node.props.ref.current=null;
 const stale=new Event('message');Object.assign(stale,{origin:'https://www.youtube-nocookie.com',source:element.contentWindow,data:{event:'onReady'}});f.b.window.dispatchEvent(stale);await f.h.settle();assert.equal(f.commands.some(command=>command.body.func==='playVideo'),false);assert.equal(f.nodes('iframe').length,0);
 await f.visible(true);assert.equal(f.nodes('iframe')[0].props.src,src);assert.equal(new URL(src).searchParams.get('mute'),'1');
});
test('playback helper accepts only canonical uploaded media and retains portal authorization',()=>{
 const id='1'.repeat(24);assert.equal(reviews.reviewPlaybackUrl('/api/media/'+id+'?portal=super_admin','poster'),'/api/media/'+id+'?portal=super_admin&poster=1');assert.equal(reviews.reviewPlaybackUrl('https://evil.invalid/x','poster'),undefined);assert.equal(reviews.reviewPlaybackUrl('/api/media/'+id+'?download=1','poster'),undefined);
 const rendition='2'.repeat(24);assert.equal(reviews.reviewPlaybackUrl('/api/media/'+id+'?portal=super_admin','preview',rendition),'/api/media/'+id+'?portal=super_admin&preview=1&rendition='+rendition);assert.equal(reviews.reviewPlaybackUrl('/api/media/'+id,'preview','../private'),'/api/media/'+id+'?preview=1&rendition='+id);
});

for(const url of ['/media/review.mp4','https://youtu.be/abcdefghijk'])test('visible reviews autoplay even when the OS reduces animation: '+url,async t=>{
 const f=await fixture(url,{reducedMotion:true});t.after(()=>f.h.cleanup());
 if(url.startsWith('/'))assert.equal(f.nodes('video')[0].props.autoPlay,true);
 else{assert.equal(f.nodes('iframe').length,1);assert.equal(new URL(f.nodes('iframe')[0].props.src).searchParams.get('autoplay'),'1');}
});
