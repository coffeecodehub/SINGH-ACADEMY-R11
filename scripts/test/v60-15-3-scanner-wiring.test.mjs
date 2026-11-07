import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../../'+name,import.meta.url),'utf8');
test('scanner account probes are opt-in and are not run by release/CI/startup',()=>{
 for(const file of ['scripts/verify.mjs','scripts/release-check.mjs','.github/workflows/quality.yml','backend/src/server.js'])assert.doesNotMatch(read(file),/scan:check|checkUploadScanner/);
 assert.match(read('backend/src/scripts/checkUploadScanner.js'),/args.has\('--remote'\)/);
});
test('integration fixtures strip external scanner key and default to the isolated legacy no-scan test configuration',()=>{
 assert.match(read('backend/integration/isolation.js'),/'CLOUDMERSIVE_API_KEY'/);
 assert.match(read('backend/integration/isolation.js'),/UPLOAD_SCAN_PROVIDER:'clamav'/);
 assert.match(read('scripts/integration-check.mjs'),/'CLOUDMERSIVE_API_KEY'/);
});
test('no scanner credential is added to frontend source or public environment example',()=>{
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()&&!['node_modules','.next','.next-ui-tests','qa'].includes(d.name)?walk(new URL(d.name+'/',dir)):d.isFile()&&/\.(tsx?|mjs)$/.test(d.name)?[new URL(d.name,dir)]:[]);
 for(const file of walk(new URL('../../frontend/',import.meta.url)))assert.doesNotMatch(fs.readFileSync(file,'utf8'),/process\.env\.(?:CLOUDMERSIVE_API_KEY|NEXT_PUBLIC_CLOUDMERSIVE_API_KEY)/);
});
test('user-approved main navigation locator stays exact and does not reintroduce broad duplicate click',()=>{
 const source=read('frontend/e2e/public-portals.spec.ts');assert.match(source,/getByRole\('navigation', \{ name: 'Main navigation' \}\)/);assert.doesNotMatch(source,/locator\('header nav a'\)\.filter/);
});
