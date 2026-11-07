/** Actual Mongoose validation without MongoDB, HTTP, provider or SMTP access.
 * Do NOT replace model imports with test adapters. This is the missing boundary
 * between a controlled business-service test and a persisted Payment document.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Payment from '../src/models/Payment.js';
import CheckoutOrder from '../src/models/CheckoutOrder.js';
import {assertEvidence} from '../src/utils/commerce.js';
import {syntheticSettlement, SYNTHETIC_VERIFICATION_SOURCE} from '../integration/fixtures/settlement.js';

function fixture(provider = 'stripe', environment = 'live', kind = 'course') {
  const user = new mongoose.Types.ObjectId();
  const order = new CheckoutOrder({
    user, provider, environment, kind,
    product: kind === 'course' ? 'schema-fixture-course' : 'Schema fixture membership',
    title: 'SYNTHETIC schema contract - no real money',
    providerOrderId: (provider === 'stripe' ? 'cs' : 'pp') + '_SYNTHETIC_schema',
    status: 'pending', amountMinor: 10000, currency: 'USD', durationMonths: 1,
    expiresAt: new Date('2026-02-01T12:00:00Z'),
    requestKey: 'synthetic-schema-contract', requestFingerprint: 'synthetic-schema-contract',
  });
  const {evidence, verificationSource} = syntheticSettlement(order, {
    paymentId: (provider === 'stripe' ? 'pi' : 'capture') + '_SYNTHETIC_schema',
    paidAt: new Date('2026-01-01T12:00:00Z'),
  });
  const payment = new Payment({
    user, invoice: new mongoose.Types.ObjectId(), checkoutOrder: order._id,
    kind, courseSlug: kind === 'course' ? order.product : undefined,
    provider, providerPaymentId: evidence.paymentId,
    providerRecordKey: [provider, environment, evidence.paymentId].join(':'),
    status: 'paid', amountMinor: order.amountMinor, amount: order.amountMinor / 100,
    currency: order.currency, paidAt: evidence.paidAt, verifiedAt: evidence.paidAt,
    verificationSource, testMode: environment === 'test', reference: evidence.paymentId,
    requestKey: 'online-payment-' + String(order._id), requestFingerprint: 'synthetic-schema-contract',
  });
  return {order, evidence, verificationSource, payment};
}

test('Payment verification-source enum remains production-only and the fixture uses provider_api', () => {
  assert.deepEqual(Payment.schema.path('verificationSource').enumValues,
    ['provider_webhook', 'provider_api', 'admin_recorded']);
  assert.equal(SYNTHETIC_VERIFICATION_SOURCE, 'provider_api');
});

for (const provider of ['stripe', 'paypal']) {
  for (const environment of ['test', 'live']) {
    for (const kind of ['course', 'membership']) {
      test(`${provider}/${environment}/${kind}: exact synthetic evidence validates against actual CheckoutOrder and Payment models`, () => {
        const {order, evidence, payment, verificationSource} = fixture(provider, environment, kind);
        assert.ifError(order.validateSync());
        assert.doesNotThrow(() => assertEvidence(order, evidence));
        assert.ifError(payment.validateSync());
        assert.equal(payment.verificationSource, verificationSource);
        assert.equal(String(payment.checkoutOrder), evidence.orderId);
        assert.equal(String(payment.user), String(order.user));
        assert.equal(payment.testMode, environment === 'test');
      });
    }
  }
}

test('actual Payment validation rejects the reported integration_fixture value; no schema bypass', () => {
  const {payment} = fixture();
  payment.verificationSource = 'integration_fixture';
  const error = payment.validateSync();
  assert.ok(error, 'The unsupported test label must NOT become a valid financial verification source');
  assert.deepEqual(Object.keys(error.errors), ['verificationSource']);
  assert.equal(error.errors.verificationSource.kind, 'enum');
  assert.equal(error.errors.verificationSource.value, 'integration_fixture');
});

test('actual Payment validation still rejects invalid money and missing owner', () => {
  const {payment} = fixture();
  payment.user = undefined;
  payment.amountMinor = 0.5;
  const error = payment.validateSync();
  assert.ok(error?.errors.user);
  assert.ok(error?.errors.amountMinor);
});

test('fixture creation and model validation open no database connection', () => {
  assert.equal(mongoose.connection.readyState, 0);
  assert.ok(mongoose.connections.every(connection => connection.readyState === 0));
});
