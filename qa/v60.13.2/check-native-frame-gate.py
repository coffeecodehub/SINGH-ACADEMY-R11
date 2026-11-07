"""Native Chromium pre-commit origin regression, not a full Next/React test.
Uses the shipped TypeScript gate transpiled locally. No real provider stream,
MongoDB, SMTP or payment service is contacted. The browser's managed navigation
policy is left intact; this check exercises the initial about:blank document.
"""
import asyncio,json,os,pathlib,subprocess
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(__file__).resolve().parent
TS=os.environ.get('TYPESCRIPT_PATH','/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')
js=subprocess.check_output(['node','-e',"const fs=require('fs'),ts=require(process.argv[1]);process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[2],'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);",TS,str(ROOT/'frontend/lib/playerFrameGate.ts')],text=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  results={'scope':'native about:blank pre-commit guard only; not provider playback or Next/React E2E','browser':browser.version,'cases':[]}
  for provider,origin,src in [('vimeo','https://player.vimeo.com','https://player.vimeo.com/video/123456789'),('youtube','https://www.youtube-nocookie.com','https://www.youtube-nocookie.com/embed/abcdefghijk')]:
   for legacy in [True,False]:
    page=await browser.new_page();messages=[]
    page.on('console',lambda msg: messages.append(msg.text))
    await page.goto('about:blank')
    await page.add_script_tag(content='window.createPlayerFrameGate=(()=>{const exports={};'+js+';return exports.createPlayerFrameGate;})();')
    result=await page.evaluate('''({origin,src,legacy})=>{
      const frame=document.createElement('iframe');document.body.append(frame);
      // Its WindowProxy exists now. Changing src starts an asynchronous load.
      frame.src=src;
      const state={connected:frame.isConnected,documentBeforeLoad:frame.contentDocument?.URL||null};
      const gate=window.createPlayerFrameGate({current:frame},origin);
      state.syntheticLoadAccepted=gate.markLoaded(frame);
      if(legacy){frame.contentWindow.postMessage(JSON.stringify({method:'ping'}),origin);state.sent=true;}
      else state.sent=gate.send({method:'ping'});
      window.testFrame=frame;return state;
    }''',{'origin':origin,'src':src,'legacy':legacy})
    await page.wait_for_timeout(200)
    result.update({'provider':provider,'legacyUnguardedSend':legacy,'originMismatchMessages':[m for m in messages if 'target origin' in m or "execute 'postMessage'" in m]})
    if legacy:
     assert result['originMismatchMessages'],result
    else:
     assert not result['sent'] and not result['syntheticLoadAccepted'] and not result['originMismatchMessages'],result
    results['cases'].append(result)
    await page.close()
  results['passed']=len(results['cases']);results['failed']=0
  (OUT/'native-frame-gate-results.json').write_text(json.dumps(results,indent=2)+'\n')
  print(json.dumps(results,indent=2));await browser.close()
asyncio.run(main())
