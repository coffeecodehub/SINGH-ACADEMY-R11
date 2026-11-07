import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'?[t,...nodes(t.props?.children)]:[];

for(const pathname of ['/academy','/courses','/courses/mediation','/sections','/sections/mediation'])test('Academy Plans is the only catalog menu and stays active at '+pathname,t=>{
 const h=hookHarness(),b=browserGlobals(),Header=compileModule('../components/SiteHeader.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'next/link':{default:'a'},'next/navigation':{usePathname:()=>pathname},'./AcademyImage':{},'./auth/AuthProvider':{useAuth:()=>({user:{id:'one',name:'Learner',role:'student'},ready:true})},'../lib/pagePolicy':{loginDestination:path=>path},'../lib/useHydrated':{useHydrated:()=>true}},globals:{...b,...h.globals}}).default;
 t.after(()=>h.cleanup());h.mount(()=>Header({}));const nav=nodes(h.tree).find(node=>node.type==='nav'),links=nodes(nav).filter(node=>node.type==='a');
 const catalog=links.filter(link=>link.props.children==='Academy Plans');assert.equal(catalog.length,1);assert.equal(catalog[0].props.href,'/academy');assert.equal(catalog[0].props.className,'navActive');assert.equal(links.some(link=>['Courses','Sections'].includes(link.props.children)),false);
});
test('footer routes learning discovery to Academy Plans while keeping enrolled learning available',async t=>{
 const h=hookHarness(),b=browserGlobals(),Footer=compileModule('../components/layout/SiteFooter.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'next/link':{default:'a'},'../WebsiteContent':{useWebsiteContent:()=>({}),websiteText:(_w,_k,fallback)=>fallback},'../AcademyImage':{},'../content/PageSections':{},'../cms/socialIcons':{socialIcons:{}},'../auth/AuthProvider':{useAuth:()=>({user:{id:'one'},ready:true})},'../../lib/publicSiteContent':{getPublicSiteContent:async()=>({footerSocial:{}})}},globals:{...b,...h.globals}}).default;
 t.after(()=>h.cleanup());h.mount(()=>Footer());await h.settle();const links=nodes(h.tree).filter(node=>node.type==='a');
 assert.ok(links.some(link=>link.props.href==='/academy'&&link.props.children==='Academy Plans'));assert.ok(links.some(link=>link.props.href==='/my-course'));assert.equal(links.some(link=>['/courses','/sections'].includes(link.props.href)),false);
});
