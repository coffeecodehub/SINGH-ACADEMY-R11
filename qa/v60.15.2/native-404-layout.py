"""In-memory DOM/CSS comparison; does not access a web server or test Next."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(__file__).parent; payload=json.loads((out/'rendered-404-fixture.json').read_text())
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 metric='''() => ({overflow:document.documentElement.scrollWidth>innerWidth+1, elements:[...document.querySelectorAll('body,main,h1,p,a')].map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {tag:el.tagName,text:el.tagName==='BODY'?null:el.textContent,x:r.x,y:r.y,w:r.width,h:r.height,color:s.color,bg:s.backgroundColor,font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,radius:s.borderRadius,padding:s.padding,margin:s.margin};})})'''
 for width in [320,390,768,1440]:
  page.set_viewport_size({'width':width,'height':900})
  page.set_content(payload['baseline']); baseline=page.evaluate(metric)
  page.set_content(payload['updated']); actual=page.evaluate(metric)
  assert actual==baseline,{'width':width,'actual':actual,'baseline':baseline}
  assert not actual['overflow']
  assert page.get_by_role('heading',name='Page not found',exact=True).is_visible()
  assert page.get_by_role('link',name='Return to Singh Academy',exact=True).get_attribute('href')=='/'
  assert page.locator('script').count()==0
  results.append({'width':width,'approvedStatusStylesMatch':True,'overflow':False,'scriptCount':0})
  if width==1440:page.screenshot(path=str(out/'retired-404-layout.png'))
 browser.close()
print(json.dumps({'scope':'Native Chromium in-memory DOM/CSS comparison only; no Next router, HTTP status or session test','status':'passed','cases':results},indent=2))
