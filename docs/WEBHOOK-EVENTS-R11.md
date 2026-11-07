# R11 payment verification and sandbox/live checklist

R11 keeps the existing Stripe hosted Checkout and PayPal Orders/Subscriptions flows. Payment mode comes from backend environment configuration. No customer payment, invoice, subscription or historical refund record is edited by this update. No real credentials are included in source.

Purchases remain non-refundable, subject to applicable law and provider rights. The application does not initiate refunds or process explicit refund webhook events. Existing signed refund deliveries are acknowledged and deduplicated without a refund lookup, credit or access mutation. Involuntary reversals and disputes remain verified payment-failure protections; they are not voluntary refunds. In particular, do not remove `PAYMENT.SALE.REVERSED` or `CHECKOUT.PAYMENT-APPROVAL.REVERSED`.

## Backend settings

Keep existing database, authentication, SMTP, media and trusted-proxy settings. Never put backend secrets in `NEXT_PUBLIC_*`, source code or chat.

| Variable | Sandbox/review | Live |
| --- | --- | --- |
| `NODE_ENV` | `development` on localhost; `production` on a hosted review deployment | `production` |
| `DEPLOYMENT_STAGE` | `development` on localhost; `review` on hosted sandbox | `production` |
| `FRONTEND_URL` | Actual frontend origin | Actual HTTPS frontend origin |
| `FRONTEND_URLS` | Exact allowed frontend origins | Exact allowed HTTPS frontend origins |
| `PUBLIC_API_URL` | `/api` | `/api` |
| `PAYMENT_WEBHOOK_BASE_URL` | Public HTTPS backend origin receiving real sandbox deliveries | Public HTTPS backend origin receiving live deliveries |
| `STRIPE_SECRET_KEY` | Intended account's `sk_test_...` | Intended account's `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for that exact test destination | Signing secret for that exact live destination |
| `PAYPAL_MODE` | `sandbox` | `live` |
| `PAYPAL_CLIENT_ID` | Sandbox REST app client ID | Live REST app client ID |
| `PAYPAL_CLIENT_SECRET` or `PAYPAL_SECRET` | Same sandbox app secret | Same live app secret |
| `PAYPAL_WEBHOOK_ID` | Webhook ID under that sandbox app | Webhook ID under that live app |
| `PAYPAL_MERCHANT_ID` | Existing optional sandbox merchant check | Existing optional live merchant check |
| `PAYMENTS_REQUIRE_BOTH` | `true` when both providers must be connected | Same policy |
| `ONLINE_PAYMENTS_ENABLED` | Keep `false` for configuration-only checks; enable when testing actual checkout | Enable only after deployment/configuration verification |

Set one PayPal secret name; if both aliases exist they must match. Stripe test/live mode derives from the secret key, not a new mode variable. The current hosted Checkout redirect does not need a Stripe publishable key; `STRIPE_PUBLISHABLE_KEY` is not a replacement for either backend secret. Hosted review rejects live keys; live production rejects test/sandbox checkout.

For the existing split-domain deployment, the webhook base is `https://api.singhacademy.com`. Frontend runtime settings are `NEXT_PUBLIC_API_URL=/api`, `API_PROXY_TARGET=https://api.singhacademy.com` and `PUBLIC_SITE_URL` set to the actual frontend HTTPS origin. Local frontend testing instead uses `API_PROXY_TARGET=http://localhost:5000`. Localhost alone cannot receive provider webhooks; use the existing HTTPS review deployment for genuine delivery tests.

## Stripe destination

URL: `https://api.singhacademy.com/api/payments/webhooks/stripe`

Choose **Your account**, **Snapshot**, and the environment matching the backend keys. Enable these 10 events:

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

## PayPal destination

URL: `https://api.singhacademy.com/api/payments/webhooks/paypal`

Register the destination under the same Sandbox/Live REST app as the credentials. Enable these 17 events:

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

The checker accepts `PAYMENT.CAPTURE.DENIED` as the legacy alias for `PAYMENT.CAPTURE.DECLINED`. Some dashboard catalogs omit approval-reversal; keep the previously verified API registration rather than substituting another event. `charge.refunded`, `refund.*`, `PAYMENT.CAPTURE.REFUNDED` and `PAYMENT.SALE.REFUNDED` are not required. Old additional subscriptions may remain; they do not make readiness fail. This update does not change remote dashboard subscriptions.

## Configuration check and actual payment acceptance

Run in the environment containing the intended backend settings:

```powershell
npm.cmd run payments:check -- --allow-disabled --remote --strict-webhooks
```

For the intended live configuration only:

```powershell
npm.cmd run payments:check -- --live --allow-disabled --remote --strict-webhooks
```

These checks authenticate provider credentials and read webhook registrations. They do not create a payment, validate a Stripe signing secret by listing destinations, prove deployed credentials match local settings, or prove paid access.

Before live sales, use a sandbox buyer on the matching deployed review frontend/backend and verify:

1. Course and full-section checkout through both Stripe and PayPal, using server regional prices and accepted terms.
2. Real signed provider delivery succeeds; an unsigned/tampered delivery is rejected. PayPal simulator mock events alone are not this integration's verified postback proof.
3. A paid purchase produces one payment/invoice/access grant; browser return, webhook replay and refresh do not duplicate them.
4. Section access opens all eligible section courses, hides the purchase option, and expires correctly. A single-course purchase does not grant the entire section.
5. Abandoned/declined/unpaid checkout never grants access. After a timeout, inspect or retry the same saved order rather than paying again.
6. Existing automatic-renewal and cancellation controls retain their provider-backed behavior and existing paid-term policy.

R11's isolated tests use synthetic provider responses, real Stripe signature verification, loopback HTTP and generated disposable Mongo databases. Real sandbox credentials and signed delivery against the owner's hosted deployment still require the owner's next acceptance step. No deployment or real merchant operation is performed by this verification.
