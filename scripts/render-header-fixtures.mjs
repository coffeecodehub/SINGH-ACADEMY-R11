/** Render the actual SiteHeader JSX with controlled hook/auth state for CSS browser QA.
 * This fixture is NOT a running Next.js app and does not substitute for end-to-end tests. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compileModule,browserGlobals} from '../frontend/test/compile.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.argv[2]||path.join(root,'qa/v60.8/header-fixtures');fs.mkdirSync(output,{recursive:true});
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function html(node){
 if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(html).join('');if(typeof node!=='object')return escape(node);
 if(typeof node.type==='function')return html(node.type(node.props));
 const {children,...props}=node.props||{},tag=node.type;
 if(tag==='Fragment'||tag==null)return html(children);
 const attrs=Object.entries(props).filter(([k,v])=>!['key','ref'].includes(k)&&!/^on/.test(k)&&v!=null&&typeof v!=='object'&&(typeof v!=='boolean'||v||k.startsWith('aria-'))).map(([k,v])=>`${k==='className'?'class':k}="${escape(v)}"`).join(' ');
 if(['img','input','br','hr'].includes(tag))return `<${tag} ${attrs}>`;
 return `<${tag} ${attrs}>${html(children)}</${tag}>`;
}
for(const userName of ['guest','Jinjua','AlexandriaWithAnExceptionallyLongName'])for(const open of [false,true]){
 let stateIndex=0;const jsx=(type,props)=>({type,props});
 const Link=({children,...props})=>jsx('a',{...props,children});
 const module=compileModule('../components/SiteHeader.tsx',{imports:{
  react:{useState:()=>[stateIndex++===0?open:stateIndex===2?false:'',()=>{}],useEffect:()=>{},useRef:()=>({current:null})},
  'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'next/link':{default:Link},
  'next/navigation':{usePathname:()=>'/billing',useRouter:()=>({replace(){},refresh(){}})},
  './AcademyImage':{default:props=>jsx('img',props)},
  '../lib/pagePolicy':compileModule('../lib/pagePolicy.ts'),
  '../lib/useHydrated':{useHydrated:()=>true},
  './auth/AuthProvider':{useAuth:()=>({ready:true,signingOut:false,user:userName==='guest'?null:{id:'test-user',role:'student',name:userName},logout:async()=>{}})}
 },globals:browserGlobals()});
 const markup=html(module.default({}));
 const file=`${userName}-${open?'open':'closed'}.html`;
 fs.writeFileSync(path.join(output,file),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><title>Actual header JSX / controlled state</title></head><body>${markup}<main class="contentWrap"><h1>Layout test only</h1><p>Actual component markup and stylesheet. No Next.js server or live account.</p></main></body></html>`);
}
console.log('Header fixtures written:',output);
