import {usesReleaseBaseline,verifyReleaseBaseline} from './release-baseline.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const APPROVED=new Set(['frontend/components/auth/PasswordField.tsx','frontend/app/my-course/page.tsx']);
// Exact generated files accidentally captured by the original manifest. Never
// broaden these exceptions to application code, package locks, styles or images.
const GENERATED=new Set(['frontend/.ui-stack.lock','frontend/qa/ui-report/index.html','frontend/qa/ui-results.json']);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
export function verifyPaymentUiScope({root=projectRoot,logger=console}={}){
 if(usesReleaseBaseline(root))return verifyReleaseBaseline({root,logger});
 const list=JSON.parse(fs.readFileSync(path.join(root,'docs/payment-ui-baseline.json'),'utf8'));
 const patch=JSON.parse(fs.readFileSync(path.join(root,'docs/p1-eye-ui-exception.json'),'utf8'));
 if(patch.files?.length!==APPROVED.size||new Set(patch.files.map(x=>x.path)).size!==APPROVED.size||patch.files.some(x=>!APPROVED.has(x.path)))throw new Error('Only password visibility and enrolled-only My Courses are approved UI exceptions.');
 const approved=new Map(patch.files.map(x=>[x.path,x]));
 for(const allowed of approved.values()){
  const original=list.files.find(x=>x.path===allowed.path);
  if(!original||allowed.beforeSha256!==original.sha256||!/^[a-f0-9]{64}$/.test(allowed.afterSha256)||allowed.afterSha256===allowed.beforeSha256)throw new Error('Approved patch provenance is invalid: '+allowed.path);
 }
 const failures=[];let checked=0,unchanged=0,approvedChanges=0,generatedExcluded=0;
 for(const entry of list.files){
  if(GENERATED.has(entry.path)){generatedExcluded++;continue;}
  checked++;
  const file=path.join(root,entry.path);
  if(!fs.existsSync(file)){failures.push(entry.path+': missing');continue;}
  const hash=digest(fs.readFileSync(file)),expected=approved.get(entry.path)?.afterSha256||entry.sha256;
  if(hash!==expected)failures.push(entry.path+': changed outside the approved patch');
  else if(approved.has(entry.path))approvedChanges++;else unchanged++;
 }
 if(failures.length)throw new Error('UI baseline differs outside the two approved changes: '+failures.slice(0,5).join('; ')+'. Stop and review; no automatic repair is made.');
 logger.log(`PASS ${checked} baseline application/test files checked: ${unchanged} byte-identical, ${approvedChanges} exact approved password/My Courses changes; ${generatedExcluded} generated artifacts excluded.`);
 return {checked,unchanged,approvedChanges,generatedExcluded,changed:approvedChanges};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{verifyPaymentUiScope();}catch(e){console.error(e.message);process.exitCode=1;}
