/** Shared release-tool policy, not an authentication or production-security bypass.
 * Node 22 and 24 are accepted for local verification. A successful policy check
 * is NOT evidence that dependency, browser or payment checks have passed.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SUPPORTED_NODE_MAJORS = Object.freeze([22, 24]);
export const NODE_ENGINE_RANGE = '22.x || 24.x';
export const EXISTING_DEPLOYMENT_NODE_MAJOR = 22;

export function inspectNodeRuntime(version = process.versions.node) {
  const match = typeof version === 'string'
    ? /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version)
    : null;
  const major = match ? Number(match[1]) : null;
  return {
    version: typeof version === 'string' ? version : 'unknown',
    major,
    supported: match !== null && SUPPORTED_NODE_MAJORS.includes(major),
    allowed: NODE_ENGINE_RANGE,
  };
}

export function assertNodeRuntime(version = process.versions.node) {
  const runtime = inspectNodeRuntime(version);
  if (!runtime.supported) {
    throw new Error(
      `Unsupported Node.js ${runtime.version}. This release accepts stable Node 22.x or 24.x. ` +
      'Keep an installed supported runtime; NVM is optional. Do not remove build, audit or browser checks.'
    );
  }
  return runtime;
}

/** Validate the actual three manifests, so a partly copied patch fails clearly.
 * Existing lockfiles/dependency resolution are left to npm ci; never discarded.
 */
export function assertProjectRuntime(root, nodeVersion = process.versions.node) {
  const runtime = assertNodeRuntime(nodeVersion);
  const manifests = ['package.json', 'backend/package.json', 'frontend/package.json'].map(relative => {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    } catch {
      throw new Error(`Cannot read ${relative}. Open/apply the complete project root; keep private .env files.`);
    }
    return { relative, data };
  });
  const version = manifests[0].data?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('The root package.json must contain a valid release version.');
  }
  for (const { relative, data } of manifests) {
    if (data.version !== version) {
      throw new Error(`Mixed project versions: ${relative} does not match ${version}. Apply the complete patch at the project root.`);
    }
    if (data.engines?.node !== NODE_ENGINE_RANGE) {
      throw new Error(`Runtime policy mismatch in ${relative}: expected engines.node "${NODE_ENGINE_RANGE}". Apply all three package.json files, not just release-check.mjs.`);
    }
  }
  return { ...runtime, projectVersion: version, deploymentNodeMajor: EXISTING_DEPLOYMENT_NODE_MAJOR };
}

export function runtimeSummary(runtime) {
  const lines = [
    `Runtime policy PASS: Node ${runtime.version}; project ${runtime.projectVersion}; accepted ${NODE_ENGINE_RANGE}.`,
    'This only validates the runtime policy and manifest consistency, not application compatibility.',
  ];
  if (runtime.major !== EXISTING_DEPLOYMENT_NODE_MAJOR) {
    lines.push(
      'Local verification can continue on Node 24. Keep the existing Hostinger Node 22 setting for now; ' +
      'verify the same commit/lockfiles on the deployment runtime before handover (CI includes both 22 and 24).'
    );
  }
  return lines.join('\n');
}
