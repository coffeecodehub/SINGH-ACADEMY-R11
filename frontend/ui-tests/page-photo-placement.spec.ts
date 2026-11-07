/** Real Next pages and real public image responses. The existing loopback login
 * fixture supplies the student session; original photographs are never mocked. */
import {test,expect,type BrowserContext,type Locator} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

type PhotoPage='landing'|'home'|'about';
type ManifestPhoto={
 src:string;bytes:number;sha256:string;displayWidth:number;displayHeight:number;
 placement:{page:PhotoPage;slot:string};presentation:{fit:string;objectPosition:string};
};
const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/global-learning-images.json'),'utf8')) as {images:ManifestPhoto[]};
type DisplayVariant={src:string;width:number;height:number;bytes:number};
const displayManifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../lib/image-manifest.json'),'utf8')) as Record<string,{src:string;variants:DisplayVariant[]}>;
const displayProvenance=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/hero-display-variants-r8.json'),'utf8')) as {images:{original:string;variants:(DisplayVariant&{sha256:string})[]}[]};
type HeroOverride={src:string;width:number;height:number;objectPosition:string};
const overrideFile=path.resolve(__dirname,'../lib/heroPhotos.json');
const heroOverrides=(fs.existsSync(overrideFile)?JSON.parse(fs.readFileSync(overrideFile,'utf8')):{}) as {landing?:HeroOverride|null;home?:HeroOverride|null};
// An explicit local original-photo import changes the two active hero slots,
// while all five historical originals must still be served byte-for-byte.
const importedHeroes:ManifestPhoto[]=[];
const activePhotos=manifest.images.map(photo=>{
 const override=photo.placement.slot==='hero'&&photo.placement.page!=='about'?heroOverrides[photo.placement.page]:null;
 if(!override)return photo;
 const identity=override.src.match(/^\/images\/hero-overrides\/([a-f0-9]{64})\.(jpg|png)$/);
 if(!identity||!Number.isInteger(override.width)||override.width<1||!Number.isInteger(override.height)||override.height<1)throw new Error('Invalid explicitly imported hero photo metadata: '+photo.placement.page);
 const imported={...photo,src:override.src,sha256:identity[1],bytes:fs.statSync(path.resolve(__dirname,'../public'+override.src)).size,displayWidth:override.width,displayHeight:override.height,presentation:{fit:'cover',objectPosition:override.objectPosition}};
 importedHeroes.push(imported);return imported;
});
const origin='http://127.0.0.1:3108';
test.beforeEach(async({page})=>{
 if(!importedHeroes.length)return;
 // Historical CMS records must not mask imported originals, or survive into
 // an unrelated editor save and be rebased onto the new hero source paths.
 const stale=manifest.images.filter(photo=>photo.placement.slot==='hero').map(photo=>({key:photo.placement.page==='landing'?'image-075':'image-077',src:photo.src,url:photo.src}));
 await page.route('**/api/content/site',route=>route.fulfill({json:{success:true,content:{membershipPlans:[],footerSocial:{},websiteContent:{text:{},images:stale}}}}));
});
const placements={
 landing:{
  hero:{selector:'.heroVisual > img.originalLearningPhoto',frame:'.heroVisual',maxHeight:520},
  story:{selector:'.academyStoryGrid article:first-child > img.originalLearningPhoto',frame:'.academyStoryGrid article',maxHeight:480},
 },
 home:{
  hero:{selector:'.storeHeroImages > img.originalLearningPhoto:first-child',frame:'.storeHeroImages',maxHeight:520},
  event:{selector:'.eventMosaic > img.originalLearningPhoto:nth-child(2)',frame:'.eventMosaic',maxHeight:260},
 },
 about:{gallery:{selector:'.aboutGallery figure > img.originalLearningPhoto',frame:'.aboutGallery figure',maxHeight:300}},
} as const;

async function signIn(context:BrowserContext){
 const response=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-Portal':'student','X-SA-CSRF':'1'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});
 expect(response.ok()).toBe(true);
}

