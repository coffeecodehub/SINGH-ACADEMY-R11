/** Actual route/helper functions, compiled in a controlled module harness.
 * Not a replacement for Next routing/streaming browser tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {once} from 'node:events';
import {compileModule} from './compile.mjs';
const helper = compileModule('../lib/server/retiredNotFound.ts');
const policy = compileModule('../lib/pagePolicy.ts');
const routes = ['/free-resources', '/resources'];
const load = route => compileModule(`../app${route}/[[...retired]]/route.ts`, {
  imports: {'../../../lib/server/retiredNotFound': helper},
});
for (const route of routes) {
  test(`${route}: GET returns terminal native HTTP 404 with no script or account reflection`, async () => {
    const mod = load(route);
    const res = mod.GET(new Request('http://localhost:3000' + route + '?secret=PRIVATE_TEST_VALUE', {headers: {cookie: 'PRIVATE_TEST_COOKIE'}}));
    assert.equal(mod.dynamic, 'force-dynamic');
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(res.headers.get('cache-control'), /no-store/);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
    assert.equal(res.headers.get('set-cookie'), null);
    const body = await res.text();
    assert.match(body, /<h1>Page not found<\/h1>/);
    assert.match(body, /href="\/">Return to Singh Academy<\/a>/);
    assert.doesNotMatch(body, /<script|PRIVATE_TEST|Loading Singh Academy/);
  });
  test(`${route}: HEAD returns exactly the same status and headers as GET but no body`, async () => {
    const mod = load(route), get = mod.GET(), head = mod.HEAD();
    assert.equal(head.status, 404);
    assert.deepEqual([...head.headers], [...get.headers]);
    assert.equal(head.body, null);
    assert.equal(await head.text(), '');
  });
  test(`${route}: old streamed page is absent; tombstone is not a new public-page exception`, () => {
    assert.equal(fs.existsSync(new URL('../app' + route + '/page.tsx', import.meta.url)), false);
    assert.equal(policy.publicPage(route), false);
    assert.equal(policy.publicPage(route + '/old-guide'), false);
    assert.equal(new URL(policy.loginDestination(route, '?source=bookmark'), 'http://localhost:3000').searchParams.get('next'), route + '?source=bookmark');
  });
  test(`${route}: actual helper survives HTTP transport with 404, including HEAD`, async () => {
    const mod = load(route);
    const server = http.createServer(async (req, res) => {
      const output = req.method === 'HEAD' ? mod.HEAD() : mod.GET();
      res.writeHead(output.status, Object.fromEntries(output.headers));
      res.end(Buffer.from(await output.arrayBuffer()));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const base = 'http://127.0.0.1:' + server.address().port;
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(base + route, {method});
        assert.equal(response.status, 404);
        assert.equal(response.headers.get('x-robots-tag'), 'noindex');
        const text = await response.text();
        if (method === 'HEAD') assert.equal(text, '');
        else assert.match(text, /Page not found/);
      }
    } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
  });
}
test('retired response copy and CSS values retain the existing status-page appearance', async () => {
  const html = await helper.retiredNotFoundResponse().text();
  const old = fs.readFileSync(new URL('../app/not-found.tsx', import.meta.url), 'utf8');
  for (const text of ['Page not found', 'This address may have changed. Your academy is still here.', 'Return to Singh Academy']) {
    assert.ok(old.includes(text)); assert.ok(html.includes(text));
  }
  const css = fs.readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
  for (const declaration of ['min-height:70vh','font-size:clamp(24px,4vw,38px)','background:#f7f5f0','background:#9b663d','color:#58675f']) {
    assert.ok(css.includes(declaration)); assert.ok(html.includes(declaration));
  }
});
test('original 404 browser assertion remains strict; ordinary release gate also covers both retired URLs', () => {
  const original = fs.readFileSync(new URL('../e2e/public-portals.spec.ts', import.meta.url), 'utf8');
  assert.match(original, /page\.goto\('\/free-resources'\).*toBe\(404\)/);
  const source = fs.readFileSync(new URL('../ui-tests/retired-routes-v60-15-2.spec.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("['/free-resources', '/resources']"));
  assert.match(source, /response\?\.status\(\)\)\.toBe\(404\)/);
  assert.doesNotMatch(source, /test\.skip|test\.fixme|toBe\(200\)/);
});
