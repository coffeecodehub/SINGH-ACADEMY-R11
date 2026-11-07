import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const require=createRequire(import.meta.url),sharp=require('../../backend/node_modules/sharp');
const {SOURCES,optimizeGlobalLearningAssets}=require('../../scripts/optimize-global-learning-assets.cjs');
const root=fileURLToPath(new URL('../../',import.meta.url)),publicDir=path.join(root,'frontend/public');
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const manifest=readJson('frontend/lib/image-manifest.json'),provenance=readJson('docs/global-learning-images.json');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('all five known original photographs retain their uploaded bytes and have smaller responsive WebP copies',async()=>{
 assert.deepEqual([...SOURCES].sort(),provenance.images.map(image=>image.src).sort());
 for(const original of provenance.images){
  const raw=fs.readFileSync(path.join(publicDir,original.src)),entry=manifest[original.src];
  assert.equal(sha256(raw),original.sha256,original.src+' original bytes');
  assert.equal(raw.length,original.bytes);
  assert.ok(entry,original.src+' is mapped');
  assert.equal(entry.width,original.displayWidth);assert.equal(entry.height,original.displayHeight);
  assert.deepEqual(entry.variants.map(variant=>variant.width),[240,480,800,1280,1920]);
  assert.equal(entry.src,entry.variants.find(variant=>variant.width===800).src);
  for(const variant of entry.variants){
   assert.equal(variant.src,'/optimized/'+original.sha256.slice(0,16)+'-'+variant.width+'.webp');
   const bytes=fs.readFileSync(path.join(publicDir,variant.src)),metadata=await sharp(bytes).metadata();
   assert.equal(bytes.length,variant.bytes);assert.equal(metadata.format,'webp');
   assert.equal(metadata.width,variant.width);assert.equal(metadata.height,variant.height);
   assert.ok(Math.abs(variant.height-variant.width*original.displayHeight/original.displayWidth)<=1,'orientation/aspect ratio retained');
  }
  assert.ok(entry.variants.find(variant=>variant.width===480).bytes<raw.length/4,'card copy is substantially smaller');
 }
});

test('direct photos and CMS replacements use responsive copies while preserving presentation props and original fallback',async()=>{
 for(const src of SOURCES)for(const replacement of [false,true]){
  const h=hookHarness(),props={src:replacement?'/saved-slot.jpg':src,alt:'Saved description',width:640,height:426,sizes:'(max-width: 640px) 90vw, 420px',style:{objectFit:'cover',objectPosition:'62% 42%'}};
  const component=compileModule('../components/AcademyImage.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../lib/image-manifest.json':{default:manifest},'./WebsiteContent':{useWebsiteContent:()=>({images:replacement?[{src:'/saved-slot.jpg',url:src}]:[]})},'../lib/api':{portalMediaUrl:value=>value},'../lib/useHydrated':{useHydrated:()=>true},'../lib/imageSources':{academyImageVariants:()=>null,retryImageSource:value=>value}},globals:{...browserGlobals(),...h.globals}}).default;
  try{
   h.mount(()=>component(props));await h.settle();const image=h.tree.props;
   assert.equal(image.src,manifest[src].src);
   assert.equal(image.srcSet,manifest[src].variants.map(variant=>variant.src+' '+variant.width+'w').join(', '));
   assert.equal(image.sizes,props.sizes);assert.equal(image.width,props.width);assert.equal(image.height,props.height);assert.equal(image.alt,props.alt);assert.deepEqual(image.style,props.style);
   image.onError({currentTarget:{removeAttribute(){}}});await h.settle();
   assert.equal(h.tree.props.src,src);assert.equal(h.tree.props.srcSet,undefined);
  }finally{h.cleanup();}
 }
});

test('the additive generator preserves unrelated manifest entries/assets and is idempotent',async t=>{
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'sa-global-learning-'));t.after(()=>fs.rmSync(fixture,{recursive:true,force:true}));
 const write=(name,bytes)=>{const file=path.join(fixture,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
 const photo=await sharp({create:{width:300,height:200,channels:3,background:'#4b7566'}}).jpeg().toBuffer();
 const unrelated={src:'/optimized/preserved.webp',width:100,height:100,variants:[]};
 write('frontend/lib/image-manifest.json',JSON.stringify({'/unrelated.jpg':unrelated}));
 write('frontend/public/optimized/preserved.webp','immutable existing bytes');
 write('frontend/public/unrelated.jpg','immutable original');
 write('docs/global-learning-images.json',JSON.stringify({images:SOURCES.map(src=>({src,sha256:sha256(photo)}))}));
 for(const src of SOURCES)write('frontend/public'+src,photo);
 await optimizeGlobalLearningAssets({root:fixture,sharp});
 const manifestPath=path.join(fixture,'frontend/lib/image-manifest.json'),first=fs.readFileSync(manifestPath);
 assert.deepEqual(JSON.parse(first)['/unrelated.jpg'],unrelated);
 assert.equal(fs.readFileSync(path.join(fixture,'frontend/public/optimized/preserved.webp'),'utf8'),'immutable existing bytes');
 assert.equal(fs.readFileSync(path.join(fixture,'frontend/public/unrelated.jpg'),'utf8'),'immutable original');
 for(const src of SOURCES){assert.ok(fs.readFileSync(path.join(fixture,'frontend/public'+src)).equals(photo));assert.deepEqual(JSON.parse(first)[src].variants.map(variant=>variant.width),[240,300]);}
 const second=await optimizeGlobalLearningAssets({root:fixture,sharp});assert.equal(second.addedFiles,0);assert.ok(fs.readFileSync(manifestPath).equals(first));
 const target=JSON.parse(first)[SOURCES[0]].variants[0].src;
 write('frontend/public'+target,'protected different existing bytes');
 await assert.rejects(optimizeGlobalLearningAssets({root:fixture,sharp}),/Refusing to overwrite/);
 assert.equal(fs.readFileSync(path.join(fixture,'frontend/public'+target),'utf8'),'protected different existing bytes');
 assert.ok(fs.readFileSync(manifestPath).equals(first));
});