async function imageGeometry(image:Locator,frameSelector:string){
 return image.evaluate((element:HTMLImageElement,selector)=>{
  const box=element.getBoundingClientRect(),frame=element.closest(selector)!;
  const frameBox=frame.getBoundingClientRect(),style=getComputedStyle(element);
  return {
   width:box.width,height:box.height,left:box.left,right:box.right,top:box.top,bottom:box.bottom,
   frameLeft:frameBox.left,frameRight:frameBox.right,frameTop:frameBox.top,frameBottom:frameBox.bottom,
   frameWidth:frame.clientWidth,frameContentWidth:frame.scrollWidth,
   fit:style.objectFit,transform:style.transform,position:style.objectPosition,
  };
 },frameSelector);
}

for(const width of [1440,390])test(`all five active photos occupy their existing page slots with curated cover crops and no empty bands or overflow at ${width}px`,async({page,context})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 const seen:string[]=[];
 for(const name of ['landing','home','about'] as const){
  if(name==='home')await signIn(context);
  const route=name==='landing'?'/':'/'+name;await page.goto(route);await expect(page).toHaveURL(origin+route);
  const expected=activePhotos.filter(photo=>photo.placement.page===name);
  const uploaded=page.locator('img.originalLearningPhoto');
  await expect(uploaded).toHaveCount(name==='about'?1:2);
  const sources=await uploaded.evaluateAll(elements=>elements.map(element=>element.getAttribute('src')||''));
  expect([...sources].sort()).toEqual(expected.map(photo=>displayManifest[photo.src]?.src||photo.src).sort());
  expect(new Set(sources).size).toBe(sources.length);seen.push(...sources);
  await expect(page.locator('.globalLearningGallery,.globalLearningGrid')).toHaveCount(0);

  // These archives contain group/two-person photographs, not a new founder solo.
  const founder=page.locator('.founderProfilePortrait img');await expect(founder).toHaveCount(1);
  await expect(founder).toHaveAttribute('src','/images/founder/dr-sukhsimranjit-singh.png');

  for(const photo of expected){
   const placement=(placements[name] as Record<string,{selector:string;frame:string;maxHeight:number}>)[photo.placement.slot];
   expect(placement,`${name}/${photo.placement.slot} is an existing supported image slot`).toBeTruthy();
   const image=page.locator(placement.selector);
   const display=displayManifest[photo.src];
   await expect(image).toHaveCount(1);await expect(image).toHaveAttribute('src',display?.src||photo.src);
   await expect(image).toHaveAttribute('data-learning-page',name);await expect(image).toHaveAttribute('data-learning-slot',photo.placement.slot);
   await expect(image).toHaveAttribute('width',String(photo.displayWidth));await expect(image).toHaveAttribute('height',String(photo.displayHeight));
   await expect(image).toHaveAttribute('alt',/\S/);await expect(image).toHaveAttribute('title',/\S/);
   await image.scrollIntoViewIfNeeded();
   await expect.poll(()=>image.evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0&&element.naturalHeight>0)).toBe(true);
   await expect(image).toHaveAttribute('data-image-state','loaded');
   const decoded=await image.evaluate((element:HTMLImageElement)=>({width:element.naturalWidth,height:element.naturalHeight,currentSrc:element.currentSrc}));
   if(display){
    await expect(image).toHaveAttribute('srcset',display.variants.map(variant=>`${variant.src} ${variant.width}w`).join(', '));
    expect(display.variants.map(variant=>origin+variant.src)).toContain(decoded.currentSrc);
    // Responsive width descriptors may density-correct naturalWidth. Preserve
    // original intrinsic HTML dimensions and verify the decoded aspect ratio.
    expect(Math.abs(decoded.width/decoded.height-photo.displayWidth/photo.displayHeight)).toBeLessThanOrEqual(2/decoded.height);
   }else expect({width:decoded.width,height:decoded.height}).toEqual({width:photo.displayWidth,height:photo.displayHeight});
   const captureDir=process.env.R8_CAPTURE_DIR;
   if(captureDir&&photo.placement.slot==='hero'){
    fs.mkdirSync(captureDir,{recursive:true});
    await image.screenshot({path:path.join(captureDir,`${name}-photo-${width}.png`)});
    await page.locator(name==='landing'?'.hero':'.storeHero').screenshot({path:path.join(captureDir,`${name}-hero-${width}.png`)});
   }
   const geometry=await imageGeometry(image,placement.frame);
   expect(geometry.fit).toBe('cover');expect(geometry.transform).toBe('none');expect(geometry.position).toBe(photo.presentation.objectPosition);
   const coverScale=Math.max(geometry.width/photo.displayWidth,geometry.height/photo.displayHeight);
   expect(photo.displayWidth*coverScale).toBeGreaterThanOrEqual(geometry.width-0.5);expect(photo.displayHeight*coverScale).toBeGreaterThanOrEqual(geometry.height-0.5);
   expect(geometry.width).toBeGreaterThan(0);expect(geometry.width).toBeLessThan(width);
   expect(geometry.height).toBeGreaterThan(0);expect(geometry.height).toBeLessThanOrEqual(placement.maxHeight+1);
   expect(geometry.left).toBeGreaterThanOrEqual(geometry.frameLeft-1);expect(geometry.right).toBeLessThanOrEqual(geometry.frameRight+1);
   expect(geometry.top).toBeGreaterThanOrEqual(geometry.frameTop-1);expect(geometry.bottom).toBeLessThanOrEqual(geometry.frameBottom+1);
   expect(geometry.frameContentWidth).toBeLessThanOrEqual(geometry.frameWidth+1);
   // Existing decorative frame overlays receive the pointer in the hero.
   // Hover that real frame to exercise its CSS without bypassing hit testing.
   await image.locator('..').hover();
   await expect.poll(()=>image.evaluate(element=>getComputedStyle(element).transform)).toBe('none');
   const hovered=await imageGeometry(image,placement.frame);
   expect(Math.abs(hovered.width-geometry.width)).toBeLessThanOrEqual(1);expect(Math.abs(hovered.height-geometry.height)).toBeLessThanOrEqual(1);
  }

  if(name==='home'){
   const sizes=await page.locator('.eventMosaic > img').evaluateAll(elements=>elements.slice(1).map(element=>{const box=element.getBoundingClientRect();return {width:box.width,height:box.height};}));
   expect(sizes).toHaveLength(2);expect(Math.abs(sizes[0].width-sizes[1].width)).toBeLessThanOrEqual(1);expect(Math.abs(sizes[0].height-sizes[1].height)).toBeLessThanOrEqual(1);
  }
  if(name==='about'){
   const gallery=await page.locator('.aboutGallery').evaluate(element=>{
    const image=element.querySelector('img.originalLearningPhoto')!,figure=image.closest('figure')!;
    const uploaded=figure.getBoundingClientRect();
    const regular=Array.from(element.querySelectorAll('figure')).filter(item=>item!==figure&&item!==element.firstElementChild).map(item=>item.getBoundingClientRect().height);
    return {uploadedHeight:uploaded.height,regularHeights:regular};
   });
   expect(gallery.regularHeights.length).toBeGreaterThan(0);
   expect(gallery.regularHeights.some(height=>Math.abs(height-gallery.uploadedHeight)<=1)).toBe(true);
   expect(gallery.uploadedHeight).toBeLessThanOrEqual(301);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 expect(seen).toHaveLength(5);expect(new Set(seen).size).toBe(5);
 expect([...seen].sort()).toEqual(activePhotos.map(photo=>displayManifest[photo.src]?.src||photo.src).sort());
});

