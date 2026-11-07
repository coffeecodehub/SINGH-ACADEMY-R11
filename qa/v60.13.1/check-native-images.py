"""Executed with system Chromium + Python Playwright. Native image decoding diagnostic,
HTTP navigation is BLOCKED by this environment policy. This version uses only
local data-image decoding on about:blank, not HTTP or full Next/React E2E.
Reads the packaged JS PNG producer and production image sizes; touches no user DB.
"""
import asyncio,base64,html,json,os,pathlib,re,subprocess
from urllib.parse import urlsplit,parse_qs
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(__file__).resolve().parent
ORIGIN='http://127.0.0.1:3119'
PHOTO='/api/media/'+'f'*24
LEGACY='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4L8AAAAASUVORK5CYII='
# Real bytes from the updated JS fixture, not another hand-coded image.
producer="""import {catalogPhotoPng,CATALOG_PHOTO_WIDTHS} from './frontend/ui-tests/helpers/catalog-photo-fixture.mjs';
console.log(JSON.stringify(Object.fromEntries(CATALOG_PHOTO_WIDTHS.map(w=>[w,catalogPhotoPng(w).toString('base64')]))));"""
IMAGES=json.loads(subprocess.check_output(['node','--input-type=module','-e',producer],cwd=ROOT,text=True))
source=(ROOT/'frontend/lib/imageSources.ts').read_text()
SIZES={kind:re.search(r"export const "+constant+r"='([^']+)'",source).group(1) for kind,constant in [('course','COURSE_CARD_SIZES'),('team','TEAM_CARD_SIZES')]}

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  result={'scope':'isolated native data-image decoding only; HTTP navigation blocked; not Next/React E2E','browser':browser.version,'comparisons':[],'plain':[],'responsive':[]}
  page=await browser.new_page(viewport={'width':1200,'height':900})
  await page.goto('about:blank')
  for label,raw,responsive in [('V60.13 one pixel / src only',LEGACY,False),('V60.13 one pixel / declared 480w',LEGACY,True),('V60.13.1 actual 480px / declared 480w',IMAGES['480'],True)]:
   item=await page.evaluate('''async ({base64,responsive,sizes})=>{
    const img=new Image();let event='none';img.addEventListener('load',()=>event='load');img.addEventListener('error',()=>event='error');
    const src='data:image/png;base64,'+base64;if(responsive){img.sizes=sizes;img.srcset=src+' 480w';}img.src=src;
    let decoded=true;try{await img.decode();}catch{decoded=false;}
    await new Promise(r=>setTimeout(r,25));return {decoded,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,complete:img.complete,event};
   }''',{'base64':raw,'responsive':responsive,'sizes':SIZES['course']})
   result['comparisons'].append({'case':label,**item})
  assert result['comparisons'][1]['decoded'] and result['comparisons'][1]['naturalWidth']==0
  assert result['comparisons'][2]['decoded'] and result['comparisons'][2]['naturalWidth']>0
  for key,raw in IMAGES.items():
   item=await page.evaluate('''async src=>{const img=new Image();img.src=src;await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};}''','data:image/png;base64,'+raw)
   w=int(key);assert item=={'width':w,'height':round(w*9/16)}
   result['plain'].append({'requestedWidth':w,**item,'passed':True})
  await page.close()
  for viewport in [375,768,1200,1897]:
   for dpr in [1,2]:
    for kind,sizes in SIZES.items():
     context=await browser.new_context(viewport={'width':viewport,'height':900},device_scale_factor=dpr)
     page=await context.new_page();await page.goto('about:blank')
     item=await page.evaluate("""async ({images,sizes})=>{
      const sources=Object.entries(images).map(([width,bytes])=>({width:Number(width),src:'data:image/png;base64,'+bytes}));
      const img=new Image();img.loading='eager';img.fetchPriority='high';img.sizes=sizes;img.srcset=sources.map(x=>x.src+' '+x.width+'w').join(', ');img.src=sources.find(x=>x.width===720).src;
      document.body.append(img);await img.decode();const selected=sources.find(x=>x.src===img.currentSrc);
      const binary=Uint8Array.from(atob(images[String(selected.width)]),c=>c.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([binary],{type:'image/png'}));
      const result={complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,selectedWidth:selected.width,bitmapWidth:bitmap.width,bitmapHeight:bitmap.height};bitmap.close();img.remove();return result;
     }""",{'images':IMAGES,'sizes':sizes})
     selected=item['selectedWidth']
     assert item['complete'] and item['naturalWidth']>0 and item['naturalHeight']>0,item
     assert item['bitmapWidth']==selected and item['bitmapHeight']==round(selected*9/16),item
     # Data URLs have different selection/caching economics from HTTP. This
     # diagnostic tests decode and density, NOT network candidate selection.
     # The actual Next/browser test still requires 240w/480w/720w HTTP URLs.
     result['responsive'].append({'kind':kind,'viewport':viewport,'dpr':dpr,**item,'passed':True})
     await context.close()
  result['passedChecks']=len(result['plain'])+len(result['responsive'])
  result['failedChecks']=0
  (OUT/'chromium-native-image-results.json').write_text(json.dumps(result,indent=2)+'\n')
  print(json.dumps({'browser':result['browser'],'passedChecks':result['passedChecks'],'failedChecks':0,'comparisons':result['comparisons']},indent=2))
  await browser.close()
asyncio.run(main())
