# Hostinger client-review deployment — V60.4

Use two Hostinger Node.js Web Apps but keep browser API traffic same-origin through the Next.js rewrite:

- Frontend: `https://review.your-domain.com`
- Backend origin: `https://api-review.your-domain.com`
- Frontend `NEXT_PUBLIC_API_URL=/api`
- Frontend `API_PROXY_TARGET=https://api-review.your-domain.com`
- Backend `FRONTEND_URL=https://review.your-domain.com`
- Backend `FRONTEND_URLS=https://review.your-domain.com`
- Backend `PUBLIC_API_URL=/api`
- Backend `PAYMENT_WEBHOOK_BASE_URL=https://api-review.your-domain.com`

The frontend/browser calls `/api`; Next.js proxies it to the backend. This preserves the existing same-origin session/cookie design.

## Backend Hostinger app
- Root directory: `backend`
- Node: 22.x
- Install: `npm ci` when `backend/package-lock.json` is committed; otherwise run `npm install` once and commit the generated lockfile.
- Start: `npm start`
- Run once after Atlas is connected: `npm run migrate:v60.4`

Review environment essentials:

```text
NODE_ENV=production
DEPLOYMENT_STAGE=review
MONGODB_URI=<SEPARATE REVIEW DATABASE URI>
FRONTEND_URL=https://review.your-domain.com
FRONTEND_URLS=https://review.your-domain.com
PUBLIC_API_URL=/api
PAYMENT_WEBHOOK_BASE_URL=https://api-review.your-domain.com
ONLINE_PAYMENTS_ENABLED=true
PAYMENTS_REQUIRE_BOTH=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
```

Keep the existing required production security variables as well: strong `AUTH_SECRET`, preserved `MFA_ENCRYPTION_KEY`, admin MFA, SMTP and upload scanner configuration.

## Frontend Hostinger app
- Root directory: `frontend`
- Node: 22.x
- Build: `npm run build`
- Start: `npm start`

Environment:

```text
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=https://api-review.your-domain.com
```

## Payment test verification
After test/sandbox credentials and webhook subscriptions are configured on the deployed backend:

```bash
npm --prefix backend run payments:check -- --remote --strict-webhooks
```

The check authenticates the configured provider accounts and verifies the webhook URL/event subscriptions without creating a charge.

Stripe webhook path:
`https://api-review.your-domain.com/api/payments/webhooks/stripe`

PayPal webhook path:
`https://api-review.your-domain.com/api/payments/webhooks/paypal`

Use the event list reported by `payments:check`; do not remove signature verification or fulfill access from a browser redirect alone.

## Switch to live
Use the production database/domain, set `DEPLOYMENT_STAGE=production`, replace Stripe test and PayPal sandbox credentials with live credentials, recreate/verify LIVE webhooks, run the same remote strict payment check, then complete one controlled real purchase and verify My Billing, My Courses, receipt, access dates and admin notification.
