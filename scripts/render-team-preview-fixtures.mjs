/** Isolated native-browser fixture from the actual landing JSX and unchanged CSS.
 * Controlled resources/hooks and a DOM event bridge; NOT the Next/React E2E app.
 * The full application tests are still run by npm run verify:release.
 */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compileModule,browserGlobals} from '../frontend/test/compile.mjs';
import {hookHarness} from '../frontend/test/hooks.mjs';
import {CATALOG_PHOTO_PATH,catalogPhotoResponse} from '../frontend/ui-tests/helpers/catalog-photo-fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.argv[2]||path.join(root,'qa/v60.13.3/team-native-fixtures');fs.mkdirSync(output,{recursive:true});
const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const image='data:image/png;base64,'+catalogPhotoResponse('http://fixture.local'+CATALOG_PHOTO_PATH+'?w=480').body.toString('base64');
function html(node){
 if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(html).join('');if(typeof node!=='object')return esc(node);
 if(typeof node.type==='function')return html(node.type(node.props));
 const {children,...props}=node.props||{},tag=node.type;
 if(!tag||tag==='Fragment')return html(children);
 const attrs=Object.entries(props).filter(([k,v])=>!['key','ref'].includes(k)&&!/^on/.test(k)&&v!=null&&typeof v!=='object'&&(typeof v!=='boolean'||v||k.startsWith('aria-')))
 .map(([k,v])=>`${k==='className'?'class':k}="${esc(tag==='img'&&k==='src'?image:v)}"`).join(' ');
 return ['img','input','hr','br','meta'].includes(tag)?`<${tag} ${attrs}>`:`<${tag} ${attrs}>${html(children)}</${tag}>`;
}
function nodes(tree,type){if(!tree||typeof tree!=='object')return [];return [...(tree.type===type?[tree]:[]),...[tree.props?.children].flat(Infinity).flatMap(n=>nodes(n,type))];}
for(const count of [1,17]){
 const h=hookHarness(),b=browserGlobals();
 const members=Array.from({length:count},(_,i)=>({_id:String(i+1).padStart(24,'a'),name:`Preview Faculty ${i+1}`,role:'Faculty',bio:`Saved public faculty biography ${i+1}.`,image:'/fixture.png'}));
 const component=compileModule('../app/page.tsx',{imports:{
  react:h.React,'react/jsx-runtime':h,'next/link':{default:'a'},'next/navigation':{useRouter:()=>({})},
  '../components/WebsiteContent':{useWebsiteContent:()=>({}),websiteText:(_c,_k,f)=>f},
  '../components/AcademyImage':{default:'img'},'../components/ApiLoadError':{default:()=>null},
  '../components/content/FounderProfile':{default:()=>null},'../components/content/GlobalLearningGallery':{default:()=>null},
  '../components/video-reviews/VideoReviews':{default:()=>null},
  '../components/auth/LandingAuthGate':{default:()=>null},'../components/SiteHeader':{default:()=>null},'../components/layout/SiteFooter':{default:()=>null},
  '../lib/usePublicResource':{usePublicResource:(_p,f)=>({data:f==='team'?members:[],loading:false,error:'',retry(){}})},
  '../lib/api':{apiFetch:()=>{throw Error('Unexpected private data request in native fixture');}},
 },globals:{...b,...h.globals,HTMLElement:class {}}});
 h.mount(()=>component.default());await h.settle();const base=html(h.tree),modals={};
 for(const member of members){
  const card=nodes(h.tree,'button').find(n=>n.props.className==='teamCard'&&nodes(n,'h3')[0]?.props.children===member.name);
  card.props.onClick();await h.settle();const backdrop=nodes(h.tree,'div').find(n=>n.props.className==='modalBackdrop');
  modals[member.name]=html(backdrop);
 }
 h.cleanup();
 const bridge=`const modals=${JSON.stringify(modals)};window.clickEvidence=[];let previous=null;
 function closeModal(){document.querySelector('.modalBackdrop')?.remove();previous?.focus({preventScroll:true});}
 document.addEventListener('click',event=>{const target=event.target;
  const card=target.closest('#faculty button.teamCard');if(card){window.clickEvidence.push({trusted:event.isTrusted,name:card.querySelector('h3').textContent.trim(),type:'open'});previous=card;document.body.insertAdjacentHTML('beforeend',modals[card.querySelector('h3').textContent.trim()]);document.querySelector('.modalClose')?.focus();return;}
  if(target.closest('.modalClose')||target.matches('.modalBackdrop')){window.clickEvidence.push({trusted:event.isTrusted,type:'close'});closeModal();return;}
  if(target.closest('.memberModal a')){event.preventDefault();window.clickEvidence.push({trusted:event.isTrusted,type:'profile'});history.pushState({},'', '/login?next=%2Fteam');}
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){window.clickEvidence.push({trusted:event.isTrusted,type:'escape'});closeModal();}});`;
 fs.writeFileSync(path.join(output,`team-${count}.html`),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><title>Controlled landing JSX / native input only</title></head><body>${base}<script>${bridge}</script></body></html>`);
}
fs.copyFileSync(path.join(root,'frontend/app/styles.css'),path.join(output,'styles.css'));
console.log('Actual landing JSX/CSS fixtures written (controlled DOM bridge, not Next):',output);
