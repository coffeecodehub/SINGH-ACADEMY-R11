/** Read-only release integrity checks. Generation is a separate, explicit owner action. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const RELEASE_VERSION='60.16.0';
export const RELEASE_BASELINE='docs/release-baseline-v60.16.0.json';
export const AUTHORIZED_RELEASE_SCOPE=[
 'Follow-up R11: only repair guarded localhost development image/review/course uploads with an explicit local-only flag and unchanged hosted scanner enforcement; restore automatic visible muted review previews and original Carousel image dimensions while retaining single-image timed motion; remove public technical preview labels; add an eligible full-section purchase suggestion using the existing regional offer and checkout flow; re-verify environment-driven non-refundable Stripe/PayPal payments without changing existing records, subscriptions, schemas, routes or unrelated UI. Preserve R10 and report actual provider verification limits.',
 'Follow-up R10, both scopes explicitly authorized: implement muted visible 15–20-second review previews, shared themed action feedback and confirmations, single-image timed Carousel motion, confirmed paid-access expiry circles, disabling explicit refund webhook handling while preserving involuntary reversal/dispute protections, and owned course/section access with duplicate-new-purchase prevention. Preserve explicit full playback, existing consented deferred renewal setup, historical records, schemas, env values and unrelated design/routes. Also apply measured public-data/media performance improvements, preserving cache invalidation, publication/privacy boundaries and original image bytes. Report actual test/measurement limits; no live deployment or provider readiness claim.',
 'R8 original-photo delivery: the user supplied DOP_269.zip containing the exact Landing group and Home whiteboard photographs. Embed both originals directly without changing their bytes, synchronize their two editable source slots, and add bounded responsive display copies while retaining full-resolution originals. Verify real desktop/mobile crops and preserve the established page layout and all earlier protected image bytes. No owner photo-picker/import workflow is part of application setup.',
 'Follow-up R8: remove the rejected local photograph picker/import scripts and mandatory owner image-selection workflow; retain direct declarative source placement and existing editable CMS image slots. Preserve the established page theme, correct verified preview timing defects and verify the code before handover. The exact two requested original hero files remain unavailable until individually provided; do not claim substitutes or old defaults are the requested replacements.',
 'Follow-up R7: correct integer-rounded carousel movement on high-refresh displays; request immediate muted social preview autoplay while retaining stable player frames, provider controls and motion preferences; reduce trusted administrator video storage round trips and expose real transfer/processing progress; support explicit byte-preserving local original-photo imports for the two requested hero replacements when their original files cannot cross the attachment transfer limit. Preserve the established page layout and do not claim missing originals have been imported.',
 'Follow-up R6: preserve the existing website theme while making local upload configuration explicit and actionable, removing visible preview/renewal refresh controls, automatically playing public CMS video previews and moving image carousels with inspection controls, adding persistent confirmed admin-save feedback, restoring authorized responsive CMS image variants, and separating resumable/cancellable unpaid checkouts from provider-confirmed recurring controls and retained financial history. Requested two new HD photograph replacements remain pending original-file availability; do not invent replacements.',
 'Follow-up R5: retain the existing website UI while separating full-length review uploads from 10–20-second previews, supporting vetted social players and safe original links, removing arbitrary admin-media byte caps without bypassing required malware scans, adding professional queued webinar invitations for active paid members, optional configurable page galleries with image crop controls and safe placement anchors, authorized Excel-readable exports across lead/data workspaces, and explicit two-step billing cancellation cards while preserving recurring-price consent.',
 'Follow-up R4: preserve the established UI while simplifying default and per-country prices for each access term; frame the five available original HD photos; add public video reviews with short previews, Zoom webinars, explicit review approval and authorized Excel-readable CSV exports; allow audited student removal after provider billing closure and explicit immediate non-refundable access cancellation separate from turning renewal off. Verify clean admin hydration without concealing application mismatches.',
 'Follow-up R3: retain existing page layouts while replacing public course sales with dynamic sections; restore automatic opposing faculty motion without a visible animation control; distribute all five accessible original uploads in existing image slots; add explicit regional price editing with USA fallback and consented deferred Stripe renewal setup for paid one-time purchases.',
 'Follow-up R2: preserve the original theme and faculty motion, use disjoint bounded page galleries, consolidate sales in Academy Plans, retire new blanket memberships, use USA price fallback, enable provider-confirmed renewal controls and fix CSP, upload diagnostics and Windows metadata loading.',
 'User-requested course sections, scoped access and server-authoritative country pricing; admin-managed prices and single-use discount coupons.',
 'Consented Stripe and PayPal provider-backed recurring billing, deferred paid-purchase setup, renewal reconciliation, provider-confirmed cancellation or suspension and resumption, financial safety fixes and corresponding checkout/billing interfaces.',
 'Super-admin page sections, safe media publishing, supplied founder biography and book information, and original user-uploaded global-learning photographs.',
 'Reviewed authentication, notification, accessibility, development/deployment and dependency fixes, including targeted advisory patches and meaningful regression tests.',
 'Versioned release documentation and exact source/configuration/test integrity checks; existing public imagery and certificate artwork remain unchanged.'
];
const SOURCE_DIRECTORIES=['backend/src','backend/test','backend/integration','backend/contract-tests','frontend/app','frontend/components','frontend/lib','frontend/test','frontend/e2e','frontend/ui-tests','frontend/public','scripts','deploy','dev','.github','docs'];
const GENERATED_NAMES=new Set(['node_modules','.next','.next-ui-tests','.tmp-uploads','test-results','playwright-report','backups']);
const GENERATED_FILES=new Set(['frontend/next-env.d.ts',RELEASE_BASELINE]);
const FRONTEND_CONFIG_EXTENSIONS=new Set(['.json','.ts','.mjs','.cjs','.md']);
export const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error(`Cannot read valid release data: ${path.basename(file)}.`);}}
export function usesReleaseBaseline(root){try{return readJson(path.join(root,'package.json')).version===RELEASE_VERSION;}catch{return false;}}
function safePath(value){return typeof value==='string'&&value.length>0&&!path.posix.isAbsolute(value)&&!value.includes('\\')&&!value.split('/').some(part=>!part||part==='.'||part==='..');}
export function releaseInventory(root){
 const names=new Set();
 function add(relative){if(GENERATED_FILES.has(relative)||relative.endsWith('.tsbuildinfo'))return;const file=path.join(root,relative),stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw new Error('Release inputs must not be symbolic links: '+relative);if(stat.isFile())names.add(relative);}
 function walk(relative){const directory=path.join(root,relative);if(!fs.existsSync(directory))return;const stat=fs.lstatSync(directory);if(stat.isSymbolicLink())throw new Error('Release directories must not be symbolic links: '+relative);for(const item of fs.readdirSync(directory,{withFileTypes:true})){const name=relative+'/'+item.name;if(item.isDirectory()){if(!GENERATED_NAMES.has(item.name))walk(name);}else add(name);}}
 for(const directory of SOURCE_DIRECTORIES)walk(directory);
 // QA result JSON/HTML/logs and generated PDFs are outputs, but executable
 // historical/local fixture helpers remain reviewed source inputs.
 function qaCode(relative){const directory=path.join(root,relative);if(!fs.existsSync(directory))return;for(const item of fs.readdirSync(directory,{withFileTypes:true})){const name=relative+'/'+item.name;if(item.isDirectory()){if(!GENERATED_NAMES.has(item.name))qaCode(name);}else if(/\.(?:[cm]?js|tsx?)$/.test(item.name))add(name);}}
 qaCode('qa');
 for(const policy of ['qa/v60.9/preserved-files.json','qa/v50/original-public-sha256.json','qa/v60.9/approved-scope.json'])if(fs.existsSync(path.join(root,policy)))add(policy);
 // Catch executable/source files added in a new directory too, rather than
 // relying on the current directory layout as an implicit allow-list.
 function extraSource(relative=''){const directory=path.join(root,relative);for(const item of fs.readdirSync(directory,{withFileTypes:true})){const name=relative?relative+'/'+item.name:item.name;if(item.isDirectory()){if(item.name!=='.git'&&!GENERATED_NAMES.has(item.name))extraSource(name);}else{const qa=name.startsWith('qa/')||name.startsWith('frontend/qa/');const source=qa?/\.(?:[cm]?js|jsx|tsx?|mts|cts|py|sh)$/.test(item.name):/\.(?:[cm]?js|jsx|tsx?|mts|cts|py|sh|css|scss|json|ya?ml)$/.test(item.name);if(source)add(name);}}}
 extraSource();
 for(const item of fs.readdirSync(root,{withFileTypes:true}))if(item.isFile()&&(/\.(?:md|json|ya?ml|mjs|cjs)$/.test(item.name)||['.gitignore','.env.deploy.example'].includes(item.name)))add(item.name);
 for(const directory of ['backend','frontend'])if(fs.existsSync(path.join(root,directory)))for(const item of fs.readdirSync(path.join(root,directory),{withFileTypes:true}))if(item.isFile()&&(FRONTEND_CONFIG_EXTENSIONS.has(path.extname(item.name))||['Dockerfile','.dockerignore','.env.example'].includes(item.name)))add(directory+'/'+item.name);
 return [...names].sort();
}
export function retainedReleaseAssets(root){
 const manifest=readJson(path.join(root,'qa/v60.9/preserved-files.json'));
 const retained=Object.entries(manifest).filter(([name])=>name.startsWith('frontend/public/')||name.startsWith('backend/src/assets/'));
 if(!retained.length)throw new Error('The original public/certificate asset manifest is empty.');
 for(const [name,digest] of retained){if(!safePath(name)||!/^[a-f0-9]{64}$/.test(digest))throw new Error('Invalid original asset manifest entry.');const file=path.join(root,name);if(!fs.existsSync(file)||sha256(fs.readFileSync(file))!==digest)throw new Error('Original public/certificate asset changed or missing: '+name);}
 // The older Windows archive used one transcoded filename. Its identical bytes
 // must still exist under the exact current path in the later retained manifest.
 const old=readJson(path.join(root,'qa/v50/original-public-sha256.json'));
 for(const [name,digest] of Object.entries(old).filter(([name])=>name.startsWith('frontend/public/'))){
  if(manifest[name])continue;
  const preserved=retained.some(([current,hash])=>path.posix.dirname(current)===path.posix.dirname(name)&&hash===digest);
  if(!preserved)throw new Error('Historical public image bytes are not retained: '+name);
 }
 return retained.map(([name,digest])=>({path:name,sha256:digest}));
}
export function verifyOriginalUploads(root){
 const file=path.join(root,'docs/global-learning-images.json');if(!fs.existsSync(file))return 0;
 const manifest=readJson(file);if(!Array.isArray(manifest.images))throw new Error('Invalid original photograph provenance.');
 for(const entry of manifest.images){const relative='frontend/public'+entry.src;if(typeof entry.src!=='string'||!entry.src.startsWith('/images/global-learning/')||!safePath(relative)||!/^[a-f0-9]{64}$/.test(entry.sha256||''))throw new Error('Invalid original photograph entry.');const target=path.join(root,relative);if(!fs.existsSync(target)||sha256(fs.readFileSync(target))!==entry.sha256)throw new Error('User-uploaded original photograph changed or missing: '+relative);}
 return manifest.images.length;
}
export function verifyReleaseBaseline({root,logger=console}={}){
 if(!root)throw new Error('Supply the project root.');
 const file=path.join(root,RELEASE_BASELINE);
 if(!fs.existsSync(file))throw new Error('Missing reviewed '+RELEASE_BASELINE+'. The owner must explicitly generate and review the authorized release snapshot; verification never creates it.');
 const baseline=readJson(file);
 if(baseline.version!==RELEASE_VERSION||!Array.isArray(baseline.files)||!baseline.files.length)throw new Error('Invalid versioned release baseline.');
 const expected=new Map();
 for(const item of baseline.files){if(!safePath(item.path)||GENERATED_FILES.has(item.path)||!/^[a-f0-9]{64}$/.test(item.sha256||'')||expected.has(item.path))throw new Error('Invalid or duplicate release baseline path.');expected.set(item.path,item.sha256);}
 const actual=releaseInventory(root),failures=[];
 for(const relative of actual){if(!expected.has(relative))failures.push(relative+': new file outside the reviewed snapshot');else if(sha256(fs.readFileSync(path.join(root,relative)))!==expected.get(relative))failures.push(relative+': bytes changed');}
 for(const relative of expected.keys())if(!actual.includes(relative))failures.push(relative+': missing from release inputs');
 if(failures.length)throw new Error('Release baseline mismatch: '+failures.slice(0,8).join('; ')+'. Review the actual changes; do not regenerate merely to hide a failure.');
 const retained=retainedReleaseAssets(root),uploads=verifyOriginalUploads(root);
 logger.log(`PASS ${RELEASE_VERSION}: ${actual.length} exact source/config/test/document/asset files; ${retained.length} original public/certificate assets and ${uploads} original uploaded photographs retained.`);
 return {version:RELEASE_VERSION,checked:actual.length,retainedAssets:retained.length,originalUploads:uploads};
}
