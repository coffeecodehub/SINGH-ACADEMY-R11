/** Explicit release snapshot generator. Never called by installation, CI or verification. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RELEASE_VERSION,RELEASE_BASELINE,AUTHORIZED_RELEASE_SCOPE,releaseInventory,retainedReleaseAssets,verifyOriginalUploads,sha256} from './release-baseline.mjs';
export function generateReleaseBaseline({root,acknowledged=false,replaceReviewed=false,logger=console}={}){
 if(!root||!acknowledged)throw new Error('Explicit acknowledgement of the user-authorized '+RELEASE_VERSION+' scope is required.');
 for(const relative of ['package.json','backend/package.json','frontend/package.json']){const manifest=JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));if(manifest.version!==RELEASE_VERSION)throw new Error('Release version mismatch in '+relative);}
 const target=path.join(root,RELEASE_BASELINE);if(fs.existsSync(target)&&!replaceReviewed)throw new Error('A reviewed snapshot exists. Inspect the diff first, then use --replace-reviewed for an explicitly reviewed update.');
 const retained=retainedReleaseAssets(root),uploads=verifyOriginalUploads(root);
 const files=releaseInventory(root).map(relative=>({path:relative,sha256:sha256(fs.readFileSync(path.join(root,relative)))}));
 const data={version:RELEASE_VERSION,generatedAt:new Date().toISOString(),authorization:AUTHORIZED_RELEASE_SCOPE,scope:'Exact application, tests, configuration, documentation and assets. Runtime/build/cache outputs and this self-referential manifest are excluded; they do not authorize application changes.',retainedOriginalAssetCount:retained.length,originalUploadCount:uploads,files};
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data,null,2)+'\n');
 logger.log('Generated '+RELEASE_BASELINE+' with '+files.length+' exact file hashes. Review and commit this manifest with the authorized source changes.');return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{generateReleaseBaseline({root:fileURLToPath(new URL('../',import.meta.url)),acknowledged:process.argv.includes('--acknowledge-authorized-v60.16.0'),replaceReviewed:process.argv.includes('--replace-reviewed')});}
 catch(error){console.error(error.message);process.exitCode=1;}
}
