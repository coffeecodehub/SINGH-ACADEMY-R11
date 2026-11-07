/** Native Chromium layout checks using the real project styles. This fixture
 * isolates hit testing/scrolling; the existing landing test exercises React. */
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {CATALOG_PHOTO_PATH,catalogPhotoResponse} from './helpers/catalog-photo-fixture.mjs';
const styles=fs.readFileSync(path.resolve(__dirname,'../app/styles.css'),'utf8');
const contentStyles=fs.readFileSync(path.resolve(__dirname,'../components/content/page-sections.css'),'utf8');
const photo='data:image/png;base64,'+catalogPhotoResponse('http://fixture.local'+CATALOG_PHOTO_PATH).body.toString('base64');
for(const width of [390,1440])for(const longBiography of [false,true])test(`faculty modal portrait never intercepts profile/close controls at ${width}px with ${longBiography?'long':'short'} biography`,async({page})=>{
 await page.setViewportSize({width,height:940});await page.emulateMedia({reducedMotion:'reduce'});
 const biography=longBiography?'A professional biography that must remain readable in the dialog. '.repeat(90):'Saved public faculty biography.';
 await page.setContent(`<!doctype html><html><head><style>${styles}\n${contentStyles}</style></head><body><section id="faculty"><div class="teamMarquee"><div class="teamTrack teamTrackLeft">Faculty track</div></div></section><div class="modalBackdrop"><section class="memberModal" role="dialog" aria-label="Preview Faculty"><img class="modalPortrait" src="${photo}" alt="Preview Faculty"><button type="button" class="modalClose" aria-label="Close team preview" onclick="this.closest('.modalBackdrop').remove()">×</button><span class="kicker">TEAM PROFILE</span><h2>Preview Faculty</h2><strong>Faculty</strong><p>${biography}</p><a class="textLink" href="#full-profile" onclick="window.profileOpened=true">Full faculty profile →</a></section></div></body></html>`);
 const dialog=page.getByRole('dialog',{name:'Preview Faculty'}),portrait=dialog.getByRole('img'),link=dialog.getByRole('link',{name:'Full faculty profile →',exact:true}),close=dialog.getByRole('button',{name:'Close team preview',exact:true});
 await expect(portrait).toBeVisible();await expect.poll(()=>portrait.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
 await expect.poll(()=>page.locator('.teamTrackLeft').evaluate(element=>getComputedStyle(element).animationName)).toBe('facultyLaneLeft');
 const geometry=await dialog.evaluate(element=>{const photo=element.querySelector('.modalPortrait')!.getBoundingClientRect(),heading=element.querySelector('h2')!.getBoundingClientRect();return {photoBottom:photo.bottom,headingTop:heading.top,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight};});
 expect(geometry.headingTop).toBeGreaterThanOrEqual(geometry.photoBottom);
 if(longBiography)expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
 await link.scrollIntoViewIfNeeded();await expect(link).toBeInViewport();
 expect(await link.evaluate(element=>{const rect=element.getBoundingClientRect();return document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)?.closest('a')===element;})).toBe(true);
 await link.click();await expect.poll(()=>page.evaluate(()=>(window as any).profileOpened===true)).toBe(true);
 if(longBiography)expect(await dialog.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
 await expect(close).toBeInViewport();await close.click();await expect(dialog).toHaveCount(0);
});
