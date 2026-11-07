/** Pure fixture/source contracts. Actual Mongoose validation is a separate
 * mandatory test:contracts command; these checks do not claim database coverage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syntheticSettlement, SYNTHETIC_VERIFICATION_SOURCE} from '../integration/fixtures/settlement.js';
import {assertEvidence} from '../src/utils/commerce.js';
import {load} from './testLoader.js';

const base = () => ({_id: '100000000000000000000001', user: '200000000000000000000001',
  provider: 'stripe', environment: 'test', providerOrderId: 'cs_SYNTHETIC_test',
  amountMinor: 10000, currency: 'USD'});
const input = () => ({paymentId: 'pi_SYNTHETIC_test', paidAt: new Date('2026-01-01T12:00:00Z')});

test('shared synthetic helper preserves provider/owner-bound order identity and value in every mode', () => {
  for (const provider of ['stripe', 'paypal']) for (const environment of ['test', 'live']) {
    const order = {...base(), provider, environment};
    const {evidence, verificationSource} = syntheticSettlement(order, input());
    assert.equal(verificationSource, 'provider_api');
    assert.equal(evidence.provider, provider);
    assert.equal(evidence.environment, environment);
    assert.equal(evidence.orderId, order._id);
    assert.equal(evidence.amountMinor, order.amountMinor);
    assert.doesNotThrow(() => assertEvidence(order, evidence));
  }
});

test('synthetic helper requires explicit date and never mutates the source order or date', () => {
  const order = base(), source = input(), before = structuredClone(order);
  const result = syntheticSettlement(order, source);
  result.evidence.paidAt.setUTCFullYear(2027);
  assert.equal(source.paidAt.getUTCFullYear(), 2026);
  assert.deepEqual(order, before);
  assert.throws(() => syntheticSettlement(order, {...source, paidAt: undefined}));
  assert.throws(() => syntheticSettlement(order, {...source, paidAt: new Date('bad')}));
});

test('synthetic helper refuses real-looking remote IDs and malformed evidence instead of hiding it', () => {
  for (const patch of [{_id: 'bad'}, {provider: 'other'}, {environment: 'production'},
    {amountMinor: 0}, {amountMinor: 0.5}, {currency: 'usd'}, {providerOrderId: 'cs_live_real'}]) {
    assert.throws(() => syntheticSettlement({...base(), ...patch}, input()));
  }
  assert.throws(() => syntheticSettlement(base(), {...input(), paymentId: 'pi_real'}));
});

test('source-level enum declaration agrees with fixture; does not add a testing-only source', () => {
  class Schema {
    static Types = {ObjectId: class ObjectId {}};
    constructor(definition) { this.definition = definition; }
    index() {}
  }
  const mongoose = {Schema, models: {}, model: (_name, schema) => ({schema})};
  const definition = load('../src/models/Payment.js', {mongoose}, 'schema').definition;
  assert.ok(definition.verificationSource.enum.includes(SYNTHETIC_VERIFICATION_SOURCE));
  assert.equal(definition.verificationSource.enum.includes('integration_fixture'), false);
});

test('V60.15 financial integration scenarios all remain; only the intentional rejection case uses the bad label', () => {
  const source = fs.readFileSync(new URL('../integration/v60-15-security.test.js', import.meta.url), 'utf8');
  assert.match(source, /syntheticSettlement\(order/);
  assert.match(source, /fulfillOnlineOrder\(order\._id,evidence,verificationSource\)/);
  for (const scenario of [
    'test membership never changes live invoice or enrollment expiry',
    'full membership refund removes membership without extending an expired original course',
    'refunding an older individual invoice preserves its independent paid renewal only',
    'refunding the newest invoice does not revoke the original independently paid course period',
    'partial provider refund preserves the purchased course interval',
    'concurrent duplicate settlement records only one interval, payment and invoice',
    'legacy merged membership enrollment does not override authoritative old course invoice dates',
    'foreign student cannot inherit another student paid grants',
  ]) assert.ok(source.includes(scenario), 'Missing original regression: ' + scenario);
  assert.doesNotMatch(source, /t\.skip|test\.skip|test\.only|t\.only|skip\s*:\s*true/);
  assert.match(source, /invalid verification source rolls back settlement/);
});
