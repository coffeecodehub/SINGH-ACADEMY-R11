import test from 'node:test';import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';import {hookHarness} from './hooks.mjs';
const gate=compileModule('../lib/playerFrameGate.ts'),video=compileModule('../lib/video.ts'),reviews=compileModule('../lib/videoReviews.ts',{imports:{'./video':video}});
function nodes(tree,type){if(!tree||typeof tree!=='object')return[];return[...(tree.type===type?[tree]:[]),...[tree.props?.children].flat(Infinity).flatMap(v=>nodes(v,type))];}
async function fixture(preview=true,{reduced=false,provider='tiktok'}={}){
 const url=provider==='youtube'?'https://youtu.be/abcdefghijk':provider==='vimeo'?'https://vimeo.com/123456789':'https://www.tiktok.com/@academy/video/123456789',providerOrigin=provider==='youtube'?'https://www.youtube-nocookie.com':provider==='vimeo'?'https://player.vimeo.com':'https://www.tiktok.com';
 const h=hookHarness(),b=browserGlobals(),messages=[];let props={url,title:'A public review',preview,seconds:15,paused:false},element=null,frameId=0;
 const preference=new EventTarget();Object.assign(preference,{matches:reduced});b.window.matchMedia=()=>preference;
 const mod=compileModule('../components/video-reviews/ReviewVideo.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../../lib/playerFrameGate':gate,'../../lib/videoReviews':reviews},globals:{...b,...h.globals}});
 const find=()=>nodes(h.tree,'iframe')[0];
 // React clears refs and disconnects removed frames during a real commit.
 const detach=()=>{if(element&&!find()){element.isConnected=false;attachedRef.current=null;element=null;}};let attachedRef;
 async function commit(){detach();await h.settle();detach();const node=find();if(node&&!element){const id=++frameId;element={id,src:node.props.src,isConnected:true,contentDocument:null,contentWindow:{postMessage:(body,origin)=>messages.push({body,origin,target:id})}};attachedRef=node.props.ref;attachedRef.current=element;node.props.onLoad({currentTarget:element});await h.settle();}}
 h.mount(()=>mod.default(props));await commit();
 async function message(data,{origin=providerOrigin,source=element?.contentWindow||{}}={}){const e=new Event('message');Object.assign(e,{origin,source,data});b.window.dispatchEvent(e);await commit();}
 return{h,messages,get element(){return element;},providerOrigin,message,find,async pause(){props={...props,paused:true};h.render();await commit();},async reduce(){preference.matches=true;preference.dispatchEvent(new Event('change'));await commit();},async resume(){props={...props,paused:false};preference.matches=false;preference.dispatchEvent(new Event('change'));h.render();await commit();}};
}
const readyMessage=provider=>provider==='youtube'?{event:'onReady'}:provider==='vimeo'?{event:'ready'}:{type:'onPlayerReady','x-tiktok-player':true};
const commands=messages=>messages.map(message=>typeof message.body==='string'?JSON.parse(message.body):message.body);
const isPlay=(provider,command)=>provider==='youtube'?command.func==='playVideo':provider==='vimeo'?command.method==='play':command.type==='play';
const isMute=(provider,command)=>provider==='youtube'?command.func==='mute':provider==='vimeo'?command.method==='setVolume'&&command.value===0:command.type==='mute';
const isPause=(provider,command)=>provider==='youtube'?command.func==='pauseVideo':provider==='vimeo'?command.method==='pause':command.type==='pause';
const isUnMute=(provider,command)=>provider==='youtube'?command.func==='unMute':provider==='vimeo'?command.method==='setVolume'&&command.value===1:command.type==='unMute';
test('actual TikTok review receives object commands only after exact-frame readiness, loops preview, and pauses',async t=>{
 const f=await fixture();t.after(()=>f.h.cleanup());assert.equal(f.messages.length,0);
 await f.message({type:'onPlayerReady','x-tiktok-player':true},{origin:'https://evil.invalid'});await f.message({type:'onPlayerReady','x-tiktok-player':true},{source:{}});await f.message({type:'onPlayerReady'});assert.equal(f.messages.length,0);
 await f.message({type:'onPlayerReady','x-tiktok-player':true});assert.ok(f.messages.some(m=>m.body.type==='mute'));assert.ok(f.messages.some(m=>m.body.type==='play'));assert.ok(f.messages.every(m=>typeof m.body==='object'&&m.origin==='https://www.tiktok.com'));
 await f.message({type:'onCurrentTime',value:{currentTime:16},'x-tiktok-player':true});assert.ok(f.messages.some(m=>m.body.type==='seekTo'&&m.body.value===0));await f.pause();assert.ok(f.messages.some(m=>m.body.type==='pause'));
});
test('full TikTok review playback does not seek back at the preview cutoff',async t=>{const f=await fixture(false);t.after(()=>f.h.cleanup());await f.message({type:'onPlayerReady','x-tiktok-player':true});await f.message({type:'onCurrentTime',value:{currentTime:1200},'x-tiktok-player':true});assert.ok(f.messages.some(m=>m.body.type==='unMute'));assert.equal(f.messages.some(m=>m.body.type==='seekTo'),false);});

