/** Explicit, narrowly scoped lockfile update. No credentials, app settings,
 * node_modules, database, registry configuration or integrity hashes are edited.
 * npm produces the real resolutions; existing non-Sharp resolutions are checked.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runNpm} from './commands.mjs';
import {assertProjectRuntime} from './runtime-policy.mjs';
import {
  SCOPES, SHARP_VERSION, readJSON, assertSecurityManifests, sharpLockProblems,
  assertSharpLock, assertInputLockMatchesManifest, assertUnrelatedResolutionsPreserved,
} from './security-dependency-policy.mjs';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const LOCK_REFRESH_ARGS = Object.freeze([
  'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund',
  '--include=dev', '--include=optional',
]);
export function refreshSecurityLocks({root = projectRoot, execute = runNpm, logger = console, ci = process.env.CI === 'true'} = {}) {
  assertProjectRuntime(root);
  const manifests = assertSecurityManifests(root);
  const scopes = SCOPES.map(scope => {
    const cwd = path.join(root, scope), file = path.join(cwd, 'package-lock.json');
    if (fs.existsSync(path.join(cwd, 'npm-shrinkwrap.json'))) throw new Error(`${scope}: npm-shrinkwrap.json takes precedence. Review that file instead of silently updating a different lockfile.`);
    const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
    const old = bytes ? readJSON(file) : null;
    if (old) assertInputLockMatchesManifest(old, manifests[scope], scope);
    return {scope, cwd, file, bytes, old, manifestBytes: fs.readFileSync(path.join(cwd, 'package.json')),
      needsUpdate: !old || sharpLockProblems(old, scope).length > 0};
  });
  if (!scopes.some(s => s.needsUpdate)) {
    logger.log(`Security lockfiles already resolve Sharp ${SHARP_VERSION}; no lockfile changes needed.`);
    return {changed: [], backup: null};
  }
  if (ci) throw new Error('CI requires the reviewed patched lockfiles. Run npm run deps:security locally, review and commit backend/package-lock.json and frontend/package-lock.json. No lockfile is rewritten in CI.');
  const backup = path.join(root, 'backups', 'sharp-security', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID());
  fs.mkdirSync(backup, {recursive: true, mode: 0o700});
  for (const s of scopes) if (s.bytes) fs.writeFileSync(path.join(backup, s.scope + '.package-lock.json'), s.bytes, {mode: 0o600});
  try {
    for (const s of scopes) {
      if (!s.needsUpdate) continue;
      logger.log(`${s.scope}: resolving approved Sharp ${SHARP_VERSION} security update with npm. Other package versions must remain unchanged.`);
      execute([...LOCK_REFRESH_ARGS], s.cwd);
      if (!fs.readFileSync(path.join(s.cwd, 'package.json')).equals(s.manifestBytes)) throw new Error(`${s.scope}: dependency declarations changed unexpectedly.`);
      const current = readJSON(s.file);
      assertSharpLock(current, s.scope);
      assertUnrelatedResolutionsPreserved(s.old, current, s.scope);
    }
  } catch (error) {
    // Atomic across both workspaces: an error never leaves a half-applied pair.
    for (const s of scopes) {
      if (s.bytes) fs.writeFileSync(s.file, s.bytes);
      else fs.rmSync(s.file, {force: true});
      fs.writeFileSync(path.join(s.cwd, 'package.json'), s.manifestBytes);
    }
    throw error;
  }
  const changed = scopes.filter(s => s.needsUpdate).map(s => s.scope + '/package-lock.json');
  logger.log('Lock refresh complete. Original locks backed up locally; review and commit: ' + changed.join(', '));
  logger.log('This is dependency resolution only. npm ci, installed native checks, online audit and application tests must still pass.');
  return {changed, backup};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { refreshSecurityLocks(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
