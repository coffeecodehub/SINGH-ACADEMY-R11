"""Real Chromium + actual API client/gateway, with a local emulated upstream.
Not a Next.js UI, MongoDB, Stripe/PayPal or hosted acceptance test.
Requires Python playwright, Chromium and installed frontend TypeScript (or TYPESCRIPT_PATH).
"""
from pathlib import Path
import json, os, shutil, subprocess
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2]
proc=subprocess.Popen(['node',str(Path(__file__).with_name('gateway-browser-fixture.mjs'))],cwd=root,env=os.environ.copy(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
checks=[]
def ok(name):
    checks.append({'check':name,'pass':True}); print('PASS',name)
try:
    line=proc.stdout.readline()
    if not line: raise RuntimeError(proc.stderr.read())
    origin=json.loads(line)['front']
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=shutil.which('chromium') or None,headless=True,args=['--no-sandbox'])
        ca,cb=browser.new_context(),browser.new_context()
        a,b=ca.new_page(),cb.new_page();a.goto(origin);b.goto(origin)
        invoke="""async ({path,method='GET',body})=>window.sa.apiFetch(path,{method,...(body?{body:JSON.stringify(body)}:{})})"""
        def request(page,path,method='GET',body=None):return page.evaluate(invoke,{'path':path,'method':method,'body':body})
        request(a,'/auth/login','POST',{'id':'learner-a'});request(b,'/auth/login','POST',{'id':'learner-b'})
        assert request(a,'/auth/session')['user']['id']=='learner-a'
        assert request(b,'/auth/session')['user']['id']=='learner-b'
        ok('Two browser contexts retain independent authenticated identities')
        cookies=ca.cookies();session=next(x for x in cookies if x['name']=='sa_student_v45')
        assert session['domain']=='127.0.0.1' and session['httpOnly']
        assert 'sa_student' not in a.evaluate('document.cookie')
        ok('Upstream Domain stripped: host-only HttpOnly cookie stored and hidden from JavaScript')
        for _ in range(20):
            assert request(a,'/auth/session')['user']['id']=='learner-a'
            assert request(b,'/auth/session')['user']['id']=='learner-b'
        ok('Forty session reads do not mix accounts or turn authenticated users anonymous')
        assert request(a,'/courses/demo/enroll','POST')['user']=='learner-a'
        a.goto(origin+'/courses/demo');a.reload()
        assert request(a,'/auth/session')['user']['id']=='learner-a'
        ok('Session survives enrollment, page navigation and reload')
        a.evaluate("fetch('/__fixture/state',{method:'POST',body:JSON.stringify({failures:{'/api/content/team':1}})})")
        assert len(request(a,'/content/team')['team'])==1
        ok('Transient team 503 recovers with one safe read retry, not a manual reload')
        a.evaluate("fetch('/__fixture/state',{method:'POST',body:JSON.stringify({failures:{'/api/auth/session':2}})})")
        error=a.evaluate("window.sa.apiFetch('/auth/session').then(()=>null,e=>({status:e.status,message:e.message}))")
        assert error['status']==503 and a.evaluate('window.sessionChecks')==0
        assert request(a,'/auth/session')['user']['id']=='learner-a'
        ok('Exhausted session 503 stays an error; browser cookie and later session remain intact')
        before=a.evaluate("fetch('/__fixture/state').then(r=>r.json())")['counts'].get('/api/courses/demo/enroll',0)
        a.evaluate("fetch('/__fixture/state',{method:'POST',body:JSON.stringify({failures:{'/api/courses/demo/enroll':1}})})")
        result=a.evaluate("window.sa.apiFetch('/courses/demo/enroll',{method:'POST'}).then(()=>null,e=>e.status)")
        after=a.evaluate("fetch('/__fixture/state').then(r=>r.json())")['counts']['/api/courses/demo/enroll']
        assert result==503 and after==before+1
        ok('Write failure is not automatically resubmitted')
        assert request(a,'/payments/mine/invoices')['items'][0]['owner']=='learner-a'
        assert request(b,'/payments/mine/invoices')['items'][0]['owner']=='learner-b'
        request(a,'/auth/logout','POST');assert request(a,'/auth/session')['user'] is None
        assert request(b,'/auth/session')['user']['id']=='learner-b'
        ok('Private billing stays scoped and logout affects only its own browser session')
        browser.close()
    report={'scope':'Actual Chromium + real api.ts client and streaming gateway; local emulated upstream, not full Next.js/Hostinger/provider/Mongo integration','checks':checks,'passed':len(checks),'failed':0}
    Path(__file__).with_name('gateway-browser-results.json').write_text(json.dumps(report,indent=2))
finally:
    proc.terminate()
    try:proc.wait(timeout=5)
    except subprocess.TimeoutExpired:proc.kill()
