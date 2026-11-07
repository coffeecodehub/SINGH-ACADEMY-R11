/** Security floor for GHSA-wq5f-xc86-pv6w, verified 2026-10-06.
 * This validates configuration/evidence. It is NOT an online vulnerability scan.
 * https://github.com/advisories/GHSA-wq5f-xc86-pv6w
 */
import fs from 'node:fs';
import path from 'node:path';

export const SHARP_VERSION = '0.35.5';
export const LIBVIPS_PACKAGE_VERSION = '1.3.4';
export const LIBVIPS_MINIMUM = '8.18.7';
export const RSVG_MINIMUM = '2.63.2';
export const SCOPES = Object.freeze(['backend', 'frontend']);

export function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error(`Cannot read valid JSON: ${path.basename(file)}. Restore the file; do not delete a working lockfile.`); }
}
export function stableAtLeast(version, minimum) {
  const parse = x => typeof x === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(x)
    ? x.split('.').map(Number) : null;
  const a = parse(version), b = parse(minimum);
  if (!a || !b || [...a, ...b].some(n => !Number.isSafeInteger(n))) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}
export function packageAt(lockPath) {
  return String(lockPath).split('node_modules/').at(-1);
}
export function isSharpPackage(lockPath) {
  const name = packageAt(lockPath);
  return name === 'sharp' || name.startsWith('@img/sharp-');
}
export function expectedSharpVersion(lockPath) {
  return packageAt(lockPath).startsWith('@img/sharp-libvips-') ? LIBVIPS_PACKAGE_VERSION : SHARP_VERSION;
}
export function assertSecurityManifests(root) {
  const backend = readJSON(path.join(root, 'backend/package.json'));
  const frontend = readJSON(path.join(root, 'frontend/package.json'));
  if (backend.dependencies?.sharp !== SHARP_VERSION) {
    throw new Error(`backend/package.json must pin sharp exactly to ${SHARP_VERSION}. Apply the complete security patch.`);
  }
  if (frontend.overrides?.sharp !== SHARP_VERSION) {
    throw new Error(`frontend/package.json must override sharp exactly to ${SHARP_VERSION}, including the Next.js dependency.`);
  }
  return {backend, frontend};
}
export function sharpLockProblems(lock, scope) {
  const problems = [];
  if (!lock || ![2, 3].includes(lock.lockfileVersion) || !lock.packages || typeof lock.packages !== 'object') {
    return ['A genuine npm lockfileVersion 2 or 3 package-lock.json is required.'];
  }
  const entries = Object.entries(lock.packages).filter(([key]) => /(^|\/)node_modules\/sharp$/.test(key));
  if (!entries.length) problems.push('No Sharp package is resolved in this lockfile.');
  if (scope === 'backend' && lock.packages['']?.dependencies?.sharp !== SHARP_VERSION) {
    problems.push(`Root lock dependency sharp must be ${SHARP_VERSION}.`);
  }
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!isSharpPackage(key)) continue;
    const expected = expectedSharpVersion(key);
    if (entry?.version !== expected) problems.push(`${key} must resolve to ${expected}, not ${entry?.version ?? 'missing'}.`);
    if (entry?.link || !/^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(entry?.integrity || '')) {
      problems.push(`${key} must have genuine npm integrity metadata, not a linked or manually fabricated replacement.`);
    }
  }
  return problems;
}
export function assertSharpLock(lock, scope) {
  const problems = sharpLockProblems(lock, scope);
  if (problems.length) throw new Error(`${scope}/package-lock.json needs the reviewed Sharp update. ${problems.join(' ')} Run npm run deps:security, then commit both npm-generated lockfiles.`);
}
export function assertInputLockMatchesManifest(lock, manifest, scope) {
  if (!lock || ![2, 3].includes(lock.lockfileVersion) || !lock.packages?.['']) {
    throw new Error(`${scope}: unsupported or incomplete existing lockfile. Do not overwrite it blindly.`);
  }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const clean = value => Object.fromEntries(Object.entries(value || {}).filter(([name]) => name !== 'sharp').sort(([a], [b]) => a.localeCompare(b)));
    if (JSON.stringify(clean(lock.packages[''][field])) !== JSON.stringify(clean(manifest[field]))) {
      throw new Error(`${scope}: unrelated ${field} differ between package.json and package-lock.json. Review that mismatch separately; the security updater will not silently repair it.`);
    }
  }
}
export function assertUnrelatedResolutionsPreserved(before, after, scope) {
  if (!before) return; // A fresh checkout needs a newly generated real npm lock.
  const changes = [];
  const keys = new Set([...Object.keys(before.packages), ...Object.keys(after.packages)]);
  const identity = value => value && JSON.stringify([value.version ?? null, value.resolved ?? null, value.integrity ?? null, value.link ?? false]);
  for (const key of keys) {
    if (!key || isSharpPackage(key)) continue;
    if (identity(before.packages[key]) !== identity(after.packages[key])) changes.push(key);
  }
  if (changes.length) throw new Error(`${scope}: npm also changed unrelated locked packages (${changes.slice(0, 8).join(', ')}). Original lockfiles restored; review separately rather than applying a broad update.`);
}
export function assertPatchedSharpRuntime(sharp) {
  const versions = sharp?.versions || {};
  if (versions.sharp !== SHARP_VERSION) throw new Error(`Installed Sharp must be ${SHARP_VERSION}; found ${versions.sharp ?? 'unknown'}. Run npm run install:all.`);
  if (!stableAtLeast(versions.vips, LIBVIPS_MINIMUM)) throw new Error(`Installed libvips must be at least ${LIBVIPS_MINIMUM}; found ${versions.vips ?? 'unknown'}. Check prebuilt/global native libraries.`);
  const svgInput = sharp.format?.svg?.input;
  const svgEnabled = Boolean(svgInput && (svgInput.file || svgInput.buffer || svgInput.stream));
  if ((svgEnabled || versions.rsvg) && !stableAtLeast(versions.rsvg, RSVG_MINIMUM)) {
    throw new Error(`SVG decoding requires patched librsvg >=${RSVG_MINIMUM}; installed version is ${versions.rsvg ?? 'unreported'}. A package pin alone cannot validate a custom/global native library.`);
  }
  return {sharp: versions.sharp, vips: versions.vips, rsvg: versions.rsvg || null, svgEnabled};
}
