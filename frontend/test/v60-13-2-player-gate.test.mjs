import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const playerGate=compileModule('../lib/playerFrameGate.ts');
const videos=compileModule('../lib/video.ts');

function gateFixture(origin='https://player.vimeo.com'){
 const calls=[];
 const element={src:origin+'/video/123456789',isConnected:true,contentDocument:{URL:'about:blank'},contentWindow:{postMessage:(body,target)=>calls.push({body:JSON.parse(body),target})}};
 const ref={current:element},gate=playerGate.createPlayerFrameGate(ref,origin);
 return {element,ref,gate,calls,load(){element.contentDocument=null;return gate.markLoaded(element);}};
}
test('new iframe inherits academy origin: neither a fake load nor a send opens its gate',()=>{
 const f=gateFixture();assert.equal(f.gate.markLoaded(f.element),false);assert.equal(f.gate.send({method:'ping'}),false);assert.equal(f.calls.length,0);
});
test('cross-origin document alone is not enough: wait for a load/verified readiness event',()=>{
 const f=gateFixture();f.element.contentDocument=null;assert.equal(f.gate.send({method:'ping'}),false);
 assert.equal(f.load(),true);assert.equal(f.gate.send({method:'ping'}),true);assert.deepEqual(f.calls,[{body:{method:'ping'},target:'https://player.vimeo.com'}]);
});
test('ready messages require both exact provider origin and current frame identity',()=>{
 const f=gateFixture();f.load();
 assert.equal(f.gate.matchesMessage({origin:'https://player.vimeo.com',source:f.element.contentWindow}),true);
 assert.equal(f.gate.matchesMessage({origin:'https://player.vimeo.com.evil.invalid',source:f.element.contentWindow}),false);
 assert.equal(f.gate.matchesMessage({origin:'https://player.vimeo.com',source:{}}),false);
});
test('a removed or newly replaced iframe cannot reuse the old loaded gate',()=>{
 const f=gateFixture();f.load();f.element.isConnected=false;assert.equal(f.gate.send({method:'play'}),false);
 const next={...f.element,isConnected:true,contentWindow:{postMessage(){throw Error('uncommitted frame received a command');}}};f.ref.current=next;
 assert.equal(f.gate.send({method:'play'}),false);assert.equal(f.gate.markLoaded(f.element),false);
});
test('provider frame returning to a readable same-origin document stops receiving commands',()=>{
 const f=gateFixture();f.load();f.element.contentDocument={URL:'about:blank'};assert.equal(f.gate.send({method:'play'}),false);assert.equal(f.calls.length,0);
});
test('Instagram and arbitrary origins do not use Vimeo/YouTube control messages',()=>{
 for(const origin of ['https://www.instagram.com','https://attacker.invalid','*']){const f=gateFixture(origin);assert.equal(f.load(),false);assert.equal(f.gate.send({method:'play'}),false);}
});

