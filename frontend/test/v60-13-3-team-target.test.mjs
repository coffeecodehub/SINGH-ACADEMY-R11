import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {teamPreviewTarget} from '../ui-tests/helpers/team-preview-target.mjs';

const box=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
function fixture(){
 const style={display:'block',visibility:'visible',opacity:'1',pointerEvents:'auto'};
 const doc={defaultView:{innerWidth:390,innerHeight:940,getComputedStyle:e=>({...style,...e.style})}};
 const rail={isConnected:true,ownerDocument:doc,style:{},parentElement:null,getAttribute:()=>null,getBoundingClientRect:()=>box(0,180,390,360)};
 const make=(left,name='Visible Faculty')=>({
   isConnected:true,disabled:false,clientLeft:1,clientTop:1,parentElement:rail,style:{},
   getAttribute(){return null;},getBoundingClientRect:()=>box(left,186,240,346),
   querySelector:()=>({textContent:name}),contains:el=>el===child,
 });
 const child={tagName:'IMG'};let cards=[make(-260,'Clipped Faculty'),make(-4,'Visible Faculty'),make(252,'Partial Faculty')];
 rail.querySelectorAll=()=>cards;
 doc.elementFromPoint=(x,y)=>{for(const card of cards){const r=card.getBoundingClientRect();if(x>r.left&&x<r.right&&y>r.top&&y<r.bottom)return card;}return null;};
 return {doc,rail,make,child,get cards(){return cards;},set cards(value){cards=value;}};
}
test('selects the largest genuinely hit-testable card rather than the first offscreen clone',()=>{
 const f=fixture(),target=teamPreviewTarget(f.rail);assert.equal(target.index,1);assert.equal(target.name,'Visible Faculty');
 assert.ok(target.x>23&&target.x<366);assert.ok(target.y>188&&target.y<532);assert.ok(target.position.x>8);
});
test('re-evaluates current positions when another marquee clone moves into view',()=>{
 const f=fixture();assert.equal(teamPreviewTarget(f.rail).name,'Visible Faculty');
 f.cards=[f.make(-280,'Moved away'),f.make(12,'New visible clone')];assert.equal(teamPreviewTarget(f.rail).name,'New visible clone');
});
for(const [name,apply] of [
 ['detached rail',f=>{f.rail.isConnected=false;}],
 ['hidden rail',f=>{f.rail.hidden=true;}],
 ['inert rail',f=>{f.rail.inert=true;}],
 ['aria-hidden rail',f=>{f.rail.getAttribute=k=>k==='aria-hidden'?'true':null;}],
 ['transparent rail',f=>{f.rail.style.opacity='0';}],
 ['collapsed rail',f=>{f.rail.style.visibility='collapse';}],
 ['display-none rail',f=>{f.rail.style.display='none';}],
 ['below viewport',f=>{f.rail.getBoundingClientRect=()=>box(0,1500,390,360);}],
 ['zero-width rail',f=>{f.rail.getBoundingClientRect=()=>box(0,180,0,360);}],
 ['non-finite rail',f=>{f.rail.getBoundingClientRect=()=>box(NaN,180,390,360);}],
 ['modal covering cards',f=>{f.doc.elementFromPoint=()=>({tagName:'SECTION'});}],
 ['no hit element',f=>{f.doc.elementFromPoint=()=>null;}],
 ['empty rail',f=>{f.cards=[];}],
 ['all cards disabled',f=>{f.cards.forEach(c=>{c.disabled=true;});}],
 ['all cards aria-disabled',f=>{f.cards.forEach(c=>{c.getAttribute=k=>k==='aria-disabled'?'true':null;});}],
 ['all cards detached',f=>{f.cards.forEach(c=>{c.isConnected=false;});}],
 ['all cards hidden',f=>{f.cards.forEach(c=>{c.hidden=true;});}],
 ['all cards pointer-disabled',f=>{f.cards.forEach(c=>{c.style.pointerEvents='none';});}],
 ['no member name',f=>{f.cards.forEach(c=>{c.querySelector=()=>({textContent:' '});});}],
 ['only clipped sliver',f=>{f.cards=[f.make(364)];}],
 ])test('rejects '+name,()=>{const f=fixture();apply(f);assert.equal(teamPreviewTarget(f.rail),null);});
test('image/text child under hit point is allowed only when contained by its card',()=>{
 const f=fixture();f.cards=[f.make(24)];f.doc.elementFromPoint=()=>f.child;
 assert.equal(teamPreviewTarget(f.rail).name,'Visible Faculty');f.cards[0].contains=()=>false;
 assert.equal(teamPreviewTarget(f.rail),null);
});
test('a hidden ancestor excludes the entire rail',()=>{
 const f=fixture();f.rail.parentElement={hidden:true,getAttribute:()=>null,style:{},parentElement:null};assert.equal(teamPreviewTarget(f.rail),null);
});
test('observer never mutates DOM state or pauses the animation itself',()=>{
 const f=fixture(),before=JSON.stringify(f.cards);teamPreviewTarget(f.rail);assert.equal(JSON.stringify(f.cards),before);
 const source=fs.readFileSync(new URL('../ui-tests/helpers/team-preview-target.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.style\s*[.[]|\.click\s*\(|dispatchEvent\s*\(|\.pause\s*\(/);
});
test('interaction helper scrolls stationary parent, pauses through hover and never force-clicks',()=>{
 const source=fs.readFileSync(new URL('../ui-tests/helpers/open-team-preview.ts',import.meta.url),'utf8');
 assert.match(source,/await rail\.scrollIntoViewIfNeeded\(\)/);assert.match(source,/await rail\.hover\(\)/);
 assert.ok(source.indexOf('await rail.scrollIntoViewIfNeeded()')<source.indexOf('await rail.hover()'));
 assert.match(source,/page\.touchscreen\.tap\(target\.x, target\.y\)/);
 assert.doesNotMatch(source,/force\s*:\s*true|dispatchEvent\s*\(|waitForTimeout\s*\(|timeout\s*:/);
});
test('original team preview assertions remain with a real mobile touch context',()=>{
 const source=fs.readFileSync(new URL('../ui-tests/player-preview-v60-13-2.spec.ts',import.meta.url),'utf8');
 assert.match(source,/isMobile:width===390,hasTouch:width===390/);
 for(const expected of ['Saved public faculty biography.','Close team preview','Full faculty profile →','origin+\'/login?next=%2Fteam\'','origin+\'/team\''])assert.ok(source.includes(expected),expected);
 assert.doesNotMatch(source,/test\.(?:skip|fixme)\s*\(|force\s*:\s*true/);
});
