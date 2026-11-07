import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePageSections,publishedPageSections} from '../src/utils/pageSections.js';
import {validateWebsiteContent} from '../src/utils/websiteContent.js';
import slots from '../src/data/websiteSlots.js';
const image=(extra={})=>({id:'gallery-image-001',imageUrl:'/images/about/about-01.jpg',imageAlt:'Participants at an academy event',title:'Professional learning',description:'An international exchange.',...extra});
const block=(extra={})=>({id:'gallery-section-001',type:'gallery',title:'Academy in practice',published:true,gallery:[image()],...extra});
const save=extra=>validatePageSections({revision:0,blocks:[block(extra)]}).blocks[0];
test('optional empty gallery slots are ignored while populated images keep their order',()=>{const result=save({gallery:[{id:'empty-slot'},image(),{id:'another-empty-slot',imageAlt:'Optional'}]});assert.equal(result.gallery.length,1);assert.equal(result.gallery[0].id,'gallery-image-001');assert.equal(result.columns,3);assert.equal(result.placement,'end');});
test('a published gallery may have text and zero uploaded images; empty unpublished gallery is a valid draft',()=>{assert.equal(save({gallery:[]}).gallery.length,0);assert.equal(save({title:'',published:false,gallery:[]}).gallery.length,0);assert.throws(()=>save({title:'',description:'',gallery:[]}),/needs content/);});
for(const galleryLayout of ['grid','masonry','justified','portfolio','single','carousel'])test('gallery layout survives validation: '+galleryLayout,()=>assert.equal(save({galleryLayout}).galleryLayout,galleryLayout));
for(const placement of ['start','after-hero','after-catalog','end'])test('page placement survives validation: '+placement,()=>assert.equal(save({placement}).placement,placement));
test('old page blocks remain valid and default to the existing footer position',()=>{const result=save({type:'image',gallery:undefined,imageUrl:'/images/about/about-01.jpg',imageAlt:'Existing photograph'});assert.equal(result.placement,'end');assert.deepEqual(result.gallery,[]);});
test('gallery validation rejects script links, mismatched ids, missing published alt and invalid crops',()=>{
 for(const gallery of [[image({imageUrl:'javascript:alert(1)'})],[image({imageAlt:''})],[image({imageUrl:'/api/media/'+'a'.repeat(24),imageFileId:'b'.repeat(24)})],[image({positionX:101})],[image({imageEdit:{zoom:99}})],[image(),image()]])assert.throws(()=>save({gallery}));
 assert.throws(()=>save({columns:12}),/layout/);assert.throws(()=>save({placement:'body script'}),/layout/);assert.throws(()=>save({galleryLayout:'unsafe'}),/layout/);
});
test('public gallery DTO includes presentation but removes upload ids, originals and editor settings',()=>{const item=save({gallery:[image({imageUrl:'/api/media/'+'a'.repeat(24),imageFileId:'a'.repeat(24),originalUrl:'/api/media/'+'b'.repeat(24),originalFileId:'b'.repeat(24)})]});const published=publishedPageSections({blocks:[item,block({published:false})]});assert.equal(published.length,1);assert.equal(published[0].gallery[0].imageUrl,'/api/media/'+'a'.repeat(24));for(const key of ['imageFileId','originalUrl','originalFileId','imageEdit'])assert.equal(published[0].gallery[0][key],undefined);});
test('all five HD public photo slots can be replaced and crop metadata round-trips without changing source slot identity',()=>{
 const ids=new Set(['image-075','image-076','image-077','image-078','image-079']);const hd=slots.images.filter(slot=>ids.has(slot.key));assert.equal(hd.length,5);assert.equal(new Set(hd.map(slot=>slot.key)).size,5);
 // Legitimate hero imports change their original source path, not editable slot identity.
 for(const slot of hd)assert.match(slot.src,/^\/images\/(?:global-learning|hero-overrides)\//);
 for(const slot of hd){const value=validateWebsiteContent({text:{},images:[{key:slot.key,src:'/untrusted-overwrite',url:'/api/media/'+'a'.repeat(24),fileId:'a'.repeat(24),originalUrl:'/api/media/'+'b'.repeat(24),originalFileId:'b'.repeat(24),imageFit:'contain',position:'35% 70%',imageEdit:{zoom:1.5,x:0,y:5,brightness:100,contrast:100,aspect:'4:3',rotation:0,flipX:false,flipY:false}}]});assert.equal(value.images[0].src,slot.src);assert.equal(value.images[0].originalFileId,'b'.repeat(24));assert.equal(value.images[0].imageFit,'contain');assert.equal(value.images[0].imageEdit.zoom,1.5);}
});
