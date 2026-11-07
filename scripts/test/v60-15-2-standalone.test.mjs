import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareStandalone} from '../standalone-files.mjs';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sa standalone's "));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const folder of ['.next/standalone', '.next/static/chunks', 'public/images']) fs.mkdirSync(path.join(root, folder), {recursive: true});
  const files = {'.next/BUILD_ID':'fixture-build', '.next/standalone/server.js':'// fixture only', '.next/static/chunks/app.js':'static fixture', 'public/images/logo.png':'original fixture bytes', '.env':'PRIVATE_SENTINEL'};
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(root, name), data);
  return root;
}
test('standalone launcher uses generated server and copies both public/static assets', t => {
  const root = fixture(t), result = prepareStandalone(root);
  assert.equal(result.server, path.join(root, '.next/standalone/server.js'));
  assert.equal(result.cwd, root);
  assert.equal(fs.readFileSync(path.join(root, '.next/standalone/public/images/logo.png'), 'utf8'), 'original fixture bytes');
  assert.equal(fs.readFileSync(path.join(root, '.next/standalone/.next/static/chunks/app.js'), 'utf8'), 'static fixture');
  assert.equal(fs.existsSync(path.join(root, '.next/standalone/.env')), false);
  assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'PRIVATE_SENTINEL');
});
test('standalone asset copy can run twice without modifying source or build identity', t => {
  const root = fixture(t);prepareStandalone(root);prepareStandalone(root);
  assert.equal(fs.readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8'), 'fixture-build');
  assert.equal(fs.readFileSync(path.join(root, 'public/images/logo.png'), 'utf8'), 'original fixture bytes');
});
for (const missing of ['.next/BUILD_ID', '.next/standalone/server.js', '.next/static', 'public']) {
  test('missing ' + missing + ' fails before starting the isolated stack', t => {
    const root = fixture(t);fs.rmSync(path.join(root, missing), {recursive: true, force: true});
    assert.throws(() => prepareStandalone(root), /missing/);
    assert.equal(fs.existsSync(path.join(root, '.next/standalone/public')), false);
  });
}
test('DB browser stack no longer calls next start for standalone output', () => {
  const source = fs.readFileSync(new URL('../start-browser-stack.mjs', import.meta.url), 'utf8');
  assert.match(source, /prepareStandalone\(path\.join\(root,'frontend'\)\)/);
  assert.match(source, /\[standalone\.server\]/);
  assert.doesNotMatch(source, /next','start/);
  assert.ok(source.indexOf('const standalone=') < source.indexOf("child(process.execPath,['integration/browserServer.js']"));
});
