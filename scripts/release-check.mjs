/** One fail-fast LOCAL gate. Never creates a provider charge or claims that
 * hosted webhook delivery / actual inbox delivery / live handover is verified.
 * The CLI uses the actual Node runtime; injected dependencies are for unit tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNpm} from './commands.mjs';
import {
  assertProjectRuntime, runtimeSummary, NODE_ENGINE_RANGE,
  EXISTING_DEPLOYMENT_NODE_MAJOR,
} from './runtime-policy.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function releaseCommandChecks(root, remotePayments = false) {
  const frontend = path.join(root, 'frontend');
  const backend = path.join(root, 'backend');
  const checks = [
    ['Install locked dependencies', root, ['run', 'install:all']],
    ['Local backend configuration', backend, ['run', 'preflight']],
    ['Unit/reliability, protected UI, TypeScript, production build and FOUR complete dependency audits', root, ['run', 'verify']],
    ['Install project Chromium', frontend, ['exec', '--no', '--', 'playwright', 'install', 'chromium']],
    ['Full actual Next browser suite including auth, free course, certificate and payment fixtures', root, ['run', 'test:ui']],
    ['Payment configuration (no charge)', root, ['run', 'payments:check']],
    ['SMTP connection/authentication (not inbox delivery)', backend, ['run', 'mail:verify']],
  ];
  if (remotePayments) {
    checks.push(['Provider credentials/webhook registration (no charge)', backend, ['run', 'payments:check', '--', '--remote', '--strict-webhooks']]);
  }
  return checks;
}

export function runReleaseChecks({
  root = projectRoot,
  nodeVersion = process.versions.node,
  execute = runNpm,
  remotePayments = false,
  logger = console,
} = {}) {
  const checks = releaseCommandChecks(root, remotePayments);
  // Create a NEW report before runtime/manifest validation. An early failure
  // must not leave an old successful run looking like the current result.
  const report = {
    version: null,
    node: nodeVersion,
    platform: process.platform,
    arch: process.arch,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    scope: 'LOCAL gates on the recorded Node runtime; fixture payments are not actual provider transactions',
    handoverReady: false,
    notCovered: ['Real MongoDB HTTP/transaction suite and database-backed browser checks (run verify:integration / CI)', 'Actual deployed database indexes and access-history audit', 'Hostinger trusted-client network attribution', 'Actual provider sandbox checkout, signed webhooks and inbox delivery', 'Final domain/runtime and live-mode acceptance', 'External upload-scanner account/quota and deployed upload acceptance'],
    runtimePolicy: {
      allowed: NODE_ENGINE_RANGE,
      existingDeploymentNodeMajor: EXISTING_DEPLOYMENT_NODE_MAJOR,
      note: 'A local pass does not verify a different deployment runtime. CI must pass for the deployed Node major, using the same commit and lockfiles.',
    },
    checks: [
      {name: 'Runtime policy and package consistency', status: 'not_run'},
      ...checks.map(([name]) => ({name, status: 'not_run'})),
    ],
  };
  const out = path.join(root, 'qa', 'release-checks.json');
  fs.mkdirSync(path.dirname(out), {recursive: true});
  // Keep readers from seeing partially written JSON while a step completes.
  const temporary = out + '.' + process.pid + '.tmp';
  const save = () => {
    try {
      fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n');
      fs.renameSync(temporary, out);
    } finally {
      fs.rmSync(temporary, {force: true});
    }
  };
  save();
  let active = report.checks[0];
  try {
    active.status = 'running';
    save();
    const runtime = assertProjectRuntime(root, nodeVersion);
    report.version = runtime.projectVersion;
    active.status = 'passed';
    logger.log(runtimeSummary(runtime));
    save();
    for (let i = 0; i < checks.length; i++) {
      const [name, cwd, args] = checks[i];
      active = report.checks[i + 1];
      logger.log('\n=== ' + name + ' ===');
      active.status = 'running';
      save();
      execute(args, cwd);
      active.status = 'passed';
      save();
    }
    report.status = 'passed';
    logger.log(
      '\nLOCAL RELEASE GATES PASSED for ' + report.version + ' on Node ' + report.node + '. ' +
      'Real MongoDB integration/DB-backed browser checks, actual sandbox checkout, provider webhook delivery, invoice/access and email inbox acceptance ' +
      'are still required before handover. Verify the same commit on the actual deployment runtime.'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    active.status = 'failed';
    active.error = message;
    report.status = 'failed';
    logger.error(message);
  } finally {
    report.finishedAt = new Date().toISOString();
    save();
    logger.log('Check report: qa/release-checks.json');
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = runReleaseChecks({remotePayments: process.argv.includes('--remote-payments')});
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
