/** Actual Next faculty lanes: automatic opposite motion in both preferences,
 * hover/focus pause and no Play/Pause opt-in control. API portraits are synthetic. */
import {test,expect,type BrowserContext,type Locator,type Page} from '@playwright/test';
import {CATALOG_PHOTO_PATH,catalogPhotoResponse} from './helpers/catalog-photo-fixture.mjs';

const origin='http://127.0.0.1:3108';
async function facultyFixture(context:BrowserContext){
 const members=Array.from({length:12},(_,index)=>{
  const id=(index+700).toString(16).padStart(24,'0');
  return {_id:id,name:'Motion Faculty '+index,role:'Faculty',category:'faculty',bio:'Synthetic public faculty biography.',image:'/api/media/'+id};
 });
 await context.route('**/api/content/landing',route=>route.fulfill({json:{success:true,team:members,sections:[],courses:[],reviews:[]}}));
 await context.route('**/api/media/**',route=>{
  const address=new URL(route.request().url());address.pathname=CATALOG_PHOTO_PATH;
  return route.fulfill(catalogPhotoResponse(address.href));
 });
}

/** Sample actual CSS transforms over browser animation frames. A fresh sample
 * retries naturally at the rare loop boundary instead of mistaking a wrap for
 * motion in the opposite direction. */
async function movement(page:Page){
 return page.locator('#faculty .teamTrack').evaluateAll(async elements=>{
  const positions=()=>elements.map(element=>{
   const transform=getComputedStyle(element).transform;
   return transform==='none'?0:new DOMMatrixReadOnly(transform).m41;
  });
  const before=positions(),started=performance.now();
  await new Promise<void>(resolve=>{
   const frame=()=>performance.now()-started>=450?resolve():requestAnimationFrame(frame);
   requestAnimationFrame(frame);
  });
  return positions().map((after,index)=>after-before[index]);
 });
}

async function oppositeMotion(page:Page){
 await expect.poll(async()=>{
  const delta=await movement(page);
  return delta.length===2&&delta[0]<-1&&delta[1]>1;
 },{timeout:8000,message:'Both actual faculty rows move in opposite horizontal directions'}).toBe(true);
}

async function trackState(track:Locator){
 return track.evaluate(element=>getComputedStyle(element).animationPlayState);
}

async function revealFaculty(page:Page){
 await expect(async()=>{
  const lane=page.locator('#faculty .teamMarquee').first();
  await lane.scrollIntoViewIfNeeded({timeout:2000});
  await expect(lane).toBeInViewport({timeout:2000});
 }).toPass({timeout:10000});
}

test('faculty rows move in opposite directions and pause the hovered or focused lane',async({page,context})=>{
 await facultyFixture(context);await page.setViewportSize({width:1440,height:1000});
 await page.emulateMedia({reducedMotion:'no-preference'});await page.mouse.move(0,0);
 await page.goto('/');
 const left=page.locator('#faculty .teamTrackLeft'),right=page.locator('#faculty .teamTrackRight');
 const firstLane=page.locator('#faculty .teamMarquee').first();
 await expect(left.locator('.teamCard')).toHaveCount(24);await expect(right.locator('.teamCard')).toHaveCount(24);
 await expect(page.getByRole('button',{name:'Play faculty animation',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Pause faculty animation',exact:true})).toHaveCount(0);
 await revealFaculty(page);await page.mouse.move(0,0);
 await expect.poll(()=>trackState(left)).toBe('running');await expect.poll(()=>trackState(right)).toBe('running');
 await oppositeMotion(page);

 await firstLane.hover({position:{x:12,y:12}});
 await expect.poll(()=>trackState(left)).toBe('paused');await expect.poll(()=>trackState(right)).toBe('running');
 let delta=await movement(page);expect(Math.abs(delta[0])).toBeLessThan(0.5);expect(delta[1]).toBeGreaterThan(1);
 await page.mouse.move(0,0);await oppositeMotion(page);

 const facultyButton=left.locator('.teamCard').first();await facultyButton.focus();await expect(facultyButton).toBeFocused();
 await expect.poll(()=>trackState(left)).toBe('paused');await expect.poll(()=>trackState(right)).toBe('running');
 delta=await movement(page);expect(Math.abs(delta[0])).toBeLessThan(0.5);expect(delta[1]).toBeGreaterThan(1);
});

test('reduced motion keeps both faculty rows automatic without Play/Pause controls',async({page,context})=>{
 await facultyFixture(context);await page.setViewportSize({width:1440,height:1000});
 await page.emulateMedia({reducedMotion:'reduce'});await page.mouse.move(0,0);await page.goto('/');
 const left=page.locator('#faculty .teamTrackLeft'),right=page.locator('#faculty .teamTrackRight');
 const firstLane=page.locator('#faculty .teamMarquee').first(),secondLane=page.locator('#faculty .teamMarquee.secondRow');
 await expect(left.locator('.teamCard')).toHaveCount(24);await expect(right.locator('.teamCard')).toHaveCount(24);await revealFaculty(page);await page.mouse.move(0,0);
 await expect(firstLane).toBeVisible();await expect(secondLane).toBeVisible();await expect(secondLane).toHaveAttribute('aria-hidden','true');
 await expect(page.getByRole('button',{name:/^(Play|Pause) faculty animation$/})).toHaveCount(0);await expect(page.locator('.facultyMotionToggle')).toHaveCount(0);
 for(const track of [left,right]){await expect.poll(()=>trackState(track)).toBe('running');expect(await track.evaluate(element=>parseFloat(getComputedStyle(element).animationDuration))).toBeGreaterThan(36);}
 await oppositeMotion(page);
 await firstLane.hover({position:{x:12,y:12}});await expect.poll(()=>trackState(left)).toBe('paused');await expect.poll(()=>trackState(right)).toBe('running');
 await page.mouse.move(0,0);await oppositeMotion(page);
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(secondLane).toBeVisible();await oppositeMotion(page);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(secondLane).toBeVisible();await oppositeMotion(page);
});
