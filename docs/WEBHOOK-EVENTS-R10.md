# Current Stripe and PayPal webhook policy

Explicit refund webhook processing is disabled. A previously subscribed refund event still passes normal signature/environment verification and receives a successful, deduplicated acknowledgement, but performs no refund-provider lookup, refund credit, balance change or access cancellation. Historical records and financial schemas are retained.

Involuntary payment reversals and disputes remain payment-failure protections. In particular, `PAYMENT.SALE.REVERSED` retains its verified reversal accounting/access handling; it is not a customer refund operation. `CHECKOUT.PAYMENT-APPROVAL.REVERSED` must remain enabled so a delayed approval cannot capture a cancelled checkout.

## Stripe

Destination: `${PAYMENT_WEBHOOK_BASE_URL}/api/payments/webhooks/stripe`.

For the backend address previously configured in this project: `https://api.singhacademy.com/api/payments/webhooks/stripe`.

Select **Your account**, **Snapshot** payloads and the matching test/live environment. Enable these10 events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
charge.dispute.created
charge.dispute.closed
invoice.paid
invoice.payment_failed
customer.subscription.updated
customer.subscription.deleted
```

`charge.refunded` and `refund.*` are not required and have no refund-processing handler.

## PayPal

Destination: `${PAYMENT_WEBHOOK_BASE_URL}/api/payments/webhooks/paypal`.

For the backend address previously configured in this project: `https://api.singhacademy.com/api/payments/webhooks/paypal`.

Use the webhook created under the same Sandbox or Live REST app as the backend credentials. Enable these17 events:

```text
CHECKOUT.ORDER.APPROVED
CHECKOUT.PAYMENT-APPROVAL.REVERSED
PAYMENT.CAPTURE.COMPLETED
PAYMENT.CAPTURE.DECLINED
PAYMENT.CAPTURE.PENDING
PAYMENT.CAPTURE.REVERSED
CUSTOMER.DISPUTE.CREATED
CUSTOMER.DISPUTE.RESOLVED
BILLING.SUBSCRIPTION.CREATED
BILLING.SUBSCRIPTION.ACTIVATED
BILLING.SUBSCRIPTION.UPDATED
BILLING.SUBSCRIPTION.SUSPENDED
BILLING.SUBSCRIPTION.CANCELLED
BILLING.SUBSCRIPTION.EXPIRED
BILLING.SUBSCRIPTION.PAYMENT.FAILED
PAYMENT.SALE.COMPLETED
PAYMENT.SALE.REVERSED
```

The checker accepts legacy `PAYMENT.CAPTURE.DENIED` or current `PAYMENT.CAPTURE.DECLINED` as equivalent. `PAYMENT.CAPTURE.REFUNDED` and `PAYMENT.SALE.REFUNDED` are not required. Some PayPal dashboard catalogs omit the documented approval-reversal event; retain the existing API registration/read-back procedure rather than substituting a different event.

No provider destination or saved subscription was changed by this code update. Operators may deselect the removed refund events in their dashboards. Existing additional subscriptions do not make readiness fail; the explicit repair command remains additive and does not silently delete subscriptions.

## Existing settings and verification

Keep backend `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` (or existing `PAYPAL_CLIENT_SECRET` alias), `PAYPAL_WEBHOOK_ID`, `PAYPAL_MERCHANT_ID`, `PAYPAL_MODE`, `PAYMENT_WEBHOOK_BASE_URL` and the current frontend origin/payment activation settings consistent with the intended environment. No real keys belong in source or chat. `STRIPE_PUBLISHABLE_KEY` remains public configuration where the existing integration uses it; it does not replace the backend secret or signing secret.

The existing read-only registration check is:

```powershell
npm.cmd run payments:check -- --allow-disabled --remote --strict-webhooks
```

Add `--live` only when checking the intended live configuration. Registration is not proof of signed delivery or a completed purchase. An end-to-end sandbox check still needs a real signed provider delivery, successful purchase, correct access, failure handling and replay verification against the deployed matching code. This task's automated checks use isolated fixtures and do not mutate real provider settings or customer records.
