"""Actual Chromium + local HTTP helper fixture, not a Next/Mongo application run."""
import os, json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
root=sys.argv[1]; out=Path(__file__).parent
proc=subprocess.Popen(['node',str(out/'native-404-server.mjs'),root],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env={**os.environ,'TYPESCRIPT_PATH':'/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'})
results=[]
try:
 origin=proc.stdout.readline().strip(); assert origin.startswith('http://127.0.0.1:'),origin
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--no-proxy-server'])
  page=browser.new_page()
  metric='''() => ({overflow:document.documentElement.scrollWidth>innerWidth+1, elements:[...document.querySelectorAll('body,main,h1,p,a')].map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {tag:el.tagName,text:el.tagName==='BODY'?null:el.textContent,x:r.x,y:r.y,w:r.width,h:r.height,color:s.color,bg:s.backgroundColor,font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,radius:s.borderRadius,padding:s.padding,margin:s.margin};})})'''
  for width in [320,390,768,1440]:
   page.set_viewport_size({'width':width,'height':900})
   page.goto(origin+'/baseline'); baseline=page.evaluate(metric)
   for route in ['/free-resources','/resources']:
    response=page.goto(origin+route)
    assert response.status==404
    assert response.headers['x-robots-tag']=='noindex'
    actual=page.evaluate(metric)
    assert not actual['overflow']
    assert actual==baseline,{'width':width,'route':route,'actual':actual,'baseline':baseline}
    assert page.get_by_role('heading',name='Page not found',exact=True).is_visible()
    assert page.get_by_role('link',name='Return to Singh Academy',exact=True).get_attribute('href')=='/'
    assert page.locator('script').count()==0
    head=page.request.head(origin+route)
    assert head.status==404 and head.body()==b''
    results.append({'width':width,'route':route,'GET':404,'HEAD':404,'emptyHead':True,'stylesMatchExistingNotFound':True,'scriptCount':0})
   if width==1440:page.screenshot(path=str(out/'retired-404-layout.png'))
  browser.close()
 print(json.dumps({'scope':'Native Chromium against actual helper over HTTP; manual path dispatch, not Next routing/session middleware','cases':results,'status':'passed'},indent=2))
finally:
 proc.terminate()
 try:proc.wait(timeout=5)
 except subprocess.TimeoutExpired:proc.kill()
