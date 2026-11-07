"""Executed with system Chromium + Python Playwright. Native image/HTTP diagnostic,
not a replacement for the full Next/React application's Playwright release gate.
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
  result={'scope':'isolated native image decoding; not full Next/React E2E','browser':browser.version,'comparisons':[],'plain':[],'responsive':[]}
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
     requests=[]
     async def serve(route):
      url=urlsplit(route.request.url)
      if url.path==PHOTO:
       w=parse_qs(url.query).get('w',['1600'])[0];requests.append(route.request.url)
       return await route.fulfill(status=200,content_type='image/png',body=base64.b64decode(IMAGES[w]))
      srcset=', '.join(PHOTO+'?w='+w+' '+w+'w' for w in IMAGES)
      document='<!doctype html><html><head><meta charset="utf-8"></head><body><img id="photo" loading="eager" fetchpriority="high" src="'+PHOTO+'?w=720" srcset="'+html.escape(srcset,quote=True)+'" sizes="'+html.escape(sizes,quote=True)+'" alt="Synthetic catalog photo"></body></html>'
      await route.fulfill(status=200,content_type='text/html; charset=utf-8',body=document)
     await context.route(ORIGIN+'/**',serve)
     page=await context.new_page();await page.goto(ORIGIN+'/')
     item=await page.evaluate('''async()=>{const img=document.getElementById('photo');await img.decode();const response=await fetch(img.currentSrc);const bitmap=await createImageBitmap(await response.blob());const result={complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,currentSrc:img.currentSrc,bitmapWidth:bitmap.width,bitmapHeight:bitmap.height};bitmap.close();return result;}''')
     selected=int(parse_qs(urlsplit(item['currentSrc']).query)['w'][0])
     assert item['complete'] and item['naturalWidth']>0 and item['naturalHeight']>0,item
     assert item['bitmapWidth']==selected and item['bitmapHeight']==round(selected*9/16),item
     if viewport==1200 and dpr==1:assert selected<=720
     result['responsive'].append({'kind':kind,'viewport':viewport,'dpr':dpr,**item,'requests':requests,'passed':True})
     await context.close()
  result['passedChecks']=len(result['plain'])+len(result['responsive'])
  result['failedChecks']=0
  (OUT/'chromium-responsive-image-results.json').write_text(json.dumps(result,indent=2)+'\n')
  print(json.dumps({'browser':result['browser'],'passedChecks':result['passedChecks'],'failedChecks':0,'comparisons':result['comparisons']},indent=2))
  await browser.close()
asyncio.run(main())
