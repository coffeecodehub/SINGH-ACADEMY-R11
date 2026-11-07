/** Native Chromium / controlled JSX-CSS fixture, not Next/React E2E.
 * Executes the exact TypeScript interaction helper with bounded assertion
 * adapters (real DOM checks) and the available Playwright core browser driver.
 */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=process.env.PROJECT_ROOT,fixtures=process.env.FIXTURES_DIR||path.dirname(new URL(import.meta.url).pathname);
const {compileModule}=await import(pathToFileURL(path.join(root,'frontend/test/compile.mjs')));
const target=await import(pathToFileURL(path.join(root,'frontend/ui-tests/helpers/team-preview-target.mjs')));
const {chromium}=await import(process.env.PLAYWRIGHT_CORE_PATH||'/opt/pyvenv/lib/python3.13/site-packages/playwright/driver/package/index.mjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function loadDOM(page,count){
 const html=fs.readFileSync(path.join(fixtures,`team-${count}.html`),'utf8')
 .replace('<link rel="stylesheet" href="/styles.css">','<style>'+fs.readFileSync(path.join(fixtures,'styles.css'),'utf8')+'</style>')
 .replace("history.pushState({},'', '/login?next=%2Fteam');","window.profileDestination='/login?next=%2Fteam';");
 await page.setContent(html);
}

async function poll(fn,predicate,label){const deadline=Date.now()+5000;let last;while(Date.now()<deadline){last=await fn();if(predicate(last))return;await wait(30);}throw Error(label+': '+JSON.stringify(last));}
function expect(locator){return{
 toHaveCount:n=>poll(()=>locator.count(),v=>v===n,'count'),
 toBeInViewport:()=>poll(()=>locator.evaluate(el=>{const r=el.getBoundingClientRect();return r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;}),Boolean,'viewport'),
 toBeVisible:()=>poll(async()=>await locator.count()===1&&await locator.isVisible(),Boolean,'visible'),
};}
expect.poll=fn=>({toBe:value=>poll(fn,v=>v===value,'poll equal'),not:{toBeNull:()=>poll(fn,v=>v!==null,'poll not-null')}});
const {openTeamPreview}=compileModule('../ui-tests/helpers/open-team-preview.ts',{imports:{'@playwright/test':{expect},'./team-preview-target.mjs':target}});
const server=http.createServer((req,res)=>{const file=path.join(fixtures,new URL(req.url,'http://local').pathname);if(!file.startsWith(fixtures+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const report={kind:'isolated offline DOM-only native Chromium setContent; actual JSX/CSS, controlled DOM bridge, profile intent only; NOT Next or route navigation. Loopback navigation was blocked by administrator policy.',browser:browser.version(),originalReproductions:[],cases:[]};
try{
 // Prove the old sequence stalls with the real moving stylesheet. The shortened
 // deadline is only for this negative diagnostic, not an application test change.
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:940}}),page=await context.newPage();
  await loadDOM(page,1);await page.mouse.move(0,0);
  let reproduced=false,message='';try{await page.locator('.teamTrackLeft button.teamCard').first().scrollIntoViewIfNeeded({timeout:1400});}catch(e){message=String(e);reproduced=/not stable/.test(message);}
  report.originalReproductions.push({width,reproduced,message:message.slice(0,1800)});assert.equal(reproduced,true,'old moving-card scroll must reproduce instability');await context.close();
 }
 for(const [width,height,input,count] of [[390,940,'touch',1],[390,940,'touch',17],[820,940,'touch',17],[844,500,'touch',17],[1440,940,'mouse',1],[1440,940,'mouse',17]]){
  for(const phase of [0,0.48,0.93]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:input==='touch',isMobile:input==='touch'}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));await loadDOM(page,count);
   // Seed three realistic points in the ORIGINAL 36-second animation cycle;
   // animations remain running at original speed. No CSS override or pause.
   await page.locator('.teamTrackLeft').evaluate((el,fraction)=>{const a=el.getAnimations()[0];if(a)a.currentTime=Number(a.effect.getTiming().duration)*fraction;},phase);
   const before=Date.now();let openedNames=[];
   for(let cycle=0;cycle<3;cycle++){
    const modal=await openTeamPreview(page,input),name=await modal.locator('h2').innerText();openedNames.push(name);
    assert.ok((await modal.innerText()).includes('Saved public faculty biography'));
    assert.equal(page.url(),'about:blank');assert.equal(await page.evaluate(()=>window.profileDestination),undefined);
    const evidence=await page.evaluate(()=>window.clickEvidence);assert.equal(evidence.filter(e=>e.type==='open').length,cycle+1);assert.ok(evidence.every(e=>e.trusted===true),'only trusted native input');
    if(cycle===0)await page.keyboard.press('Escape');
    if(cycle===1)await modal.getByRole('button',{name:'Close team preview',exact:true}).click();
    if(cycle<2)assert.equal(await page.getByRole('dialog').count(),0);
    if(cycle===2){if(phase===0&&count===17&&(width===390||width===1440))await page.screenshot({path:path.join(fixtures,`preview-${width}.png`)});await modal.getByRole('link',{name:'Full faculty profile →',exact:true}).click();assert.equal(await page.evaluate(()=>window.profileDestination),'/login?next=%2Fteam');}
   }
   assert.deepEqual(errors,[]);const result={width,height,input,members:count,phase,passed:true,openedNames,ms:Date.now()-before};report.cases.push(result);console.log(JSON.stringify(result));await context.close();
  }
 }
 report.passed=true;
} catch(e){report.passed=false;report.error=String(e.stack||e);console.error(e);process.exitCode=1;}
finally{await browser.close();server.close();fs.writeFileSync(path.join(fixtures,'native-results.json'),JSON.stringify(report,null,2));console.log('Native scenarios:',report.cases.length,'passed',report.passed);}
