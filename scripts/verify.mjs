/** Fail-fast release checks. A printed PASS applies only to checks actually executed. */
import {assertProjectRuntime} from './runtime-policy.mjs';
import path from 'node:path';import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {runNpm} from './commands.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assertProjectRuntime(root);
for(const dir of ['backend','frontend'])if(!fs.existsSync(path.join(root,dir,'package-lock.json')))throw new Error(`Missing ${dir}/package-lock.json. Run npm run install:all on a working network first.`);
// Fail early on stale native binaries or any known advisory, before expensive builds.
runNpm(['run','check:security'],root);
// Validate test evidence against the actual Mongoose model before Docker/builds.
runNpm(['run','test:contracts'],path.join(root,'backend'));
runNpm(['run','audit:security'],root);
runNpm(['run','test:runtime'],root);
runNpm(['run','test:reliability'],root);runNpm(['run','check:release-ui'],root);
runNpm(['test'],path.join(root,'backend'));runNpm(['run','test:images'],path.join(root,'backend'));runNpm(['run','test:certificate'],path.join(root,'backend'));runNpm(['run','typecheck'],path.join(root,'frontend'));runNpm(['run','build'],path.join(root,'frontend'));
const source=spawnSync(process.execPath,['scripts/check-source.cjs'],{cwd:root,stdio:'inherit'});if(source.status!==0)process.exit(source.status||1);
// Both production and full dependency audits at ALL severities ran above.
// Do not reintroduce a high-only threshold or an audit-skip fallback.
if(process.argv.includes('--integration'))runNpm(['run','test:integration'],path.join(root,'backend'));
console.log('Requested checks passed. Still execute real-browser acceptance, SMTP delivery, backup/restore and deployment smoke tests. This is not a penetration-test certificate.');
