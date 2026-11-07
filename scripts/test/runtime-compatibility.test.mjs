/** Dependency-free tooling tests. Simulated version strings below test the
 * policy, not the application's actual execution on those Node versions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {
  inspectNodeRuntime, assertNodeRuntime, assertProjectRuntime, runtimeSummary,
  NODE_ENGINE_RANGE, SUPPORTED_NODE_MAJORS,
} from '../runtime-policy.mjs';
import {runReleaseChecks, releaseCommandChecks} from '../release-check.mjs';

const actualRoot = fileURLToPath(new URL('../../', import.meta.url));
const quiet = {log() {}, error() {}};
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'singh-runtime-test-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const sub of ['', 'frontend', 'backend']) {
    fs.mkdirSync(path.join(root, sub), {recursive: true});
    write(path.join(root, sub, 'package.json'), {name: 'synthetic-fixture', version: '99.1.2', engines: {node: NODE_ENGINE_RANGE}});
  }
  return root;
}
function change(root, relative, mutate) {
  const file = path.join(root, relative); const data = read(file); mutate(data); write(file, data);
}

for (const version of ['22.0.0', '22.16.0', '22.23.3', '24.0.0', '24.18.0', 'v24.18.0', '24.21.0']) {
  test('runtime policy accepts stable version string ' + version, () => {
    assert.equal(assertNodeRuntime(version).supported, true);
  });
}
for (const version of ['18.20.0', '20.19.0', '21.7.3', '23.11.0', '25.0.0', '26.0.0', '24.18.0-nightly', '22.0.0-rc.1', '22.x', '24', '024.18.0', '24.18.0 trailing', '', null, 24, {}, []]) {
  test('runtime policy rejects unsupported/invalid input ' + JSON.stringify(version), () => {
    assert.equal(inspectNodeRuntime(version).supported, false);
    assert.throws(() => assertNodeRuntime(version), /stable Node 22\.x or 24\.x/);
  });
}

test('default policy reads the actually executing Node runtime, without an NVM check', () => {
  const result = inspectNodeRuntime();
  assert.equal(result.version, process.versions.node);
  assert.equal(result.supported, SUPPORTED_NODE_MAJORS.includes(Number(process.versions.node.split('.')[0])));
});

test('actual root/backend/frontend declare exactly the same accepted engines and version', () => {
  const result = assertProjectRuntime(actualRoot, '24.18.0');
  assert.equal(result.projectVersion, read(path.join(actualRoot, 'package.json')).version);
  assert.equal(result.allowed, '22.x || 24.x');
});

test('Node 24 summary distinguishes local policy acceptance from Hostinger Node 22 evidence', t => {
  const result = assertProjectRuntime(fixture(t), '24.18.0');
  const text = runtimeSummary(result);
  assert.match(text, /local verification can continue on Node 24/i);
  assert.match(text, /Hostinger Node 22/);
  assert.match(text, /not application compatibility/);
});

for (const relative of ['package.json', 'backend/package.json', 'frontend/package.json']) {
  test('an old Node-22-only manifest is identified: ' + relative, t => {
    const root = fixture(t);
    change(root, relative, p => { p.engines.node = '22.x'; });
    assert.throws(() => assertProjectRuntime(root, '24.18.0'), /Runtime policy mismatch/);
  });
}
for (const relative of ['backend/package.json', 'frontend/package.json']) {
  test('mixed patch versions are not accepted: ' + relative, t => {
    const root = fixture(t);
    change(root, relative, p => { p.version = '99.1.1'; });
    assert.throws(() => assertProjectRuntime(root), /Mixed project versions/);
  });
}

test('malformed or missing manifest produces an actionable message without echoing file contents', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'frontend', 'package.json'), '{NOT_JSON_PRIVATE_TEXT');
  assert.throws(() => assertProjectRuntime(root), error => {
    assert.match(error.message, /Cannot read frontend\/package.json/);
    assert.doesNotMatch(error.message, /PRIVATE_TEXT/); return true;
  });
});

test('local gate retains one four-scan security audit in verify, without redundant unstructured scans', () => {
  assert.deepEqual(releaseCommandChecks('/fixture').map(([, , args]) => args), [
    ['run', 'install:all'], ['run', 'preflight'], ['run', 'verify'],
    ['exec', '--no', '--', 'playwright', 'install', 'chromium'],
    ['run', 'test:ui'], ['run', 'payments:check'], ['run', 'mail:verify'],
  ]);
});

test('explicit remote option appends verification only, never a charge-creation command', () => {
  const checks = releaseCommandChecks('/fixture', true);
  assert.equal(checks.length, 8);
  assert.deepEqual(checks.at(-1)[2], ['run', 'payments:check', '--', '--remote', '--strict-webhooks']);
});

for (const nodeVersion of ['22.16.0', '24.18.0']) {
  test('simulated successful gate retains every check under ' + nodeVersion, t => {
    const root = fixture(t), calls = [];
    const report = runReleaseChecks({root, nodeVersion, logger: quiet, execute(args, cwd) {
      const current = read(path.join(root, 'qa', 'release-checks.json'));
      assert.equal(current.status, 'running');
      assert.equal(current.checks[calls.length + 1].status, 'running');
      calls.push({args, cwd});
    }});
    assert.equal(report.status, 'passed');
    assert.equal(report.version, '99.1.2');
    assert.equal(report.node, nodeVersion);
    assert.equal(calls.length, 7);
    assert.equal(report.checks.length, 8);
    assert.ok(report.checks.every(check => check.status === 'passed'));
    assert.deepEqual(read(path.join(root, 'qa', 'release-checks.json')), report);
    assert.ok(report.finishedAt);
  });
}

for (let stop = 0; stop < 7; stop++) {
  test('simulated gate stops at command ' + (stop + 1) + ' and never marks later commands passed', t => {
    const root = fixture(t); let attempts = 0;
    const report = runReleaseChecks({root, nodeVersion: '24.18.0', logger: quiet, execute() {
      const index = attempts++;
      if (index === stop) throw new Error('SYNTHETIC_COMMAND_FAILURE');
    }});
    assert.equal(attempts, stop + 1);
    assert.equal(report.status, 'failed');
    assert.equal(report.checks[stop + 1].status, 'failed');
    assert.match(report.checks[stop + 1].error, /SYNTHETIC_COMMAND_FAILURE/);
    assert.ok(report.checks.slice(stop + 2).every(check => check.status === 'not_run'));
    assert.deepEqual(read(path.join(root, 'qa', 'release-checks.json')), report);
  });
}

test('an early unsupported runtime replaces stale success with failed + not_run entries', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'qa'));
  write(path.join(root, 'qa', 'release-checks.json'), {status: 'passed', version: 'old'});
  let calls = 0;
  const report = runReleaseChecks({root, nodeVersion: '20.19.0', logger: quiet, execute() {calls++;}});
  assert.equal(calls, 0);
  assert.equal(report.status, 'failed');
  assert.equal(report.checks[0].status, 'failed');
  assert.ok(report.checks.slice(1).every(check => check.status === 'not_run'));
  assert.deepEqual(read(path.join(root, 'qa', 'release-checks.json')), report);
  assert.deepEqual(fs.readdirSync(path.join(root, 'qa')), ['release-checks.json']);
});

test('incomplete patch writes a failure report before installation or any service call', t => {
  const root = fixture(t); let calls = 0;
  change(root, 'backend/package.json', p => {p.version = '99.1.0';});
  const report = runReleaseChecks({root, nodeVersion: '24.18.0', logger: quiet, execute() {calls++;}});
  assert.equal(calls, 0);
  assert.equal(report.status, 'failed');
  assert.match(report.checks[0].error, /Mixed project versions/);
  assert.equal(report.checks.at(-1).status, 'not_run');
});

test('commands do not mutate environment settings, secrets or lockfiles', t => {
  const root = fixture(t);
  for (const sub of ['backend', 'frontend']) {
    fs.writeFileSync(path.join(root, sub, '.env'), 'SYNTHETIC_ONLY=keep-me\n');
    fs.writeFileSync(path.join(root, sub, 'package-lock.json'), '{"synthetic":"untouched"}\n');
  }
  const before = ['backend/.env', 'frontend/.env', 'backend/package-lock.json', 'frontend/package-lock.json'].map(f => [f, fs.readFileSync(path.join(root, f))]);
  runReleaseChecks({root, nodeVersion: '24.18.0', logger: quiet, execute() {}});
  for (const [f, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(root, f)), bytes);
});

test('check:runtime CLI uses the current runtime and succeeds from an unrelated cwd', () => {
  const result = spawnSync(process.execPath, [path.join(actualRoot, 'scripts', 'check-runtime.mjs')], {cwd: os.tmpdir(), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Runtime policy PASS/);
  assert.ok(result.stdout.includes(process.versions.node));
});

test('CI declares both release families, with no single-runtime or auto-deploy shortcut', () => {
  const ci = fs.readFileSync(path.join(actualRoot, '.github/workflows/quality.yml'), 'utf8');
  assert.match(ci, /node: \['22', '24'\]/);
  assert.match(ci, /node-version: \$\{\{ matrix\.node \}\}/);
  assert.match(ci, /run: npm run verify/);
  assert.match(ci, /run: npm run test:ui/);
  assert.doesNotMatch(ci, /continue-on-error:\s*true/);
});
