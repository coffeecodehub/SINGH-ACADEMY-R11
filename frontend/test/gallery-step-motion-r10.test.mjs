import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule} from './compile.mjs';

function fixture({slides=3,client=300,cardStep=null,reduced=false,roundOffsets=false}={}){
 const win=new EventTarget(),doc=new EventTarget(),viewport=new EventTarget(),media=new EventTarget(),frames=new Map(),observers=[];let id=0,now=0;
 Object.assign(doc,{visibilityState:'visible'});Object.assign(media,{matches:reduced});
 const cardDistance=()=>cardStep??viewport.clientWidth;
 Object.assign(viewport,{clientWidth:client,scrollLeft:0,contains:node=>node===viewport,querySelector:selector=>slides<2?null:{offsetLeft:selector==='[data-gallery-original-start]'?slides*cardDistance():2*slides*cardDistance(),nextElementSibling:{offsetLeft:(slides+1)*cardDistance()}}});
 Object.defineProperty(viewport,'scrollWidth',{get:()=>slides*3*cardDistance()});
 if(roundOffsets){let value=0;Object.defineProperty(viewport,'scrollLeft',{get:()=>value,set:next=>value=Math.round(next)});}
 Object.assign(win,{matchMedia:()=>media,requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},cancelAnimationFrame:key=>frames.delete(key)});
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){}emit(value){this.callback([{isIntersecting:value}]);}}
 const motion=compileModule('../lib/galleryMotion.ts',{globals:{IntersectionObserver:Observer}}),stop=motion.bindGalleryMotion(viewport,{window:win,document:doc});
 const step=at=>{now=at;const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(at);};step(0);
 const advance=(duration,hz=60)=>{const end=now+duration;for(let at=now+1000/hz;at<end-.0001;at+=1000/hz)step(at);step(end);};
 return{win,doc,viewport,media,frames,stop,advance,visible(value){observers[0].emit(value);},get start(){return slides*cardDistance();},pointer(type,pointerType='mouse'){const event=new Event(type);Object.assign(event,{pointerType});viewport.dispatchEvent(event);}};
}

test('a whole image rests for three seconds, slides smoothly once, then rests again',()=>{
 const f=fixture();try{assert.equal(f.viewport.scrollLeft,f.start);f.advance(2990);assert.equal(f.viewport.scrollLeft,f.start);f.advance(310);assert.ok(f.viewport.scrollLeft>f.start&&f.viewport.scrollLeft<f.start+300);f.advance(340);assert.equal(f.viewport.scrollLeft,f.start+300);f.advance(2000);assert.equal(f.viewport.scrollLeft,f.start+300);}finally{f.stop();}
});
test('the final-to-first transition keeps moving forward and lands on the identical first-image cycle',()=>{
 const f=fixture();try{f.viewport.scrollLeft=f.start+600;f.advance(20);f.advance(3000);const final=f.viewport.scrollLeft;f.advance(300);assert.ok(f.viewport.scrollLeft>final&&f.viewport.scrollLeft<f.start+900);f.advance(340);assert.equal(f.viewport.scrollLeft,f.start);f.advance(2000);assert.equal(f.viewport.scrollLeft,f.start);}finally{f.stop();}
});
test('hover and keyboard focus hold even a partially completed transition without a resume jump',()=>{
 for(const [pause,resume]of [['pointerenter','pointerleave'],['focusin','focusout']]){const f=fixture();try{f.advance(3300);const held=f.viewport.scrollLeft;f.viewport.dispatchEvent(new Event(pause));f.advance(5000);assert.equal(f.viewport.scrollLeft,held);f.viewport.dispatchEvent(new Event(resume));f.advance(16);assert.equal(f.viewport.scrollLeft,held);f.advance(650);assert.equal(f.viewport.scrollLeft,f.start+300);}finally{f.stop();}}
});
test('hidden tabs and offscreen galleries resume their waiting time without a background jump',()=>{
 for(const kind of ['tab','viewport']){const f=fixture();try{f.advance(1000);if(kind==='tab'){f.doc.visibilityState='hidden';f.doc.dispatchEvent(new Event('visibilitychange'));}else f.visible(false);f.advance(10000);assert.equal(f.viewport.scrollLeft,f.start);if(kind==='tab'){f.doc.visibilityState='visible';f.doc.dispatchEvent(new Event('visibilitychange'));}else f.visible(true);f.advance(1000);assert.equal(f.viewport.scrollLeft,f.start);f.advance(1700);assert.equal(f.viewport.scrollLeft,f.start+300);}finally{f.stop();}}
});
test('touch inspection pauses until release outside the gallery, without sticky touch hover or pointer focus',()=>{
 const f=fixture();try{f.pointer('pointerenter','touch');f.pointer('pointerdown','touch');f.viewport.dispatchEvent(new Event('focusin'));f.advance(5000);assert.equal(f.viewport.scrollLeft,f.start);f.win.dispatchEvent(new Event('pointerup'));f.advance(3700);assert.equal(f.viewport.scrollLeft,f.start+300);}finally{f.stop();}
});
test('a manually inspected scroll is adopted and the next timed step finishes on a whole image',()=>{
 const f=fixture();try{f.pointer('pointerenter');f.viewport.scrollLeft=f.start+140;f.advance(2000);assert.equal(f.viewport.scrollLeft,f.start+140);f.pointer('pointerleave');f.advance(3700);assert.equal(f.viewport.scrollLeft,f.start+300);}finally{f.stop();}
});
test('resize preserves the selected image and later advances by the new viewport width',()=>{
 const f=fixture();try{f.advance(3700);assert.equal(f.viewport.scrollLeft,f.start+300);f.viewport.clientWidth=450;f.win.dispatchEvent(new Event('resize'));assert.equal(f.viewport.scrollLeft,f.start+450);f.advance(3700);assert.equal(f.viewport.scrollLeft,f.start+900);}finally{f.stop();}
});
test('reduced motion stays static and a live preference change enables the timed slides',()=>{
 const f=fixture({reduced:true});try{f.advance(7000);assert.equal(f.viewport.scrollLeft,f.start);f.media.matches=false;const event=new Event('change');Object.assign(event,{matches:false});f.media.dispatchEvent(event);f.advance(3700);assert.equal(f.viewport.scrollLeft,f.start+300);}finally{f.stop();}
});
test('144Hz integer scroll engines complete exactly one slide rather than losing fractional steps',()=>{
 const f=fixture({roundOffsets:true});try{f.advance(3700,144);assert.equal(f.viewport.scrollLeft,f.start+300);f.advance(2000,144);assert.equal(f.viewport.scrollLeft,f.start+300);}finally{f.stop();}
});
test('one image remains static and cleanup releases every animation callback',()=>{
 const f=fixture({slides:1});f.advance(7000);assert.equal(f.viewport.scrollLeft,0);f.stop();assert.equal(f.frames.size,0);f.advance(7000);assert.equal(f.frames.size,0);
});

// R11: preserve the original 70%-wide/clamped cards and 20px spacing.
test('single-card timing uses the original card width plus its gap, not the larger viewport',()=>{
 const f=fixture({client:1000,cardStep:720});try{f.advance(3700);assert.equal(f.viewport.scrollLeft,f.start+720);f.advance(2000);assert.equal(f.viewport.scrollLeft,f.start+720);f.viewport.scrollLeft=f.start+1440;f.advance(20);f.advance(3700);assert.equal(f.viewport.scrollLeft,f.start);}finally{f.stop();}
});
