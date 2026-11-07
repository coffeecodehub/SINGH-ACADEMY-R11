import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule} from './compile.mjs';
import {httpError,safeUrl} from '../../backend/src/utils/cmsValidation.js';
const landing='/images/hero-overrides/new-landing.jpg',home='/images/hero-overrides/new-home.jpg';
const normalizer=heroes=>compileModule('../lib/websiteConfig.ts',{imports:{'./heroPhotos.json':{default:heroes}}}).websiteConfig;
test('stale hero URL would be rebased by the real backend validator, but normalization removes it before save',()=>{
 const slots={texts:[{key:'landing-001'}],images:[{key:'image-075',src:landing},{key:'image-077',src:home}]};
 const backend=compileModule('../../backend/src/utils/websiteContent.js',{imports:{'../data/websiteSlots.js':{default:slots},'./cmsValidation.js':{httpError,safeUrl},'./pageSections.js':{validateImageEdit:value=>value}}});
 const stale={text:{'landing-001':'A new heading'},images:[{key:'image-075',src:'/images/global-learning/ukraine-delegation-2.jpg',url:'/api/media/'+'a'.repeat(24)},{key:'image-077',src:'/images/global-learning/brazil-2.jpg',url:'/api/media/'+'b'.repeat(24)}]};
 const unsafeRoundtrip=backend.validateWebsiteContent(stale);assert.equal(unsafeRoundtrip.images[0].src,landing);assert.equal(unsafeRoundtrip.images[0].url,stale.images[0].url);
 const clean=normalizer({landing:{src:landing},home:{src:home}})(stale),roundtrip=backend.validateWebsiteContent(clean);assert.equal(roundtrip.images.length,0);assert.equal(roundtrip.text['landing-001'],'A new heading');
});
test('newly saved hero override and all unrelated custom images retain their actual URL and original editing metadata',()=>{
 const current={key:'image-075',src:landing,url:'/api/media/'+'a'.repeat(24),originalFileId:'b'.repeat(24),imageEdit:{zoom:1.5}},other={key:'image-079',src:'/images/global-learning/brazil-3.jpg',url:'/api/media/'+'c'.repeat(24)};
 const output=normalizer({landing:{src:landing},home:{src:home}})({images:[current,other,{key:'image-077',src:'/old-home.jpg',url:'/old.png'}]});assert.equal(output.images.length,2);assert.equal(output.images[0],current);assert.equal(output.images[1],other);assert.equal(output.images[0].imageEdit.zoom,1.5);
});
test('without a changed hero source, existing customized hero records remain untouched',()=>{const old={key:'image-075',src:'/images/global-learning/ukraine-delegation-2.jpg',url:'/api/media/'+'a'.repeat(24)};const output=normalizer({landing:null,home:null})({images:[old,null,{key:'invalid'}]});assert.equal(output.images.length,1);assert.equal(output.images[0],old);});
