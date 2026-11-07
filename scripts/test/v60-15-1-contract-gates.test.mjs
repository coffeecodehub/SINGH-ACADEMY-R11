import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
test('release verification includes actual financial schema contracts before the expensive build', () => {
  const source = read('scripts/verify.mjs');
  const contract = source.indexOf("['run','test:contracts']");
  assert.ok(contract >= 0);
  assert.ok(contract < source.indexOf("['run','build']"));
});
test('integration gate checks schema contracts before any Docker operation', () => {
  const source = read('scripts/integration-check.mjs');
  const contract = source.indexOf("step('Payment schema/fixture contracts");
  assert.ok(contract >= 0);
  assert.ok(contract < source.indexOf("step('Docker availability'"));
});
test('schema contract command imports real models, not adapters or a network service', () => {
  const command = JSON.parse(read('backend/package.json')).scripts['test:contracts'];
  assert.equal(command, 'node --test contract-tests/*.test.js');
  const testSource = read('backend/contract-tests/payment-fixture.test.js');
  assert.match(testSource, /import Payment from '\.\.\/src\/models\/Payment\.js'/);
  assert.match(testSource, /validateSync\(\)/);
  assert.doesNotMatch(testSource, /mongoose\.connect\(|fetch\(|createConnection\(/);
});