test('Next serves all five retained originals and any explicitly imported hero bytes unchanged',async({request})=>{
 expect(manifest.images).toHaveLength(5);
 for(const photo of [...manifest.images,...importedHeroes]){
  const response=await request.get(origin+photo.src);
  try{
   expect(response.status(),photo.src).toBe(200);expect(response.headers()['content-type']).toMatch(photo.src.endsWith('.png')?/^image\/png(?:;|$)/:/^image\/jpeg(?:;|$)/);
   const bytes=await response.body();expect(bytes.length,photo.src).toBe(photo.bytes);
   expect(createHash('sha256').update(bytes).digest('hex'),photo.src).toBe(photo.sha256);
  }finally{await response.dispose();}
 }
 for(const image of displayProvenance.images)for(const variant of image.variants){
  const response=await request.get(origin+variant.src);
  try{
   expect(response.status(),variant.src).toBe(200);expect(response.headers()['content-type']).toMatch(variant.src.endsWith('.webp')?/^image\/webp(?:;|$)/:/^image\/jpeg(?:;|$)/);
   const bytes=await response.body();expect(bytes.length,variant.src).toBe(variant.bytes);
   expect(createHash('sha256').update(bytes).digest('hex'),variant.src).toBe(variant.sha256);
  }finally{await response.dispose();}
 }
});
