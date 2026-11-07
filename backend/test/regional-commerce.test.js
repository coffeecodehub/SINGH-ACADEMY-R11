import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalOffers,publicRegionalProduct} from '../src/services/regionalPricing.js';
import {payloadFor,siteValue,countryPrices} from '../src/utils/cmsValidation.js';
import {invoiceCourseGrants,invoiceGrantEligible} from '../src/utils/courseEntitlements.js';
import {seedLesson,validateCourseSeeds} from '../src/services/courseSeeding.js';
import {courseSeeds} from '../src/data/courseSeeds.js';
import {couponStatus,normalizeCouponCode} from '../src/services/coupons.js';
import {load} from './testLoader.js';
import {normalizeCountry} from '../src/utils/countries.js';
import {durationMonths} from '../src/utils/commerce.js';
import {toMinor} from '../src/utils/business.js';
const product={slug:'regional-test',currency:'USD',price:99,accessMonths:1,pricing:[{key:'seventeen',label:'17 months',price:170,durationMonths:17,countryPrices:[{country:'PK',price:30},{country:'US',price:120}]}]};
test('country override is a term total and every unmatched country inherits the explicit USA price',()=>{
 assert.deepEqual(regionalOffers(product,'PK')[0],{key:'seventeen',label:'17 months',amountMinor:3000,currency:'USD',durationMonths:17,accessDays:0});
 assert.equal(regionalOffers(product,'US')[0].amountMinor,12000);
 for(const country of ['DE','GB','CA','AU','FR','IN','BD','AF','',undefined,'not-country'])assert.equal(regionalOffers(product,country)[0].amountMinor,12000);
});
test('country-specific totals override USA while legacy rows without US overrides retain explicit admin base',()=>{
 const configured={...product,pricing:[{...product.pricing[0],countryPrices:[{country:'US',price:120},{country:'DE',price:80},{country:'GB',price:75},{country:'CA',price:85},{country:'AU',price:87},{country:'IN',price:40},{country:'PK',price:30},{country:'BD',price:25},{country:'AF',price:20}]}]};
 for(const [country,total] of [['US',120],['DE',80],['GB',75],['CA',85],['AU',87],['IN',40],['PK',30],['BD',25],['AF',20]])assert.equal(regionalOffers(configured,country)[0].amountMinor,total*100);
 assert.equal(regionalOffers(configured,'ES')[0].amountMinor,12000);
 const legacy={...product,pricing:[{...product.pricing[0],countryPrices:[{country:'PK',price:30}]}]};
 assert.equal(regionalOffers(legacy,'US')[0].amountMinor,17000);assert.equal(regionalOffers(legacy,'FR')[0].amountMinor,17000);
});
test('public country projection removes every price map without changing cached raw products',()=>{
 const raw=structuredClone(product),pk=publicRegionalProduct(raw,'PK'),us=publicRegionalProduct(raw,'US');
 assert.equal(pk.pricing[0].price,30);assert.equal(us.pricing[0].price,120);
 assert.equal(JSON.stringify(pk).includes('countryPrices'),false);assert.equal(JSON.stringify(us).includes('countryPrices'),false);
 assert.deepEqual(raw,product);
});
test('blank country overrides inherit default; zero is an explicit valid override',()=>{
 assert.deepEqual(countryPrices([{country:'PK',price:''},{country:'US',price:null},{country:'FR',price:0}]),[{country:'FR',price:0}]);
 assert.equal(regionalOffers({...product,pricing:[{...product.pricing[0],countryPrices:[{country:'PK',price:''}]}]},'PK')[0].amountMinor,17000);
 const inherited={...product,pricing:[{...product.pricing[0],countryPrices:[{country:'US',price:120},{country:'PK',price:''},{country:'FR',price:0}]}]};
 assert.equal(regionalOffers(inherited,'PK')[0].amountMinor,12000);assert.equal(regionalOffers(inherited,'FR')[0].amountMinor,0);
});
test('admin normalization canonicalizes an existing US override without guessing other country prices',()=>{
 const course=payloadFor('courses',{pricing:product.pricing});assert.equal(course.pricing[0].price,120);assert.deepEqual(course.pricing[0].countryPrices,product.pricing[0].countryPrices);
 const plan=siteValue('membershipPlans',[{name:'Legacy plan',price:170,durationMonths:17,countryPrices:[{country:'US',price:120},{country:'DE',price:80}]}])[0];
 assert.equal(plan.price,120);assert.equal(publicRegionalProduct(plan,'FR').price,120);assert.equal(publicRegionalProduct(plan,'DE').price,80);
 assert.equal(siteValue('membershipPlans',[{name:'US only',price:'',countryPrices:[{country:'US',price:65}],durationMonths:1}])[0].price,65);
});
test('CMS rejects invalid/duplicate countries, fractional money and duplicate option keys',()=>{
 for(const rows of [[{country:'XX',price:20}],[{country:'PK',price:20},{country:'pk',price:30}],[{country:'PK',price:2.001}]])assert.throws(()=>countryPrices(rows),{status:400});
 assert.throws(()=>payloadFor('courses',{pricing:[{key:'same',label:'A',price:10},{key:'same',label:'B',price:20}]}),{status:400});
 assert.throws(()=>payloadFor('sections',{accessMonths:121}),{status:400});
 assert.throws(()=>siteValue('membershipPlans',[{name:'Invalid term',price:50,durationMonths:121}]),{status:400});
});
test('section slug remains locked and courses can explicitly become standalone',()=>{
 assert.throws(()=>payloadFor('sections',{slug:'other'},{previous:{slug:'original'}}),{status:409});
 assert.equal(payloadFor('courses',{sectionSlug:''}).sectionSlug,'');
 assert.throws(()=>payloadFor('courses',{sectionSlug:{$ne:null}}),{status:400});
});
test('membership catalog has no invented plans or country defaults',async()=>{
 const api=load('../src/services/regionalPricing.js',{SiteContent:{findOne:()=>({session(){return this;},lean:async()=>null})},normalizeCountry,durationMonths,toMinor,catalogCache:{get:(_,fn)=>fn()}},'({getMembershipPlans})');
 assert.deepEqual(await api.getMembershipPlans('PK'),[]);assert.deepEqual(await api.getMembershipPlans('US'),[]);
});
test('configured membership country override and fallback use explicit admin totals',()=>{
 const plan={name:'Configured',price:79,durationMonths:6,countryPrices:[{country:'PK',price:31}]};
 assert.equal(publicRegionalProduct(plan,'PK').price,31);assert.equal(publicRegionalProduct(plan,'IN').price,79);
 assert.equal(JSON.stringify(publicRegionalProduct(plan,'PK')).includes('countryPrices'),false);
});
test('only exact reviewed full-coupon evidence can authorize a zero-total invoice',()=>{
 const invoice={_id:'inv',user:'student',kind:'course',courseSlug:'course',origin:'coupon',status:'paid',fulfillmentAt:new Date(),discountFull:true,coupon:'coupon-id',subtotalMinor:10000,discountMinor:10000,totalMinor:0,paidMinor:0,creditedMinor:0,grantVersion:1,grantStartsAt:new Date('2026-01-01'),grantExpiresAt:new Date('2026-02-01')};
 assert.equal(invoiceGrantEligible(invoice),true);assert.equal(invoiceCourseGrants([invoice]).grants.length,1);
 for(const patch of [{origin:'online_checkout'},{discountFull:false},{coupon:null},{discountMinor:9999},{subtotalMinor:0},{paidMinor:1},{accessRevokedAt:new Date()},{status:'open'},{grantSuppressed:true}])assert.equal(invoiceGrantEligible({...invoice,...patch}),false,JSON.stringify(patch));
});
test('coupon codes normalize without operators and lifecycle reports global one-use state',()=>{
 assert.equal(normalizeCouponCode('  first_course-25 '),'FIRST_COURSE-25');assert.throws(()=>normalizeCouponCode({$gt:''}),{status:400});
 const coupon={active:true,expiresAt:new Date(Date.now()+100000)};assert.equal(couponStatus(coupon),'available');
 assert.equal(couponStatus({...coupon,claimedOrder:'order'}),'reserved');assert.equal(couponStatus({...coupon,redeemedAt:new Date()}),'redeemed');
 assert.equal(couponStatus({...coupon,active:false}),'revoked');assert.equal(couponStatus({...coupon,expiresAt:new Date(0)}),'expired');
});
test('all 82 authored lessons now validate against the actual lesson schema before persistence',()=>{
 assert.equal(validateCourseSeeds(),courseSeeds);
 assert.equal(courseSeeds.flatMap(course=>course.modules.flatMap(([,lessons])=>lessons)).length,82);
 assert.equal(seedLesson(['Reflection','reflection']).type,'journal');
 assert.equal(seedLesson(['Talk','external-video',[],[{url:'https://example.invalid/talk'}]]).videoUrl,'https://example.invalid/talk');
});
