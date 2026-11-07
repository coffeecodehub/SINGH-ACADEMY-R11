/** Local installation includes the explicitly reviewed Sharp-only lock migration.
 * No catch-and-fallback from a failing npm ci, no --force and no registry changes.
 */
import {assertProjectRuntime} from './runtime-policy.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNpm} from './commands.mjs';
import {refreshSecurityLocks} from './refresh-security-locks.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
assertProjectRuntime(root);
refreshSecurityLocks({root});
for (const dir of ['backend', 'frontend']) {
  console.log(`Installing ${dir} from the validated lockfile...`);
  runNpm(['ci', '--include=dev', '--include=optional'], path.join(root, dir));
}
runNpm(['run', 'check:security'], root);
console.log('Review and commit both npm-generated package-lock.json files. Run npm run verify:release before deployment. Never use --force to hide a dependency conflict.');
