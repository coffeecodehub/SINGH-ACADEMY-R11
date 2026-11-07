import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule} from './compile.mjs';
const {sectionPurchaseSuggestion:read}=compileModule('../lib/sectionPurchaseSuggestion.ts');
const slug='negotiation';
const detail=()=>({section:{slug,title:'Negotiation Section',published:true},courses:[{slug:'a',sectionSlug:slug,published:true},{slug:'b',sectionSlug:slug,published:true},{slug:'draft',sectionSlug:slug,published:false},{slug:'outside',sectionSlug:'other',published:true}]});
const catalog=()=>({purchase:{kind:'section',product:slug,offers:[{key:'short',durationMonths:3,currency:'USD',amountMinor:10900},{key:'annual',durationMonths:12,currency:'USD',amountMinor:29900}]}});
test('suggestion uses exact owning section, published child count and selected-duration regional offer',()=>{
 const result=read(slug,detail(),catalog(),12);assert.equal(result.slug,slug);assert.equal(result.title,'Negotiation Section');assert.equal(result.courseCount,2);assert.equal(result.offer.amountMinor,29900);assert.equal(result.offer.key,'annual');
});
test('suggestion falls back to first offered term without inventing a price',()=>{assert.equal(read(slug,detail(),catalog(),6).offer.key,'short');});
test('duplicate course entries do not inflate the count',()=>{const d=detail();d.courses.push(d.courses[0]);assert.equal(read(slug,d,catalog(),12).courseCount,2);});
for(const state of ['active','unpublished','wrong-section','wrong-catalog','no-courses','no-offers','invalid-money','no-title'])test('optional section suggestion hides safely: '+state,()=>{
 const d=detail(),c=catalog();
 if(state==='active')d.access={active:true};
 if(state==='unpublished')d.section.published=false;
 if(state==='wrong-section')d.section.slug='other';
 if(state==='wrong-catalog')c.purchase.product='other';
 if(state==='no-courses')d.courses=[];
 if(state==='no-offers')c.purchase.offers=[];
 if(state==='invalid-money')c.purchase.offers=c.purchase.offers.map(o=>({...o,amountMinor:NaN}));
 if(state==='no-title')d.section.title='';
 assert.equal(read(slug,d,c,12),null);
});
