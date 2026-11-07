/** Prepare only generated standalone output for the DB-backed browser gate.
 * No build, dependency, .env or application source is rewritten. The project
 * Dockerfile uses this same artifact and explicitly includes public/static.
 */
import fs from 'node:fs';
import path from 'node:path';

export function prepareStandalone(frontend) {
  const app = path.resolve(frontend);
  const build = path.join(app, '.next');
  const standalone = path.join(build, 'standalone');
  const server = path.join(standalone, 'server.js');
  const required = [path.join(build, 'BUILD_ID'), server];
  for (const file of required) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new Error('Standalone frontend build is missing. Run npm run verify:release successfully before verify:integration. Missing: ' + path.relative(app, file));
    }
  }
  const copies = [
    [path.join(app, 'public'), path.join(standalone, 'public')],
    [path.join(build, 'static'), path.join(standalone, '.next', 'static')],
  ];
  // Validate all inputs before writing any output. Never silently use next start.
  for (const [source, target] of copies) {
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
      throw new Error('Standalone asset source is missing: ' + path.relative(app, source) + '. Rebuild with npm run verify:release.');
    }
    if (fs.lstatSync(source).isSymbolicLink() || (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())) {
      throw new Error('Standalone assets must be ordinary directories, not symbolic links.');
    }
  }
  if (fs.lstatSync(standalone).isSymbolicLink()) throw new Error('Standalone output must not be a symbolic link.');
  for (const [source, target] of copies) fs.cpSync(source, target, {recursive: true, force: true});
  return {server, cwd: app};
}
