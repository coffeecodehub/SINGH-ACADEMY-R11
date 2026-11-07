/** Controlled, dependency-free tests of the security gate and lock migration.
 * The fixture locks/objects are deliberately synthetic; no real audit, npm
 * registry, native Sharp or production data is used by these unit tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stableAtLeast, assertSecurityManifests, assertSharpLock, sharpLockProblems,
  assertPatchedSharpRuntime, assertUnrelatedResolutionsPreserved, SHARP_VERSION} from '../security-dependency-policy.mjs';
import {refreshSecurityLocks, LOCK_REFRESH_ARGS} from '../refresh-security-locks.mjs';
import {classifyAudit, runSecurityAudit, AUDIT_SCANS} from '../security-audit.mjs';
import {checkInstalledSecurity, rasterSmoke} from '../check-security-deps.mjs';
const actual = fileURLToPath(new URL('../../', import.meta.url));
const quiet = {log() {}, error() {}};
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const lockEntry = (name, version) => ({version, resolved: `https://fixture.invalid/${name}/${version}.tgz`, integrity: 'sha512-U1lOVEhFVElD'});
function lock(scope, version = SHARP_VERSION) {
  const lib = version === SHARP_VERSION ? '1.3.4' : '1.3.3';
  return {name: scope, version: '60.14.0', lockfileVersion: 3, packages: {
    '': {name: scope, version: '60.14.0', dependencies: scope === 'backend' ? {express: '5.2.1', sharp: version} : {next: '15.5.27'}},
    ['node_modules/' + (scope === 'backend' ? 'express' : 'next')]: lockEntry(scope, scope === 'backend' ? '5.2.1' : '15.5.27'),
    'node_modules/sharp': lockEntry('sharp', version),
    'node_modules/@img/sharp-linux-x64': lockEntry('sharp-linux-x64', version),
    'node_modules/@img/sharp-libvips-linux-x64': lockEntry('sharp-libvips-linux-x64', lib),
  }};
}
function fixture(t, version = '0.35.4') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-security-test-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  write(path.join(root, 'package.json'), {version: '60.14.1', engines: {node: '22.x || 24.x'}});
  for (const scope of ['backend', 'frontend']) {
    const dir = path.join(root, scope); fs.mkdirSync(dir);
    write(path.join(dir, 'package.json'), {version: '60.14.1', engines: {node: '22.x || 24.x'},
      dependencies: scope === 'backend' ? {express: '5.2.1', sharp: SHARP_VERSION} : {next: '15.5.27'},
      ...(scope === 'frontend' ? {overrides: {sharp: SHARP_VERSION}} : {})});
    if (version) write(path.join(dir, 'package-lock.json'), lock(scope, version));
    fs.writeFileSync(path.join(dir, '.env'), 'SYNTHETIC_PRIVATE=keep-this-unchanged\n');
  }
  return root;
}
function patchLock(args, cwd) {assert.deepEqual(args, [...LOCK_REFRESH_ARGS]);write(path.join(cwd, 'package-lock.json'), lock(path.basename(cwd)));}
const patched = () => ({versions: {sharp: SHARP_VERSION, vips: '8.18.7', rsvg: '2.63.2'}, format: {svg: {input: {file: true, buffer: true}}}});
const counts = () => ({info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0});
const auditResult = (c = counts()) => ({status: c.total ? 1 : 0, stdout: JSON.stringify({metadata: {vulnerabilities: c}, vulnerabilities: {}}), stderr: ''});

for (const [version, min, expected] of [
  ['0.35.5','0.35.5',true], ['0.35.4','0.35.5',false], ['0.36.0','0.35.5',true],
  ['2.63.2','2.63.2',true], ['2.63.1','2.63.2',false], ['8.18.7','8.18.7',true],
  ['0.35.5-rc.1','0.35.5',false], ['^0.35.5','0.35.5',false], ['0.35','0.35.5',false],
  [undefined,'0.35.5',false], [null,'0.35.5',false], [24,'0.35.5',false],
]) test('stable security version ' + JSON.stringify(version), () => assert.equal(stableAtLeast(version,min),expected));

test('actual backend and frontend pins both select the reviewed Sharp patch', () => assertSecurityManifests(actual));
for (const scope of ['backend','frontend']) {
  test(scope + ' old locked Sharp is rejected; updated lock passes', () => {
    assert.throws(() => assertSharpLock(lock(scope,'0.35.4'),scope), /deps:security/);
    assertSharpLock(lock(scope),scope);
  });
  test(scope + ' stale or missing frontend/backend manifest pin cannot pass', t => {
    const root=fixture(t); const file=path.join(root,scope,'package.json'), p=read(file);
    if(scope==='backend')p.dependencies.sharp='0.35.4';else p.overrides.sharp='0.35.4';write(file,p);
    assert.throws(()=>assertSecurityManifests(root),/0\.35\.5/);
  });
}
for (const bad of [null, {}, {lockfileVersion:1}, {lockfileVersion:3,packages:{}}]) {
  test('unresolved/incomplete lock is not a patched dependency tree ' + JSON.stringify(bad),()=>assert.ok(sharpLockProblems(bad,'frontend').length));
}
test('a nested vulnerable copy cannot hide behind patched hoisted Sharp',()=>{
  const p=lock('frontend');p.packages['node_modules/next/node_modules/sharp']=lockEntry('sharp','0.35.4');
  assert.throws(()=>assertSharpLock(p,'frontend'),/next\/node_modules\/sharp/);
});
test('old native libvips package is detected even with updated Sharp wrapper',()=>{
  const p=lock('backend');p.packages['node_modules/@img/sharp-libvips-linux-x64'].version='1.3.3';
  assert.throws(()=>assertSharpLock(p,'backend'),/1\.3\.4/);
});
test('missing integrity or linked Sharp is not accepted as a security update',()=>{
  for(const mutation of [x=>delete x.integrity,x=>x.link=true]){const p=lock('frontend');mutation(p.packages['node_modules/sharp']);assert.throws(()=>assertSharpLock(p,'frontend'),/integrity/);}
});
test('both genuine original lock byte snapshots are backed up; env untouched',t=>{
  const root=fixture(t), original=['backend','frontend'].map(s=>fs.readFileSync(path.join(root,s,'package-lock.json')));
  const result=refreshSecurityLocks({root,execute:patchLock,logger:quiet,ci:false});
  assert.equal(result.changed.length,2);
  for(const [i,s]of ['backend','frontend'].entries()){
    assert.deepEqual(fs.readFileSync(path.join(result.backup,s+'.package-lock.json')),original[i]);
    assertSharpLock(read(path.join(root,s,'package-lock.json')),s);
    assert.equal(fs.readFileSync(path.join(root,s,'.env'),'utf8'),'SYNTHETIC_PRIVATE=keep-this-unchanged\n');
  }
});
test('second invocation preserves patched locks byte-for-byte and performs no npm call',t=>{
  const root=fixture(t,SHARP_VERSION);let calls=0;
  const before=fs.readFileSync(path.join(root,'backend/package-lock.json'));
  const result=refreshSecurityLocks({root,execute(){calls++;},logger:quiet,ci:false});
  assert.equal(calls,0);assert.deepEqual(result.changed,[]);assert.deepEqual(fs.readFileSync(path.join(root,'backend/package-lock.json')),before);
});
for(const failAt of [1,2]) test('npm failure at workspace '+failAt+' restores BOTH original locks',t=>{
  const root=fixture(t),before=['backend','frontend'].map(s=>fs.readFileSync(path.join(root,s,'package-lock.json')));let n=0;
  assert.throws(()=>refreshSecurityLocks({root,execute(args,cwd){patchLock(args,cwd);if(++n===failAt)throw Error('SYNTHETIC_DNS_ERROR');},logger:quiet,ci:false}),/SYNTHETIC_DNS_ERROR/);
  for(const[i,s]of ['backend','frontend'].entries())assert.deepEqual(fs.readFileSync(path.join(root,s,'package-lock.json')),before[i]);
});
test('npm resolving the old override is refused and old lock restored',t=>{
  const root=fixture(t);assert.throws(()=>refreshSecurityLocks({root,execute(){},logger:quiet,ci:false}),/0\.35\.5/);
  assert.equal(read(path.join(root,'backend/package-lock.json')).packages['node_modules/sharp'].version,'0.35.4');
});
test('unrelated version drift is rejected and rolled back',t=>{
  const root=fixture(t);
  assert.throws(()=>refreshSecurityLocks({root,execute(args,cwd){patchLock(args,cwd);const file=path.join(cwd,'package-lock.json'),p=read(file);p.packages['node_modules/express'].version='99.0.0';write(file,p);},logger:quiet,ci:false}),/unrelated locked packages/);
  assert.equal(read(path.join(root,'backend/package-lock.json')).packages['node_modules/express'].version,'5.2.1');
});
test('existing unrelated direct dependency mismatch is never auto-repaired',t=>{
  const root=fixture(t),f=path.join(root,'backend/package-lock.json'),p=read(f);p.packages[''].dependencies.express='4.0.0';write(f,p);
  assert.throws(()=>refreshSecurityLocks({root,execute(){assert.fail('must not run npm');},logger:quiet,ci:false}),/unrelated dependencies/);
});
test('unexpected npm manifest edit is rejected and restored',t=>{
  const root=fixture(t),before=fs.readFileSync(path.join(root,'backend/package.json'));
  assert.throws(()=>refreshSecurityLocks({root,execute(args,cwd){patchLock(args,cwd);fs.writeFileSync(path.join(cwd,'package.json'),'{}');},logger:quiet,ci:false}),/declarations changed/);
  assert.deepEqual(fs.readFileSync(path.join(root,'backend/package.json')),before);
});
test('fresh checkout obtains lockfiles through npm, never locally invented hashes',t=>{
  const root=fixture(t,null);const calls=[];
  const result=refreshSecurityLocks({root,execute(args,cwd){calls.push(args);patchLock(args,cwd);},logger:quiet,ci:false});
  assert.equal(calls.length,2);assert.equal(result.changed.length,2);
  for(const a of calls){assert.ok(a.includes('--package-lock-only'));assert.ok(a.includes('--ignore-scripts'));assert.ok(!a.includes('--force'));}
});
test('failure on fresh checkout removes incomplete locks, not env or manifests',t=>{
  const root=fixture(t,null);assert.throws(()=>refreshSecurityLocks({root,execute(args,cwd){patchLock(args,cwd);throw Error('unreachable registry');},logger:quiet,ci:false}),/unreachable registry/);
  for(const s of ['backend','frontend']){assert.ok(!fs.existsSync(path.join(root,s,'package-lock.json')));assert.ok(fs.existsSync(path.join(root,s,'.env')));assert.ok(fs.existsSync(path.join(root,s,'package.json')));}
});
test('CI refuses outdated lockfiles without mutating them',t=>{
  const root=fixture(t);assert.throws(()=>refreshSecurityLocks({root,execute(){assert.fail('no install');},logger:quiet,ci:true}),/CI requires/);
});
test('CI accepts already patched frozen locks without migration',t=>{
  const root=fixture(t,SHARP_VERSION);assert.deepEqual(refreshSecurityLocks({root,execute(){assert.fail('no migration');},logger:quiet,ci:true}).changed,[]);
});
test('shrinkwrap precedence is never overlooked',t=>{
  const root=fixture(t);write(path.join(root,'frontend/npm-shrinkwrap.json'),{});
  assert.throws(()=>refreshSecurityLocks({root,execute(){assert.fail('no npm');},logger:quiet,ci:false}),/shrinkwrap/);
});
for(const [field,value]of [['sharp','0.35.4'],['vips','8.18.6'],['rsvg','2.63.1'],['rsvg',undefined]]) {
  test('old/unknown native runtime refused '+field+' '+value,()=>{const p=patched();p.versions[field]=value;assert.throws(()=>assertPatchedSharpRuntime(p));});
}
test('fully patched runtime identity is accepted, without claiming online audit',()=>assert.equal(assertPatchedSharpRuntime(patched()).rsvg,'2.63.2'));
test('no SVG decoder does not require a nonexistent librsvg library',()=>{
  const p=patched();delete p.versions.rsvg;p.format.svg.input={file:false,buffer:false,stream:false};assert.equal(assertPatchedSharpRuntime(p).svgEnabled,false);
});
test('each installed workspace Sharp is checked before native smoke callbacks',async t=>{
  const root=fixture(t,SHARP_VERSION);let checks=0;
  for(const s of ['backend','frontend']){fs.mkdirSync(path.join(root,s,'node_modules/sharp'),{recursive:true});write(path.join(root,s,'node_modules/sharp/package.json'),{name:'sharp',version:SHARP_VERSION});}
  const result=await checkInstalledSecurity({project:root,loadSharp:()=>patched(),nativeSmoke:async()=>{checks++;return[];}});
  assert.equal(checks,2);assert.equal(result.length,2);
});
test('stale installed Sharp despite patched lock cannot pass',async t=>{
  const root=fixture(t,SHARP_VERSION);fs.mkdirSync(path.join(root,'backend/node_modules/sharp'),{recursive:true});write(path.join(root,'backend/node_modules/sharp/package.json'),{version:'0.35.4'});
  await assert.rejects(()=>checkInstalledSecurity({project:root,loadSharp:()=>patched(),nativeSmoke:async()=>[]}),/installed version differs/);
});
test('audit matrix includes production and full dependencies in both workspaces',()=>{
  assert.equal(AUDIT_SCANS.length,4);
  for(const s of AUDIT_SCANS){assert.ok(s.args.includes('--audit-level=info'));assert.ok(!s.args.includes('fix'));if(s.kind==='full')assert.ok(s.args.includes('--include=dev'));}
});
test('only complete zero-count zero-exit audit is reported as pass',()=>assert.equal(classifyAudit(auditResult()).status,'passed'));
for(const level of ['info','low','moderate','high','critical']) test('audit rejects '+level+' finding even with misleading zero exit',()=>{
  const c=counts();c[level]=1;c.total=1;const r=auditResult(c);r.status=0;assert.equal(classifyAudit(r).status,'failed');
});
for(const result of [
  {status:1,stdout:'',stderr:'EAI_AGAIN'}, {status:0,stdout:'{}'}, {status:null,stdout:auditResult().stdout},
  {...auditResult(),error:Error('timeout')}, {...auditResult(),signal:'SIGTERM'},
  {...auditResult(),status:1}, {status:0,stdout:'not json'},
  {status:0,stdout:JSON.stringify({error:{code:'EAI_AGAIN'},metadata:{vulnerabilities:counts()}})},
  {status:0,stdout:JSON.stringify({metadata:{vulnerabilities:{total:0}}})},
  {status:0,stdout:JSON.stringify({metadata:{vulnerabilities:counts()},vulnerabilities:{sharp:{severity:'high'}}})},
]) test('incomplete/inconsistent audit cannot turn green '+JSON.stringify(result),()=>assert.equal(classifyAudit(result).status,'failed'));
test('audit saves fresh per-scope evidence and fingerprints actual locks',t=>{
  const root=fixture(t,SHARP_VERSION);let n=0;
  const report=runSecurityAudit({project:root,execute(){n++;return auditResult();},logger:quiet});
  assert.equal(n,4);assert.equal(report.status,'passed');
  for(const scan of report.scans){assert.match(scan.lockSha256,/^[a-f0-9]{64}$/);assert.ok(fs.existsSync(path.join(root,scan.reportFile)));}
  assert.equal(read(path.join(root,'qa/security-audit.json')).status,'passed');
});
test('one audit failure keeps global status failed while recording other completed scans',t=>{
  const root=fixture(t,SHARP_VERSION);let n=0;
  const report=runSecurityAudit({project:root,retries:0,execute(){return ++n===1?{status:1,stdout:'',stderr:'EAI_AGAIN'}:auditResult();},logger:quiet});
  assert.equal(n,4);assert.equal(report.status,'failed');assert.equal(report.scans[0].status,'failed');assert.equal(report.scans[1].status,'passed');
});
test('new failed audit replaces stale passed report rather than reusing it',t=>{
  const root=fixture(t,null);fs.mkdirSync(path.join(root,'qa'));write(path.join(root,'qa/security-audit.json'),{status:'passed',old:true});
  const r=runSecurityAudit({project:root,execute(){assert.fail('missing locks');},logger:quiet});
  assert.equal(r.status,'failed');assert.ok(r.scans.every(x=>x.status==='failed'));assert.equal(read(path.join(root,'qa/security-audit.json')).old,undefined);
});
test('release verification invokes the strict native and online security gates',()=>{
  const source=fs.readFileSync(path.join(actual,'scripts/verify.mjs'),'utf8');
  assert.match(source,/runNpm\(\['run','check:security'\],root\)/);
  assert.match(source,/runNpm\(\['run','audit:security'\],root\)/);
  assert.doesNotMatch(source,/--audit-level=high/);
});
