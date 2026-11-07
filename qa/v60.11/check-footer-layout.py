import json,base64,re,mimetypes,shutil,os
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2];out=root/'qa/v60.11/footer-browser';public=root/'frontend/public'
css=(root/'frontend/app/styles.css').read_text()
def local_url(match):
 name=match.group(1).strip('\"\'');file=public/name.lstrip('/')
 if file.is_file():return 'url(data:'+(mimetypes.guess_type(str(file))[0] or 'application/octet-stream')+';base64,'+base64.b64encode(file.read_bytes()).decode()+')'
 return match.group(0)
css=re.sub(r'url\(([^)]+)\)',local_url,css)
logo='data:image/png;base64,'+base64.b64encode((public/'singh-academy-logo-clean.png').read_bytes()).decode()
markup=(out/'footer.html').read_text().replace('<link rel="stylesheet" href="/styles.css">','<style>'+css+'</style>').replace('src="/singh-academy-logo-clean.png"','src="'+logo+'"')
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 for width in [320,375,390,420,560,768,820,900,901,1024,1199,1200,1228,1366,1440,1700,1920]:
  page.set_viewport_size({'width':width,'height':950});page.set_content(markup,wait_until='load');page.evaluate('document.fonts.ready')
  data=page.evaluate('''()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,links:[...document.querySelectorAll('footer a')].map(e=>{const r=e.getBoundingClientRect();return {href:e.getAttribute('href'),left:r.left,right:r.right,text:e.textContent.trim()};})})''')
  data['ok']=data['scrollWidth']<=width+1 and all(a['left']>=-1 and a['right']<=width+1 for a in data['links']);results.append(data)
  if width in [390,820,1440]:page.locator('footer').screenshot(path=str(out/f'footer-{width}.png'))
 browser.close()
(out/'results.json').write_text(json.dumps(results,indent=2));failed=[r for r in results if not r['ok']]
print(f'{len(results)} footer viewport fixtures: {len(results)-len(failed)} pass, {len(failed)} fail');print(failed if failed else 'No horizontal clipping; actual contact links retained.')
raise SystemExit(bool(failed))
