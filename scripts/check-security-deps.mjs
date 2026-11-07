/** Inspect actual installed Sharp instances and execute native raster transforms
 * in both workspaces. No application server, provider or database is contacted.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {SCOPES, readJSON, assertSecurityManifests, assertSharpLock, assertPatchedSharpRuntime} from './security-dependency-policy.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function rasterSmoke(sharp) {
  const results = [];
  for (const format of ['png', 'jpeg', 'webp', 'gif']) {
    const input = await sharp({create: {width: 128, height: 72, channels: 3, background: {r: 155, g: 102, b: 61}}})[format]().toBuffer();
    const {data, info} = await sharp(input, {limitInputPixels: 100000, animated: false}).rotate()
      .resize({width: 64, withoutEnlargement: true}).webp({quality: 78}).toBuffer({resolveWithObject: true});
    assert.equal(info.format, 'webp'); assert.equal(info.width, 64); assert.equal(info.height, 36);
    assert.ok(data.length > 0);
    const decoded = await sharp(data).metadata();
    assert.equal(decoded.width, 64); assert.equal(decoded.height, 36);
    results.push({input: format, output: info.format, width: info.width, height: info.height, bytes: data.length});
  }
  await assert.rejects(() => sharp(Buffer.from('not an image')).metadata());
  return results;
}
export async function checkInstalledSecurity({project = root, loadSharp = file => createRequire(file)('sharp'), nativeSmoke = rasterSmoke} = {}) {
  assertSecurityManifests(project);
  const checked = [];
  for (const scope of SCOPES) {
    const cwd = path.join(project, scope), lock = readJSON(path.join(cwd, 'package-lock.json'));
    assertSharpLock(lock, scope);
    for (const [relative, entry] of Object.entries(lock.packages)) {
      if (!/(^|\/)node_modules\/sharp$/.test(relative)) continue;
      const installedPath = path.resolve(cwd, relative, 'package.json');
      if (!installedPath.startsWith(cwd + path.sep)) throw new Error('Unsafe path in dependency lockfile.');
      const installed = readJSON(installedPath);
      if (installed.version !== entry.version) throw new Error(`${scope}/${relative}: installed version differs from the lockfile. Run npm run install:all.`);
      // Resolve from the package's own scope without assuming package.json is exported.
      const sharp = loadSharp(installedPath);
      const runtime = assertPatchedSharpRuntime(sharp);
      checked.push({scope, package: relative, ...runtime, transforms: await nativeSmoke(sharp)});
    }
  }
  return checked;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(root, 'qa', 'security-dependencies.json');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const report = {version: readJSON(path.join(root, 'package.json')).version, node: process.versions.node,
    recordedAt: new Date().toISOString(), status: 'running', scope: 'Installed Sharp/native-library identity and raster smoke; not an online vulnerability scan', checks: []};
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  try {
    if (process.argv.includes('--manifest-only')) {
      assertSecurityManifests(root); report.status = 'manifest_only';
      console.log('Security manifest pins match. Installed dependencies/native transforms were NOT checked.');
    } else {
      report.checks = await checkInstalledSecurity(); report.status = 'passed';
      console.log('Installed Sharp and native image checks passed:', JSON.stringify(report.checks));
    }
  } catch (error) { report.status = 'failed'; report.error = error.message; console.error(error.message); process.exitCode = 1; }
  finally { fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n'); }
}
