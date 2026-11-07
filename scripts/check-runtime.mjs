/** Read-only; no credentials, network access, installation or database writes. */
import {fileURLToPath} from 'node:url';
import {assertProjectRuntime, runtimeSummary} from './runtime-policy.mjs';
try {
  const root = fileURLToPath(new URL('../', import.meta.url));
  console.log(runtimeSummary(assertProjectRuntime(root)));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
