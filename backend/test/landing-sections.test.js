import {approvedReviewQuery} from '../src/utils/reviews.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {load} from './testLoader.js';
import {createContentCache} from '../src/services/catalogCache.js';
import * as teamHelpers from '../src/utils/teamCategories.js';
test('public landing section summaries cache bounded raw records and exclude prices for every account country',async()=>{
 const cache=createContentCache(),calls=[],sections=[{_id:'section',slug:'section',title:'First title',thumbnailFileId:'image-id',price:99,pricing:[{price:99,countryPrices:[{country:'PK',price:30}]}],countryPrices:[{country:'US',price:99}],user:'PRIVATE'}];
 const empty={find:()=>({select(){return this;},sort(){return this;},limit(){return this;},lean:async()=>[]})};
 const Section={find(filter){const call={filter};calls.push(call);return{select(fields){call.fields=fields;return this;},sort(order){call.order=order;return this;},limit(limit){call.limit=limit;return this;},lean:async()=>structuredClone(sections.slice(0,call.limit))};}};
 const content=load('../src/services/landingContent.js',{...teamHelpers,approvedReviewQuery,catalogCache:cache,Section,Course:empty,TeamMember:empty,Review:empty,mediaUrl:(req,id)=>req.prefix+'/'+id},'landingContent');
 const raw=structuredClone(sections),pk=await content({prefix:'pk',user:{country:'PK'}}),us=await content({prefix:'us',user:{country:'US'}}),guest=await content({prefix:'guest'});
 assert.equal(calls.length,1);assert.deepEqual(calls[0].filter,{published:true,archivedAt:null});assert.equal(calls[0].limit,24);assert.equal(calls[0].fields.split(' ').some(key=>['price','pricing','countryPrices'].includes(key)),false);
 for(const data of [pk,us,guest]){assert.equal(data.sections[0].title,'First title');assert.equal(data.sections[0].price,undefined);assert.equal(data.sections[0].pricing,undefined);assert.equal(JSON.stringify(data).includes('countryPrices'),false);assert.equal(JSON.stringify(data).includes('PRIVATE'),false);}
 assert.equal(pk.sections[0].thumbnail,'pk/image-id');assert.equal(us.sections[0].thumbnail,'us/image-id');assert.deepEqual(sections,raw);
 const {catalogInvalidation}=load('../src/middleware/catalogInvalidation.js',{catalogCache:cache},'({catalogInvalidation})');
 sections[0].title='Updated title';
 const denied=new EventEmitter();denied.statusCode=403;catalogInvalidation({method:'PUT',originalUrl:'/api/admin/sections/section'},denied,()=>{});denied.emit('finish');assert.equal((await content({prefix:'guest'})).sections[0].title,'First title');assert.equal(calls.length,1);
 const accepted=new EventEmitter();accepted.statusCode=200;catalogInvalidation({method:'PUT',originalUrl:'/api/admin/sections/section'},accepted,()=>{});accepted.emit('finish');assert.equal((await content({prefix:'guest'})).sections[0].title,'Updated title');assert.equal(calls.length,2);
});