function nodes(t,type){if(!t||typeof t!=='object')return[];return[...(t.type===type?[t]:[]),...[t.props?.children].flat(Infinity).flatMap(x=>nodes(x,type))];}
function mediaFixture(){
 const h=hookHarness(),b=browserGlobals(),messages=[];let props={url:'https://vimeo.com/123456789#t=30s',poster:'/poster.jpg'};
 const mod=compileModule('../components/learning/LessonMedia.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../AcademyImage':{default:()=>null},'../../lib/api':{portalMediaUrl:x=>x},'../../lib/video':videos,'../../lib/playerFrameGate':playerGate},globals:{...b,...h.globals}});
 h.mount(()=>mod.default(props));
 const find=type=>nodes(h.tree,type)[0];
 function attach(){const jsx=find('iframe'),target={postMessage:(body,origin)=>messages.push({body:JSON.parse(body),origin})};const frame={contentWindow:target,isConnected:true,contentDocument:{URL:'about:blank'},src:jsx.props.src};jsx.props.ref.current=frame;return frame;}
 let element=attach();
 return {h,b,messages,find,get element(){return element;},async load(){element.contentDocument=null;find('iframe').props.onLoad({currentTarget:element});await h.settle();},async ready(){const e=new Event('message');Object.assign(e,{source:element.contentWindow,origin:'https://player.vimeo.com',data:{event:'ready'}});b.window.dispatchEvent(e);await h.settle();},async replace(url){element.isConnected=false;find('iframe').props.ref.current=null;props={...props,url};h.render();await h.settle();element=attach();}};
}
test('actual media callbacks send zero messages before slow document commit, including early Play',async t=>{
 const f=mediaFixture();t.after(()=>f.h.cleanup());await f.h.settle();
 f.find('button').props.onClick();await f.h.settle();for(let i=0;i<30;i++)f.h.run(500);
 assert.equal(f.messages.length,0);assert.equal([...f.h.timers.values()].some(timer=>timer.repeat),false);
 await f.load();assert.equal(f.messages.filter(m=>m.body.method==='ping').length,1);assert.equal(f.messages.filter(m=>m.body.method==='play').length,0);
 await f.ready();await f.ready();assert.equal(f.messages.filter(m=>m.body.method==='play').length,1);assert.ok(f.messages.every(m=>m.origin==='https://player.vimeo.com'));
});
test('lesson replacement cancels old handshake timers and never plays the new lesson automatically',async t=>{
 const f=mediaFixture();t.after(()=>f.h.cleanup());await f.h.settle();await f.load();
 f.find('button').props.onClick();await f.h.settle();await f.ready();const played=f.messages.filter(m=>m.body.method==='play').length;
 await f.replace('https://vimeo.com/987654321#t=40s');const before=f.messages.length;
 for(let i=0;i<20;i++)f.h.run(500);assert.equal(f.messages.length,before);
 await f.load();await f.ready();assert.equal(f.messages.filter(m=>m.body.method==='play').length,played);assert.match(f.find('iframe').props.src,/#t=0s$/);
});
test('retry creates a fresh frame; old document permission cannot send into its about:blank',async t=>{
 const f=mediaFixture();t.after(()=>f.h.cleanup());await f.h.settle();await f.load();f.find('button').props.onClick();await f.h.settle();
 f.h.run(12000);await f.h.settle();const retry=nodes(f.h.tree,'button').find(n=>n.props.children==='Retry player');assert.ok(retry);
 const old=f.element;retry.props.onClick();await f.h.settle();const before=f.messages.length;
 // Real React replaces the keyed iframe; an unbound/old ref must be unusable.
 f.find('iframe').props.ref.current={...old,contentDocument:{URL:'about:blank'}};for(let i=0;i<20;i++)f.h.run(500);assert.equal(f.messages.length,before);
});
function landingPreviewFixture(){
 const h=hookHarness(),b=browserGlobals(),member={_id:'e'.repeat(24),name:'Preview Faculty',role:'Faculty',bio:'Saved public biography',image:'/faculty.jpg'};
 // This fixture runs the actual landing effects. Model the browser's media
 // query object, including its change-listener lifecycle, for normal motion.
 const motionPreference=Object.assign(new EventTarget(),{matches:false,media:'(prefers-reduced-motion: reduce)'});
 b.window.matchMedia=query=>{assert.equal(query,motionPreference.media);return motionPreference;};
 class HTMLElement {}
 const component=compileModule('../app/page.tsx',{imports:{
  react:h.React,'react/jsx-runtime':h,'next/link':{default:'a'},'next/navigation':{useRouter:()=>({})},
  '../components/WebsiteContent':{useWebsiteContent:()=>({}),websiteText:(_content,_key,fallback)=>fallback},
  '../lib/imageSources':compileModule('../lib/imageSources.ts'),'../lib/learningPhotos':compileModule('../lib/learningPhotos.ts'),'../components/AcademyImage':{default:'img'},'../components/ApiLoadError':{default:()=>null},
  '../components/content/PageSections':{default:()=>null},'../components/content/FounderProfile':{default:()=>null},'../components/content/GlobalLearningGallery':{default:()=>null},
  '../components/video-reviews/VideoReviews':{default:()=>null},
  '../components/catalog/CatalogCard':{default:()=>null},
  '../components/auth/LandingAuthGate':{default:()=>null},'../components/SiteHeader':{default:()=>null},'../components/layout/SiteFooter':{default:()=>null},
  '../lib/usePublicResource':{usePublicResource:(path,field)=>{assert.equal(path,'/content/landing');return{data:field==='team'?[member]:[],loading:false,error:'',retry(){}};}},
  '../lib/api':{apiFetch:()=>{throw Error('Preview must not fetch private data');}},
 },globals:{...b,...h.globals,HTMLElement}});
 h.mount(()=>component.default());return {h,b,member,buttons:()=>nodes(h.tree,'button'),modal:()=>nodes(h.tree,'section').find(n=>n.props.role==='dialog')};
}
test('existing landing card opens saved public member preview with protected full-team link',async t=>{
 const f=landingPreviewFixture();t.after(()=>f.h.cleanup());assert.equal(f.modal(),undefined);
 const card=f.buttons().find(n=>n.props.className==='teamCard');assert.equal(card.props.type,'button');card.props.onClick();await f.h.settle();
 assert.equal(f.modal().props['aria-modal'],'true');assert.ok(JSON.stringify(f.modal()).includes(f.member.bio));
 assert.equal(nodes(f.modal(),'a').find(n=>n.props.children==='Full faculty profile →').props.href,'/team');
 const close=f.buttons().find(n=>n.props['aria-label']==='Close team preview');assert.equal(close.props.type,'button');close.props.onClick();await f.h.settle();assert.equal(f.modal(),undefined);
});
test('Escape dismisses landing preview without navigation or changing account state',async t=>{
 const f=landingPreviewFixture();t.after(()=>f.h.cleanup());f.buttons().find(n=>n.props.className==='teamCard').props.onClick();await f.h.settle();
 const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:'Escape'});f.b.document.dispatchEvent(event);await f.h.settle();
 assert.equal(event.defaultPrevented,true);assert.equal(f.modal(),undefined);
});

test('landing marquee images are eager for both moving tracks before a pointer event',t=>{
 const f=landingPreviewFixture();t.after(()=>f.h.cleanup());
 const cards=f.buttons().filter(n=>n.props.className==='teamCard');assert.ok(cards.length>=2);
 for(const card of cards){const image=nodes(card,'img')[0];assert.equal(image.props.loading,'eager');assert.match(image.props.sizes,/290px$/);}
 assert.equal(f.modal(),undefined);
});
