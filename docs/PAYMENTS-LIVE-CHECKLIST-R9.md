> R10 update: explicit refund webhooks are disabled. Use [WEBHOOK-EVENTS-R10.md](WEBHOOK-EVENTS-R10.md) for the current event lists and retained reversal protections.

# Stripe and PayPal deployment checklist

No credentials are included in this release. Keep secrets in the backend's private environment or Hostinger secret settings. Do not put them in frontend code, chat, screenshots or the downloadable ZIP. Existing payment records must remain in the existing database; do not seed or reset it for deployment.

## Backend environment

| Setting | Required configuration |
| --- | --- |
| `NODE_ENV` | `production` on the deployed server |
| `DEPLOYMENT_STAGE` | `production` for live payments; `review` for hosted test/sandbox checks |
| `FRONTEND_URL` | `https://singhacademy.com` (exact origin; no path or final slash) |
| `FRONTEND_URLS` | The exact allowed website origin(s), including `https://singhacademy.com`; add `www` only if actually served |
| `PUBLIC_API_URL` | `/api` with the existing same-origin frontend proxy |
| `PAYMENT_WEBHOOK_BASE_URL` | `https://singhacademy.com` when that domain proxies `/api` to the backend |
| `STRIPE_SECRET_KEY` | Backend Stripe `sk_live_…` secret for the intended account |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` signing secret for this exact live webhook destination |
| `STRIPE_PUBLISHABLE_KEY` | A publishable key is not required by the current hosted Checkout redirect flow; no card form is implemented in this application |
| `PAYPAL_CLIENT_ID` | Live REST app client ID |
| `PAYPAL_CLIENT_SECRET` **or** `PAYPAL_SECRET` | Live REST app secret. Both names work. Set one; if both are present they must match. The original name remains supported |
| `PAYPAL_MODE` | `live` for production; `sandbox` for testing |
| `PAYPAL_WEBHOOK_ID` | ID of the webhook registered on that same live REST app |
| `PAYPAL_MERCHANT_ID` | Existing optional merchant payee check; if configured it must identify the same merchant account |
| `PAYMENTS_REQUIRE_BOTH` | `true` when Stripe and PayPal must both be configured |
| `ONLINE_PAYMENTS_ENABLED` | Keep `false` while checking configuration; enable explicitly when the deployed checkout is ready |

Stripe mode derives from the secret key prefix; there is no `PAYMENT_ENV` setting. Hosted review requires Stripe test keys and PayPal sandbox. Live production rejects test/sandbox checkout; providers must use matching environments. Keep all existing database, authentication, proxy, SMTP and upload settings: payment keys alone are not the entire deployment configuration.

## Webhook destinations

- Stripe: `https://singhacademy.com/api/payments/webhooks/stripe`
- PayPal: `https://singhacademy.com/api/payments/webhooks/paypal`

These destinations must reach the backend without a login page, redirect or browser CSRF challenge. Preserve the raw request bytes and provider signature headers. Do not exempt signatures. If the public API origin differs, use that verified origin in `PAYMENT_WEBHOOK_BASE_URL` and register its corresponding URLs.

Stripe required events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
invoice.paid
invoice.payment_failed
customer.subscription.updated
customer.subscription.deleted
charge.dispute.created
charge.dispute.closed
```

PayPal required events:

```text
CHECKOUT.ORDER.APPROVED
CHECKOUT.PAYMENT-APPROVAL.REVERSED
PAYMENT.CAPTURE.COMPLETED
PAYMENT.CAPTURE.DENIED
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

`PAYMENT.CAPTURE.DECLINED` is accepted as the PayPal equivalent of `DENIED`. If a required event is unavailable for the app, inspect the checker report and provider account; do not remove the event requirement just to obtain a pass.

## Verification sequence

1. From the intended project folder, run `npm.cmd run db:check` and `npm.cmd run deploy:check`. Review any failure before starting public checkout. Do not run a seed or reset against existing payment records.
2. On a review deployment, test course and section purchases with Stripe test / PayPal sandbox: approval, abandoned checkout, declined/failed payment, browser return, verified webhook and duplicate delivery, paid access and invoice. Confirm regional prices and coupons from the server's quote; a coupon applies only to its agreed first period.
3. For live configuration, run `npm.cmd run payments:check -- --live --allow-disabled --remote --strict-webhooks` in the environment containing the intended backend settings. It performs provider authentication and registration reads; it does not create an order, charge or refund. Never paste its secret inputs into command arguments. The optional `payments:live` interactive helper uses the original `PAYPAL_CLIENT_SECRET` prompt name.
4. Confirm actual signed delivery to the deployed URLs. Registration listing cannot verify a Stripe signing secret or prove that Hostinger saved the same credentials. PayPal simulator-only events are not a substitute for this integration's verified provider postback.
5. After the account owner enables live checkout, verify a legitimate purchase, provider settlement, a single invoice/access grant and delivery logs. Do not use test cards in live mode. Verify automatic renewal off/on and immediate cancellation using the provider-backed controls; one-time purchases require a separate provider renewal consent.

No live merchant transaction or deployment was performed during this code update. Local tests use synthetic responses and an isolated test database; they cannot certify the owner's live keys, account activation, DNS, Hostinger settings or real webhook delivery.

## If checkout still fails

The public error now includes a request ID. In backend logs, find the matching `api_error`: `paymentProvider`, provider status/type/code/parameter/issue and the Stripe request ID or PayPal debug ID identify the rejection without logging the raw provider body, headers, keys or customer details. Use the provider ID in the merchant dashboard to inspect the actual cause. Continue or inspect the same pending order after a timeout or uncertain response; do not create another charge to test whether the first one succeeded.
