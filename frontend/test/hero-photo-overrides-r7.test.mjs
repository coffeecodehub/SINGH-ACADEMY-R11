import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule} from './compile.mjs';
test('directly configured photo originals replace exactly the two requested heroes while other photo placements remain',()=>{
 const landing={src:'/images/hero-overrides/original-landing.jpg',width:2048,height:1152,alt:'Certificate group',caption:'Learning',objectPosition:'50% 52%'},home={src:'/images/hero-overrides/original-home.jpg',width:1800,height:1350,alt:'Whiteboard teaching',caption:'Practice',objectPosition:'25% 42%'};
 const module=compileModule('../lib/learningPhotos.ts',{imports:{'./heroPhotos.json':{default:{landing,home}}}});
 assert.equal(module.learningPhoto('landing','hero').src,landing.src);assert.equal(module.learningPhoto('home','hero').src,home.src);
 assert.equal(module.learningPhoto('landing','story').src,'/images/global-learning/brazil-1.jpg');assert.equal(module.learningPhoto('home','event').src,'/images/global-learning/ukraine-delegation-1.jpg');assert.equal(module.learningPhoto('about','gallery').src,'/images/global-learning/brazil-3.jpg');
 assert.equal(module.learningPhotoProps('home','hero').style.objectPosition,'25% 42%');assert.equal(module.learningPhotoProps('landing','hero').width,2048);
});
