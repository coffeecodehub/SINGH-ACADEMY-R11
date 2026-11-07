const inactiveCatalogAccess=()=>({scope:'fixture-owner',checking:false,unavailable:false,error:'',membershipActive:false,courseAccess:()=>null,sectionAccess:()=>null,refresh(){}});
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
import {proxyTarget} from '../lib/server/apiProxy.mjs';
const presentation=compileModule('../lib/catalogPresentation.ts');
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const plain=value=>JSON.parse(JSON.stringify(value));

test('regional display consumes only the server-selected total and preserves arbitrary duration/key',()=>{
 const offers=presentation.catalogOffers({currency:'USD',pricing:[{key:'quarter-plus',label:'Five months',price:27,durationMonths:5,countryPrices:[{country:'OTHER',price:999}]}]});
 assert.deepEqual(plain(offers),[{key:'quarter-plus',label:'Five months',price:27,durationMonths:5,currency:'USD'}]);
 assert.equal(JSON.stringify(offers).includes('OTHER'),false);
});
test('membership display uses authenticated minor-unit offers ahead of any public metadata price',()=>{
 assert.deepEqual(plain(presentation.catalogOffers({price:9999,durationMonths:1,offers:[{key:'seven',amountMinor:3500,currency:'USD',durationMonths:7,label:'Seven months'}]})),[{key:'seven',label:'Seven months',price:35,durationMonths:7,currency:'USD'}]);
 assert.equal(presentation.catalogOffers({price:9999,offers:[]}).length,0);
});
test('missing or invalid admin prices never become guessed regional prices',()=>{
 for(const product of [{},{durationMonths:1},{price:'',durationMonths:1},{pricing:[{price:5,durationMonths:0}]},{offers:[{amountMinor:100.5,durationMonths:1}]}])assert.equal(presentation.catalogOffers(product).length,0);
 assert.equal(presentation.catalogOffers({price:0,accessMonths:120})[0].price,0);
 assert.equal(presentation.catalogOffers({price:42,accessMonths:6})[0].durationMonths,6);
});
test('catalog purchase links carry identity and selected duration key, never amount or country',()=>{
 const url=new URL(presentation.catalogCheckout('section','Mediation & Leadership','five months'),'https://academy.test');
 assert.equal(url.searchParams.get('section'),'Mediation & Leadership');assert.equal(url.searchParams.get('option'),'five months');
 assert.deepEqual([...url.searchParams.keys()],['section','option']);assert.equal(new URL(presentation.catalogCheckout('membership','Academy'),'https://academy.test').searchParams.get('plan'),'Academy');
});
test('catalog keeps section-assigned courses out of the standalone group',()=>{
 const courses=[{slug:'standalone'},{slug:'also-alone',sectionSlug:''},{slug:'included',sectionSlug:'mediation'}];
 assert.deepEqual(plain(presentation.standaloneCourses(courses)).map(c=>c.slug),['standalone','also-alone']);
});
test('actual shared course and section cards retain responsive image sizes with priority',()=>{
 const h=hookHarness(),Image={},sizes=compileModule('../lib/imageSources.ts');
 const Card=compileModule('../components/catalog/CatalogCard.tsx',{imports:{'react/jsx-runtime':h,'next/link':{},'../AcademyImage':{default:Image},'../../lib/imageSources':sizes,'../../lib/money':{money:String},'./PriceOptions':{}}}).default;
 for(const kind of ['course','section']){const image=nodes(Card({product:{slug:'demo',title:'Demo'},kind,priority:true})).find(node=>node.type===Image);assert.equal(image.props.sizes,sizes.COURSE_CARD_SIZES);assert.equal(image.props.priority,true);}
});
test('Academy Plans renders section cards plus only standalone course cards',()=>{
 const h=hookHarness(),Card={};const courses=[{slug:'alone'},{slug:'inside',sectionSlug:'mediation'}],sections=[{slug:'mediation'}];
 const mod=compileModule('../app/academy/page.tsx',{imports:{'react/jsx-runtime':h,'next/link':{},'../../components/WebsiteContent':{useWebsiteContent:()=>({}),websiteText:(_w,_k,v)=>v},'../../lib/usePublicResource':{usePublicResource:path=>({data:path==='/sections'?sections:courses,loading:false,error:'',retry(){}})},'../../lib/useCatalogAccess':{useCatalogAccess:inactiveCatalogAccess},'../../lib/catalogPresentation':presentation,'../../components/ApiLoadError':{},'../../components/SiteHeader':{},'../../components/layout/SiteFooter':{},'../../components/layout/BackButton':{},'../../components/catalog/CatalogCard':{default:Card}}});
 const cards=nodes(mod.default()).filter(node=>node.type===Card);
 assert.deepEqual(cards.map(card=>[card.props.kind||'course',card.props.product.slug]),[['section','mediation'],['course','alone']]);
});
test('active section detail suppresses purchase and opens its included courses',async t=>{
 const h=hookHarness(),b=browserGlobals(),Card={},coverage={type:'section',label:'Section Access',startsAt:'2026-01-01',endsAt:null};
 const sectionCatalog=()=>({...inactiveCatalogAccess(),sectionAccess:()=>coverage,courseAccess:()=>coverage});
 const mod=compileModule('../app/sections/[slug]/page.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'next/navigation':{useParams:()=>({slug:'mediation'})},'next/link':{default:'a'},'../../../lib/api':{isAbortError:()=>false,apiFetch:async()=>({section:{slug:'mediation',title:'Mediation',price:30,accessMonths:6},courses:[{slug:'one',title:'One'}],access:{active:true}})},'../../../lib/useCatalogAccess':{useCatalogAccess:sectionCatalog},'../../../lib/catalogPresentation':presentation,'../../../components/SiteHeader':{},'../../../components/layout/SiteFooter':{},'../../../components/layout/BackButton':{},'../../../components/AcademyImage':{},'../../../components/ApiLoadError':{},'../../../components/catalog/CatalogCard':{default:Card},'../../../components/catalog/PriceOptions':{}},globals:{...h.globals,...b}});
 t.after(()=>h.cleanup());h.mount(()=>mod.default());await h.settle();
 assert.equal(nodes(h.tree).some(node=>node.props?.href==='/checkout?section=mediation'),false);assert.ok(nodes(h.tree).some(node=>node.props?.href==='#section-courses'));
 const card=nodes(h.tree).find(node=>node.type===Card);assert.equal(card.props.product.slug,'one');assert.equal(card.props.coverageLabel,'Section Access');assert.ok(nodes(h.tree).some(node=>node.props?.href==='/academy'));assert.ok(nodes(h.tree).some(node=>node.props?.fallback==='/academy'));assert.equal(nodes(h.tree).some(node=>node.props?.href==='/sections'),false);
});
test('Academy catalog errors keep standalone learning visible without blanket membership sales',()=>{
 const h=hookHarness(),Card={},ErrorCard={};
 const Page=compileModule('../app/academy/page.tsx',{imports:{'react/jsx-runtime':h,'../../lib/usePublicResource':{usePublicResource:path=>({data:path==='/courses'?[{slug:'alone'}]:[],loading:false,error:path==='/sections'?'Sections temporarily unavailable':'',retry(){}})},'../../lib/useCatalogAccess':{useCatalogAccess:inactiveCatalogAccess},'../../lib/catalogPresentation':presentation,'../../components/ApiLoadError':{default:ErrorCard},'../../components/SiteHeader':{},'../../components/layout/SiteFooter':{},'../../components/layout/BackButton':{},'../../components/catalog/CatalogCard':{default:Card}}}).default;
 const tree=Page();assert.equal(nodes(tree).find(node=>node.type===Card).props.product.slug,'alone');assert.equal(nodes(tree).find(node=>node.type===ErrorCard).props.message,'Sections temporarily unavailable');
 assert.equal(nodes(tree).some(node=>node.props?.href?.startsWith('/checkout?plan=')),false);
 assert.ok(nodes(tree).some(node=>node.type==='h1'&&node.props.children==='Academy Plans'));
});
test('legacy catalog URLs remain aliases of the Academy catalog',()=>{
 const marker=()=>null;
 for(const path of ['../app/courses/page.tsx','../app/sections/page.tsx'])assert.equal(compileModule(path,{imports:{'../academy/page':{default:marker}}}).default,marker);
});
test('verified document snapshot preserves stored country while excluding secret fields',async()=>{
 const policy=compileModule('../lib/pagePolicy.ts'),mod=compileModule('../lib/server/pageSession.ts',{imports:{'../pagePolicy':policy,'./apiProxy.mjs':{proxyTarget}}});
 const result=await mod.pageSession(new Request('http://localhost:3000/sections',{headers:{cookie:'sa_student_v45='+'a'.repeat(64)}}),{NODE_ENV:'development',API_PROXY_TARGET:'http://127.0.0.1:5000'},async()=>Response.json({success:true,user:{id:'one',role:'student',country:'PK',passwordHash:'SECRET'}}));
 assert.equal(result.session.user.country,'PK');assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('My Courses identifies server-granted section courses without pretending they were enrolled individually',async t=>{
 const h=hookHarness(),b=browserGlobals();
 const Page=compileModule('../app/my-course/page.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'next/link':{default:'a'},'../../components/ApiLoadError':{},'../../components/CertificateStatus':{},'../../components/AcademyImage':{},'../../components/layout/PageShell':{},'../../components/auth/AuthProvider':{useAuth:()=>({ready:true,user:{id:'student'}})},'../../lib/api':{isAbortError:()=>false,apiFetch:async()=>({courses:[{_id:'one',slug:'included',title:'Included course',sectionSlug:'mediation',sectionAccess:true,progress:0}]})}},globals:{...b,...h.globals,navigator:{onLine:true}}}).default;
 t.after(()=>h.cleanup());h.mount(()=>Page());await h.settle();
 assert.ok(nodes(h.tree).some(node=>node.props?.children==='SECTION ACCESS'));assert.ok(nodes(h.tree).some(node=>node.props?.href==='/sections/mediation'));assert.equal(nodes(h.tree).some(node=>node.props?.children==='ENROLLED COURSE'),false);
});

test('active membership card suppresses individual pricing and purchase controls',()=>{
 const h=hookHarness(),Prices={},Card=compileModule('../components/catalog/CatalogCard.tsx',{imports:{'react/jsx-runtime':h,'next/link':{},'../AcademyImage':{},'../../lib/imageSources':compileModule('../lib/imageSources.ts'),'../../lib/money':{money:String},'./PriceOptions':{default:Prices}}}).default;
 const result=Card({product:{slug:'covered',title:'Covered course',price:9999},covered:true});
 assert.equal(nodes(result).some(node=>node.type===Prices),false);assert.ok(nodes(result).some(node=>node.props?.children==='Membership Access'));assert.equal(nodes(result).some(node=>node.props?.href?.startsWith('/checkout')),false);
});
