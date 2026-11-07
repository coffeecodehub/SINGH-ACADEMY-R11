import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './testLoader.js';
import {createContentCache} from '../src/services/catalogCache.js';
import {compareTeam,teamCategories,teamCategoryFilter} from '../src/utils/teamCategories.js';

function fixture(){
 const members=[
  {_id:'core',name:'Core',category:'core',order:0,active:true,image:'core.jpg',country:'US'},
  {_id:'tie-first',name:'Same',category:'faculty',order:2,active:true,image:'first.jpg',imageOriginal:'PRIVATE ORIGINAL',imageOriginalFileId:'PRIVATE FILE',imageEdit:{zoom:1.2}},
  {_id:'board',name:'Board',category:'board',categories:[],order:0,active:true,imageFileId:'board-file',image:'old-board.jpg'},
  {_id:'founder',name:'Founder',category:'board',categories:['faculty','founder'],order:5,active:true,imageFileId:'founder-file',imageOriginalFileId:'private-founder-file'},
  {_id:'tie-second',name:'Same',category:'faculty',order:2,active:true,image:'second.jpg'},
  {_id:'faculty',name:'Alpha',category:'faculty',categories:['faculty'],order:1,active:true,image:'faculty.jpg'},
  {_id:'hidden',name:'Hidden',category:'founder',active:false,image:'hidden.jpg'}
 ];
 const cache=createContentCache(),queries=[],routes=new Map();let comparisons=0;
 const TeamMember={find(filter){
  const query={filter};queries.push(query);
  return {select(projection){query.projection=projection;return this;},async lean(){
   const category=filter.$or?.[0]?.categories;
   return structuredClone(members.filter(member=>member.active&&(!category||teamCategories(member).includes(category)))).map(member=>{
    for(const field of (query.projection||'').split(' ').filter(Boolean)){
     assert.ok(field.startsWith('-'),'The query must retain every existing public field.');
     delete member[field.slice(1)];
    }
    return member;
   });
  }};
 }};
 load('../src/routes/contentRoutes.js',{
  Router:()=>({get(path,handler){routes.set(path,handler);}}),TeamMember,catalogCache:cache,
  compareTeam:(a,b)=>{comparisons++;return compareTeam(a,b);},teamCategories,teamCategoryFilter,
  mediaUrl:(req,id,image)=>id?req.mediaPrefix+'/'+id:image
 },'r');
 async function request(category,mediaPrefix='first'){
  let result;const headers={};
  await routes.get('/team')({query:category===undefined?{}:{category},mediaPrefix},{set(key,value){headers[key]=value;return this;},json(value){result=value;}});
  return {result:JSON.parse(JSON.stringify(result)),headers};
 }
 return {members,cache,queries,request,comparisons:()=>comparisons};
}

function priorPublicResponse(members,category,mediaPrefix){
 return {success:true,team:members.filter(member=>member.active&&(!category||teamCategories(member).includes(category))).slice().sort(compareTeam).map(({imageOriginal,imageOriginalFileId,imageEdit,...member})=>({...member,categories:teamCategories(member),image:member.imageFileId?mediaPrefix+'/'+member.imageFileId:member.image}))};
}

test('team cold and warm payloads preserve public fields, category order, stable ties and request media URLs',async()=>{
 const f=fixture(),original=structuredClone(f.members);
 const cold=await f.request();
 assert.deepEqual(cold.result,priorPublicResponse(original,null,'first'));
 assert.deepEqual(cold.result.team.map(member=>member._id),['founder','faculty','tie-first','tie-second','board','core']);
 assert.equal(cold.headers['Cache-Control'],'private, no-store');
 assert.equal(JSON.stringify(cold.result).includes('PRIVATE'),false);
 assert.equal(cold.result.team.find(member=>member._id==='core').country,'US');
 const comparisons=f.comparisons();assert.ok(comparisons>0);
 const warm=await f.request(undefined,'second');
 assert.deepEqual(warm.result,priorPublicResponse(original,null,'second'));
 assert.equal(f.queries.length,1,'A warm response must reuse the existing content cache.');
 assert.equal(f.comparisons(),comparisons,'A warm response must not repeat the team sort.');
 assert.equal(f.queries[0].projection,'-imageOriginal -imageOriginalFileId -imageEdit');
 assert.deepEqual(f.members,original,'Stored/admin-visible originals must remain unchanged.');
});

test('team category caches preserve legacy and multiple categories and reload ordering after invalidation',async()=>{
 const f=fixture();
 for(const category of ['founder','faculty','board','core']){
  const {result}=await f.request(category);
  assert.deepEqual(result,priorPublicResponse(f.members,category,'first'));
  assert.deepEqual(f.queries.at(-1).filter,{active:true,...teamCategoryFilter(category)});
 }
 assert.equal(f.queries.length,4,'Each category requires an independent cache entry.');
 await f.request('faculty');assert.equal(f.queries.length,4);
 const updated=f.members.find(member=>member._id==='tie-second');updated.order=0;updated.imageOriginal='UPDATED PRIVATE ORIGINAL';
 f.cache.clear();
 const {result}=await f.request('faculty');
 assert.deepEqual(result,priorPublicResponse(f.members,'faculty','first'));
 assert.equal(result.team[1]._id,'tie-second');
 assert.equal(f.queries.length,5);
 const invalid=await f.request('unknown');
 assert.deepEqual(invalid.result,priorPublicResponse(f.members,null,'first'));
 assert.deepEqual(f.queries.at(-1).filter,{active:true});
});