for(const provider of ['youtube','vimeo','tiktok'])test(provider+' ready preview retains its muted autoplay source and sends one pause without replacing its frame',async t=>{
 const f=await fixture(true,{provider});t.after(()=>f.h.cleanup());const initial=f.find().props.src,url=new URL(initial),element=f.element;
 assert.equal(url.searchParams.get('autoplay'),'1');assert.equal(url.searchParams.get(provider==='youtube'?'mute':'muted'),'1');assert.equal(url.searchParams.get('loop'),'1');assert.equal(commands(f.messages).some(command=>isPlay(provider,command)),false);
 await f.message(readyMessage(provider));assert.equal(commands(f.messages).filter(command=>isMute(provider,command)).length,1);assert.equal(commands(f.messages).filter(command=>isPlay(provider,command)).length,1);
 const before=f.messages.length;await f.pause();assert.equal(f.find().props.src,initial);assert.equal(f.element,element);const sent=commands(f.messages.slice(before));assert.equal(sent.length,1);assert.equal(isPause(provider,sent[0]),true);assert.ok(f.messages.every(message=>message.origin===f.providerOrigin));
 await f.message(readyMessage(provider));assert.equal(f.messages.length,before+1,'duplicate readiness cannot repeat initialization or playback commands');
});
for(const provider of ['youtube','vimeo','tiktok'])test(provider+' reduced-animation preference does not disable automatic muted video or full playback',async t=>{
 const f=await fixture(true,{reduced:true,provider});t.after(()=>f.h.cleanup());assert.equal(new URL(f.find().props.src).searchParams.get('autoplay'),'1');assert.equal(commands(f.messages).some(command=>isPlay(provider,command)),false);await f.message(readyMessage(provider));assert.equal(commands(f.messages).filter(command=>isMute(provider,command)).length,1);assert.equal(commands(f.messages).filter(command=>isPlay(provider,command)).length,1);const frame=f.element,beforeReduce=f.messages.length;await f.reduce();assert.equal(f.element,frame);assert.equal(f.messages.length,beforeReduce);
 const full=await fixture(false,{reduced:true,provider});t.after(()=>full.h.cleanup());const url=new URL(full.find().props.src);assert.equal(url.searchParams.get('autoplay'),'1');assert.equal(url.searchParams.get(provider==='youtube'?'mute':'muted'),'0');
 const before=full.messages.length;await full.message(readyMessage(provider));const sent=commands(full.messages.slice(before));assert.equal(sent.filter(command=>isUnMute(provider,command)).length,1);assert.equal(sent.filter(command=>isPlay(provider,command)).length,1);assert.ok(full.messages.every(message=>message.origin===full.providerOrigin));
});

for(const provider of ['youtube','vimeo','tiktok'])for(const action of ['pause'])test(provider+' honors '+(action==='pause'?'a full viewer opened':'reduced motion enabled')+' before its delayed ready message',async t=>{
 const f=await fixture(true,{provider});t.after(()=>f.h.cleanup());
 const initial=f.find().props.src,url=new URL(initial),old=f.element;assert.equal(url.searchParams.get('autoplay'),'1');assert.equal(url.searchParams.get(provider==='youtube'?'mute':'muted'),'1');assert.equal(url.searchParams.get('loop'),'1');
 const before=f.messages.length;await f[action]();assert.equal(f.find(),undefined,'an unready provider is detached because it cannot acknowledge pause');assert.equal(old.isConnected,false);
 await f.message(readyMessage(provider),{origin:'https://evil.invalid',source:old.contentWindow});await f.message(readyMessage(provider),{source:old.contentWindow});assert.equal(f.messages.length,before,'neither untrusted nor detached-frame readiness may send commands');assert.equal(f.find(),undefined);
 await f.resume();assert.equal(f.find().props.src,initial,'a returning visible preview reuses its muted autoplay URL');assert.notEqual(f.element,old,'the unready detached frame must be replaced');
 const current=f.element,returned=f.messages.length;await f.message(readyMessage(provider),{source:old.contentWindow});assert.equal(f.messages.length,returned,'late readiness from the old window cannot initialize the replacement');
 await f.message(readyMessage(provider));const sent=commands(f.messages.slice(returned));assert.equal(sent.filter(command=>isMute(provider,command)).length,1);assert.equal(sent.filter(command=>isPlay(provider,command)).length,1);assert.ok(f.messages.slice(returned).every(message=>message.origin===f.providerOrigin&&message.target===current.id));
 const initialized=f.messages.length;await f.message(readyMessage(provider));assert.equal(f.messages.length,initialized,'the replacement initializes only once');
});
