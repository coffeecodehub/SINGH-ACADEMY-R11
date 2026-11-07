import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeZoomUrl,publicEvent} from '../src/utils/events.js';
import {payloadFor} from '../src/utils/cmsValidation.js';
import {csvCell,studentCsvHeader,studentCsvRow} from '../src/utils/studentCsv.js';
import {reviewWriteGuard} from '../src/utils/reviews.js';
import Event from '../src/models/Event.js';
import Course from '../src/models/Course.js';
import Section from '../src/models/Section.js';
import {regionalOffers,publicRegionalProduct} from '../src/services/regionalPricing.js';
test('published webinars require an approved HTTPS Zoom domain and preserve professional details',async()=>{
 for(const link of ['https://zoom.us/j/123?pwd=approved','https://us02web.zoom.us/j/123','https://events.zoom.com/ev/123'])assert.equal(normalizeZoomUrl(link),link);
 for(const link of ['javascript:alert(1)','http://zoom.us/j/123','https://zoom.us.evil.test/j/123','https://evilzoom.us/j/123','https://zoom.us@evil.test/j/123','https://user:password@zoom.us/j/123','https://zoom.us:8443/j/123','//zoom.us/j/123'])assert.throws(()=>normalizeZoomUrl(link),{status:400},link);
 assert.throws(()=>payloadFor('events',{title:'Webinar',type:'webinar',status:'published'},{creating:true}),{status:400});
 const value=payloadFor('events',{title:'Professional Webinar',type:'webinar',description:'  Discussion and Q&A  ',date:'2026-12-01T12:30:00+05:00',status:'published',zoomUrl:'https://us02web.zoom.us/j/123'},{creating:true});
 assert.equal(value.description,'Discussion and Q&A');assert.equal(value.date,'2026-12-01T07:30:00.000Z');assert.equal(value.type,'webinar');
 await assert.rejects(()=>new Event({...value,zoomUrl:''}).validate(),/Published webinars require a Zoom link/);
});
test('public event DTO removes administrative fields and hides an unsafe legacy join URL',()=>{
 const event=publicEvent({_id:'event',type:'webinar',title:'Webinar',zoomUrl:'javascript:alert(1)',adminNotes:'PRIVATE',user:'PRIVATE',priceMap:'PRIVATE'});
 assert.equal(event.zoomUrl,'');assert.equal(event.type,'webinar');assert.equal(JSON.stringify(event).includes('PRIVATE'),false);
});
test('Excel CSV cells preserve text and neutralize formulas, whitespace prefixes, quotes and commas',()=>{
 for(const value of ['=1+1','+SUM(1,2)','-cmd','@name','  =1+1','\t=1+1','\r=1+1','\n=1+1'])assert.ok(csvCell(value).startsWith('"\''),JSON.stringify(value));
 assert.equal(csvCell('Learner, "A"'),'"Learner, ""A"""');assert.equal(csvCell('الطالب'),'"الطالب"');
 const row=studentCsvRow({name:'=HYPERLINK("evil")',email:'lead@example.invalid',country:'PK',status:'active',createdAt:new Date('2026-01-02T03:04:05Z'),passwordHash:'SECRET',tokenVersion:'SECRET'});
 assert.ok(row.startsWith('"\'=HYPERLINK('));assert.ok(row.endsWith('\r\n'));assert.equal(row.includes('SECRET'),false);assert.ok(studentCsvHeader.includes('Registration date (UTC)'));
});
test('review write guard requires the observed numeric revision and timestamp, including old missing revision zero',()=>{
 const at='2026-11-06T00:00:00.000Z';assert.deepEqual(reviewWriteGuard({revision:0,updatedAt:at}),{updatedAt:new Date(at),$or:[{revision:0},{revision:{$exists:false}}]});
 assert.deepEqual(reviewWriteGuard({revision:2,updatedAt:at}),{updatedAt:new Date(at),revision:2});
 for(const body of [{},{revision:'2',updatedAt:at},{revision:-1,updatedAt:at},{revision:2,updatedAt:{$ne:null}}])assert.throws(()=>reviewWriteGuard(body),{status:409});
});
test('base country prices persist on both product models and new reviewed offers include base without changing legacy options',()=>{
 const body=payloadFor('courses',{title:'New',price:100,accessMonths:3,countryPrices:[{country:'US',price:90},{country:'PK',price:30}],includeBaseOffer:true,pricing:[{key:'nine',label:'Nine months',price:200,durationMonths:9,countryPrices:[{country:'PK',price:80}]}]},{creating:true});
 for(const Model of [Course,Section]){const model=new Model({...body,slug:'base-prices'});assert.equal(model.validateSync(),undefined);assert.equal(model.countryPrices.length,2);assert.equal(model.includeBaseOffer,true);}
 const offers=regionalOffers(body,'PK');assert.deepEqual(offers.map(offer=>[offer.key,offer.amountMinor,offer.durationMonths]),[['base',3000,3],['nine',8000,9]]);
 const safe=publicRegionalProduct(body,'PK');assert.deepEqual(safe.pricing.map(offer=>[offer.key,offer.price]),[['base',30],['nine',80]]);assert.equal(JSON.stringify(safe).includes('countryPrices'),false);
 assert.deepEqual(regionalOffers({...body,includeBaseOffer:false},'PK').map(offer=>offer.key),['nine']);
 assert.deepEqual(regionalOffers({...body,name:'Legacy membership'},'PK').map(offer=>offer.key),['nine']);
 assert.throws(()=>payloadFor('sections',{includeBaseOffer:true,pricing:[{key:'base',label:'Reserved',price:10,durationMonths:1}]}),{status:400});
});
