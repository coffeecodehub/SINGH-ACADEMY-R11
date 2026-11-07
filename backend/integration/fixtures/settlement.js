/** Test-only settlement evidence. No provider API or database call happens here.
 * The evidence is SYNTHETIC; verificationSource describes the production code
 * path being simulated, not proof that a real provider was contacted.
 * Keep this module outside src/. Never add fixture values to the Payment enum.
 */
import assert from 'node:assert/strict';

export const SYNTHETIC_VERIFICATION_SOURCE = 'provider_api';

export function syntheticSettlement(order, {paymentId, paidAt} = {}) {
  assert.match(String(order?._id ?? ''), /^[a-f0-9]{24}$/i, 'Fixture requires a real-shaped order ID');
  assert.ok(['stripe', 'paypal'].includes(order.provider), 'Unsupported fixture provider');
  assert.ok(['test', 'live'].includes(order.environment), 'Unsupported fixture environment');
  assert.ok(Number.isSafeInteger(order.amountMinor) && order.amountMinor > 0, 'Invalid fixture amount');
  assert.match(order.currency ?? '', /^[A-Z]{3}$/, 'Invalid fixture currency');
  assert.match(order.providerOrderId ?? '', /^[A-Za-z]+_SYNTHETIC_[A-Za-z0-9-]+$/, 'Use an explicitly synthetic remote order ID');
  assert.match(paymentId ?? '', /^[A-Za-z]+_SYNTHETIC_[A-Za-z0-9-]+$/, 'Use an explicitly synthetic payment ID');
  assert.ok(paidAt instanceof Date && Number.isFinite(paidAt.getTime()), 'Fixture requires an explicit valid payment date');
  return {
    verificationSource: SYNTHETIC_VERIFICATION_SOURCE,
    evidence: {
      state: 'paid',
      provider: order.provider,
      environment: order.environment,
      providerOrderId: order.providerOrderId,
      orderId: String(order._id),
      amountMinor: order.amountMinor,
      currency: order.currency,
      paymentId,
      paidAt: new Date(paidAt.getTime()),
    },
  };
}
