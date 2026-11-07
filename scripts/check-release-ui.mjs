import {fileURLToPath} from 'node:url';
import {usesReleaseBaseline,verifyReleaseBaseline} from './release-baseline.mjs';
import fs from 'node:fs';import crypto from 'node:crypto';
const root=new URL('../',import.meta.url);
if(usesReleaseBaseline(fileURLToPath(root))){
 try{verifyReleaseBaseline({root:fileURLToPath(root)});}catch(error){console.error(error.message);process.exitCode=1;}
}else{
const expected=JSON.parse(fs.readFileSync(new URL('qa/v60.9/preserved-files.json',root),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');let failed=0;
for(const [file,sha] of Object.entries(expected)){const url=new URL(file,root);if(!fs.existsSync(url)||hash(fs.readFileSync(url))!==sha){console.error('Changed protected asset:',file);failed++;}}
const scope=JSON.parse(fs.readFileSync(new URL('qa/v60.9/approved-scope.json',root),'utf8'));
const css=fs.readFileSync(new URL(scope.stylesFile,root));
if(hash(css.subarray(0,scope.originalPrefixBytes))!==scope.originalPrefixSha256){console.error('Existing approved CSS was altered outside the requested navbar/loading appendix.');failed++;}
console.log(`${Object.keys(expected).length} unchanged protected files + original CSS prefix checked; ${failed} unexpected differences. Requested navbar/loading additions tracked separately; certificate artwork/renderer unchanged.`);process.exitCode=failed?1:0;

}
