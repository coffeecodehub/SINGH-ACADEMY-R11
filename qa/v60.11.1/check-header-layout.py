import json,base64,re,mimetypes,subprocess,shutil,os
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2]
out=root/'qa/v60.11.1/header-browser';out.mkdir(parents=True,exist_ok=True);results=[]
public=root/'frontend/public'
css=(root/'frontend/app/styles.css').read_text()
def local_url(match):
 url=match.group(1).strip('\"\'')
 file=public/url.lstrip('/')
 if file.is_file():
  mime=mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
  return 'url(data:'+mime+';base64,'+base64.b64encode(file.read_bytes()).decode()+')'
 return 'url('+match.group(1)+')'
css=re.sub(r'url\(([^)]+)\)',local_url,css)
logo='data:image/png;base64,'+base64.b64encode((public/'singh-academy-logo-clean.png').read_bytes()).decode()

subprocess.run(['node',str(root/'scripts/render-header-fixtures.mjs'),str(out/'header-fixtures')],cwd=root,check=True)
widths=[320,375,390,560,600,768,820,900,901,1024,1180,1199,1200,1228,1280,1366,1399,1400,1440,1536,1599,1600,1700,1920]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1280,'height':900},device_scale_factor=1)
 for user in ['guest','Jinjua','AlexandriaWithAnExceptionallyLongName']:
  for width in widths:
   for opened in [False,True]:
    page.set_viewport_size({'width':width,'height':900})
    markup=(out/'header-fixtures'/f'{user}-{"open" if opened else "closed"}.html').read_text().replace('<link rel="stylesheet" href="/styles.css">','<style>'+css+'</style>').replace('src="/singh-academy-logo-clean.png"','src="'+logo+'"')
    page.set_content(markup,wait_until='load')
    page.evaluate('document.fonts.ready')
    data=page.evaluate('''() => {
     const box = s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,visible:getComputedStyle(e).display!=='none'};};
     const brand=box('.brand'),nav=box('.nav nav'),actions=box('.actions'),toggle=box('.menuButton');
     const overlap=(a,b)=>a.visible&&b.visible&&a.w>0&&b.w>0&&a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;
     const links=[...document.querySelectorAll('.nav nav a')].map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent,x:r.x,right:r.right,y:r.y,bottom:r.bottom,w:r.width,h:r.height};});
     return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,brand,nav,actions,toggle,links,
      overlap:overlap(brand,nav)||overlap(brand,actions)||overlap(nav,actions),
      clipped:actions.x<0||actions.right>innerWidth+1||brand.x<0||brand.right>innerWidth+1};
    }''')
    expected_compact=width<=900
    problems=[]
    if data['scrollWidth']>width+1:problems.append('horizontal-overflow')
    if data['overlap']:problems.append('header-item-overlap')
    if data['clipped']:problems.append('header-item-clipped')
    if expected_compact and not data['toggle']['visible']:problems.append('toggle-hidden')
    if not expected_compact and data['toggle']['visible']:problems.append('desktop-toggle-visible')
    if data['nav']['visible']!=(opened if expected_compact else True):problems.append('wrong-nav-visibility')
    if data['nav']['visible']:
     for i,a in enumerate(data['links']):
      if a['x']<0 or a['right']>width+1:problems.append('nav-link-clipped');break
      for b in data['links'][i+1:]:
       if a['x']<b['right']-1 and a['right']>b['x']+1 and a['y']<b['bottom']-1 and a['bottom']>b['y']+1:problems.append('nav-links-overlap')
    results.append({'user':user,'opened':opened,**data,'problems':list(set(problems))})
    if width in [375,820,1228,1440] and user=='Jinjua':page.screenshot(path=str(out/f'header-{width}-{"open" if opened else "closed"}.png'))
 browser.close()
(out/'header-layout-results.json').write_text(json.dumps(results,indent=2))
failed=[r for r in results if r['problems']]
print(f'{len(results)} actual-header/CSS Chromium fixtures: {len(results)-len(failed)} pass, {len(failed)} fail')
for f in failed:print(f['user'],f['width'],f['opened'],f['problems'],'brand',f['brand'],'actions',f['actions'])
raise SystemExit(1 if failed else 0)
