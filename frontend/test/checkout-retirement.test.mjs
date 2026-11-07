const inactiveCatalogAccess=()=>({scope:'fixture-owner',checking:false,unavailable:false,error:'',membershipActive:false,courseAccess:()=>null,sectionAccess:()=>null,refresh(){}});
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'?[t,...nodes(t.props?.children)]:[];
test('retired blanket-membership URL renders current catalog guidance without new payment or plan reads',async t=>{
 const h=hookHarness(),b=browserGlobals(),calls=[];let planReads=0;
 const Page=compileModule('../app/checkout/page.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'next/navigation':{useRouter:()=>({replace(){},push(){}}),useSearchParams:()=>new URLSearchParams('plan=Annual')},'../../components/ApiLoadError':{},'../../components/layout/BackButton':{},'../../components/SiteHeader':{},'../../components/layout/SiteFooter':{},'../../components/auth/AuthProvider':{useAuth:()=>({ready:true,user:{id:'student',role:'student'}})},'../../lib/api':{safeStudentNext:path=>path,apiFetch:async(path)=>{calls.push(path);if(path==='/payments/methods')return{methods:{}};throw Error('Retired purchase requested '+path);}},'../../lib/money':{money:String},'../../lib/publicSiteContent':{getPublicSiteContent:async()=>{planReads++;throw Error('Retired public plans were read');}},'../../lib/useCatalogAccess':{useCatalogAccess:inactiveCatalogAccess},'../../components/SectionPurchaseSuggestion':{default:'section-suggestion'},'../../components/feedback/FeedbackNotice':{default:'feedback'},'../../lib/checkoutSafety':compileModule('../lib/checkoutSafety.ts')},globals:{...b,...h.globals,sessionStorage:{getItem:()=>null},navigator:{onLine:true}}}).default;
 t.after(()=>h.cleanup());h.mount(()=>Page());await h.settle();
 assert.equal(nodes(h.tree).some(node=>String(node.props?.className||'').startsWith('paymentMethod ')),false);assert.ok(nodes(h.tree).some(node=>node.props?.href==='/academy'));assert.equal(calls.some(path=>/^\/payments\/(?:catalog|quote|checkout)/.test(path)),false);assert.equal(planReads,0);
});
