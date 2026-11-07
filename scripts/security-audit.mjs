/** Fresh online audit. A network/registry/JSON failure is FAILED, never zero.
 * Checks production + full dependencies in BOTH workspaces at every severity.
 * Never runs audit fix, changes dependencies, or suppresses vulnerabilities.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export const AUDIT_SCANS = Object.freeze(['backend', 'frontend'].flatMap(scope => [
  {scope, kind: 'production', args: ['audit', '--omit=dev', '--include=prod', '--include=optional', '--include=peer', '--audit-level=info', '--json']},
  {scope, kind: 'full', args: ['audit', '--include=prod', '--include=dev', '--include=optional', '--include=peer', '--audit-level=info', '--json']},
]));
export function classifyAudit(result) {
  let data;
  try { data = JSON.parse(result.stdout || ''); }
  catch { return {status: 'failed', reason: 'npm did not return a complete JSON audit report.', vulnerabilities: null}; }
  const counts = data.metadata?.vulnerabilities;
  if (result.error || result.signal || result.status === null || data.error || !counts ||
      !['info', 'low', 'moderate', 'high', 'critical', 'total'].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0)) {
    return {status: 'failed', reason: 'Audit execution/registry response incomplete. This is not a zero-vulnerability result.', vulnerabilities: null};
  }
  const count = ['info', 'low', 'moderate', 'high', 'critical'].reduce((n, key) => n + counts[key], 0);
  const hasFindings = data.vulnerabilities && Object.keys(data.vulnerabilities).length > 0;
  if (result.status !== 0 || counts.total !== 0 || count !== 0 || hasFindings) {
    return {status: 'failed', reason: 'Audit found vulnerabilities or returned a nonzero exit status.', vulnerabilities: counts};
  }
  return {status: 'passed', reason: '0 vulnerabilities reported by this completed npm audit.', vulnerabilities: counts};
}
export function transientAuditFailure(result) {
  // Retry only transport failures, never a complete report containing findings.
  if (classifyAudit(result).vulnerabilities !== null) return false;
  return /EAI_AGAIN|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|E_NETWORK|EAI_FAIL|\b50[234]\b/.test(
    [result.stderr, result.stdout, result.error?.code].filter(Boolean).join(' '));
}
function wait(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function executeAudit(args, cwd) {
  const windows = process.platform === 'win32';
  return spawnSync(windows ? 'cmd.exe' : 'npm', windows ? ['/d', '/s', '/c', 'npm', ...args, '--fetch-retries=0', '--fetch-timeout=20000'] : [...args, '--fetch-retries=0', '--fetch-timeout=20000'],
    {cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024, windowsHide: true});
}
export function runSecurityAudit({project = root, execute = executeAudit, logger = console, retries = 2, sleep = wait} = {}) {
  const qa = path.join(project, 'qa'); fs.mkdirSync(qa, {recursive: true});
  const destination = path.join(qa, 'security-audit.json');
  const report = {version: JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8')).version,
    node: process.versions.node, startedAt: new Date().toISOString(), finishedAt: null, status: 'running',
    scope: 'Known vulnerabilities reported by the configured npm registry, at this time, for these lockfile hashes. Not a penetration test or a guarantee against unknown flaws.',
    scans: AUDIT_SCANS.map(({scope, kind, args}) => ({scope, kind, command: ['npm', ...args], status: 'not_run'}))};
  const save = () => fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  save();
  for (let i = 0; i < AUDIT_SCANS.length; i++) {
    const {scope, kind, args} = AUDIT_SCANS[i], item = report.scans[i];
    const cwd = path.join(project, scope), rawName = `audit-${scope}-${kind}`;
    item.status = 'running'; save();
    try {
      const lock = fs.readFileSync(path.join(cwd, 'package-lock.json'));
      item.lockSha256 = crypto.createHash('sha256').update(lock).digest('hex');
      let result; item.attempts = [];
      const maxAttempts = 1 + Math.min(2, Math.max(0, Math.floor(Number(retries) || 0)));
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        result = execute([...args], cwd);
        const classified = classifyAudit(result), transient = transientAuditFailure(result);
        item.attempts.push({attempt, exitCode: result.status ?? null, status: classified.status, transient});
        fs.writeFileSync(path.join(qa, `${rawName}-attempt-${attempt}.json`), result.stdout || '', {mode: 0o600});
        fs.writeFileSync(path.join(qa, `${rawName}-attempt-${attempt}.stderr.log`), result.stderr || result.error?.message || '', {mode: 0o600});
        save();
        if (!transient || attempt === maxAttempts) break;
        logger.log(`${scope} ${kind}: registry transport failed; retry ${attempt}/${maxAttempts-1}. No audit pass has been recorded.`);
        sleep(attempt * 1500);
      }
      item.exitCode = result.status ?? null;
      fs.writeFileSync(path.join(qa, rawName + '.json'), result.stdout || '', {mode: 0o600});
      fs.writeFileSync(path.join(qa, rawName + '.stderr.log'), result.stderr || result.error?.message || '', {mode: 0o600});
      Object.assign(item, classifyAudit(result));
      item.reportFile = 'qa/' + rawName + '.json';
    } catch (error) { item.status = 'failed'; item.reason = error.message; }
    logger.log(`${scope} ${kind}: ${item.status.toUpperCase()} — ${item.reason}`);
    save();
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.scans.every(item => item.status === 'passed') ? 'passed' : 'failed';
  save();
  logger.log('Audit evidence: qa/security-audit.json');
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = runSecurityAudit().status === 'passed' ? 0 : 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
