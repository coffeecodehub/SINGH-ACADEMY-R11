# Singh Academy V60.7 — update the two EXISTING Hostinger apps

## What this fixes, and what cannot be inferred from the screenshots

The old frontend converted any session-check error into a signed-out account. It also converted failed team/course requests into empty-content messages. Those are confirmed code defects, not proof that your database records were deleted. V60.7 distinguishes successful empty data, genuine unauthorized access, and a temporary API failure.

A wrong Atlas database name, unpublished course, inactive team member, Hostinger outage or an API cache configured to ignore response headers can still cause a real deployment problem. The included read-only diagnostics distinguish those cases. Do not run seeds or invent empty records to hide them.

## 1. Update the existing GitHub repository — do not create another Hostinger website

Extract the ZIP. Its one top-level folder contains `backend`, `frontend`, `scripts`, `qa`, `.github` and `package.json`.
Copy those project contents into your EXISTING Git working folder. Do not nest the whole folder under another project folder. Keep:
- existing `backend/.env` and `frontend/.env.local` on your computer (private, never commit them);
- the exact working MongoDB database name and credentials;
- the same AUTH_SECRET / MFA_ENCRYPTION_KEY; do not rotate them during this fix;
- existing tested backend/frontend `package-lock.json` files; dependencies were not changed by this update.

Take a backup/snapshot of the actual Atlas database before applying any release. Do not confuse Hostinger website-file backups with an Atlas database backup.

From the repository root in PowerShell, using Node 22.x:

```powershell
node -v
npm run install:all
npm --prefix backend run preflight
npm run migrate:v60.7
npm run verify
npm run payments:check
```

`migrate:v60.7` only initializes the student-notification collection/indexes. It does NOT seed, delete accounts, reissue certificates, reset progress, reprice invoices or modify payments. Run it only after confirming `backend/.env` points to the intended database. It is safe to repeat.

If lockfiles are not present, `install:all` generates them on your working network. Review/commit them. Never use `npm audit fix --force`, remove failing tests, or disable the audit to obtain a green result.

```powershell
git status
git check-ignore backend/.env frontend/.env.local
git add .
git status
# Inspect the staged list: no secrets, .env, node_modules or .next should be staged.
git commit -m "Fix session persistence, API loading and purchase email outbox"
git push origin main
```

Pause the two apps' automatic deployment during preparation if it is enabled, then manually redeploy backend first and frontend second after the environment settings below are correct. Do not connect/change the main domain or mail plan during this repair.

## 2. Frontend Hostinger app — exact values

App: `mediumspringgreen-cod-301282.hostingersite.com`

```env
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=https://navajowhite-lobster-767933.hostingersite.com
```

Keep: Root directory `frontend`, Next.js preset, Node `22.x`, build `npm run build`, output `.next`.
Do not set `NEXT_PUBLIC_API_URL` to localhost or the backend domain. Do not use `https://api.singhacademy.com` until that domain really serves this backend. Do not add MongoDB, payment, email or auth secret values to this app.

V60.7 uses a dynamic streaming `/api/[...path]` Route Handler. It forwards only the expected headers, preserves separate HttpOnly session cookies, blocks upstream redirects, and sends private/no-store cache directives. It does not auto-retry payment POST requests.

Redeploy this app to install the new code. Editing environment variables does not replace the old frontend code.

## 3. Backend Hostinger app — exact public origins

App: `navajowhite-lobster-767933.hostingersite.com`

Keep: Root directory `backend`, Other/Node preset, Node `22.x`, build None, output empty, entry `src/server.js`. Keep the platform-provided PORT behavior that already worked; do not add a conflicting hard-coded port.

Update/check:

```env
FRONTEND_URL=https://mediumspringgreen-cod-301282.hostingersite.com
FRONTEND_URLS=https://mediumspringgreen-cod-301282.hostingersite.com
PUBLIC_API_URL=/api
PAYMENT_WEBHOOK_BASE_URL=https://navajowhite-lobster-767933.hostingersite.com
STUDENT_NOTIFICATIONS_ENABLED=true
STUDENT_NOTIFICATION_POLL_MS=5000
REQUIRE_EMAIL_VERIFICATION=false
```

Keep the actual tested MongoDB URI and database name. Do NOT switch to a new `/test` or `/singhacademy` database as part of this update. Keep your existing Stripe TEST and PayPal SANDBOX keys for review.

### Correct the earlier development-mode workaround

A public review site should not depend on `NODE_ENV=development` to bypass security checks. The package includes an explicit limited review profile:

```env
NODE_ENV=production
DEPLOYMENT_STAGE=review
REQUIRE_ADMIN_MFA=true
UPLOADS_ENABLED=false
```

This **disables all new uploads**: admin file/image uploads, assignment attachments and payment screenshots. Existing saved media, text answers, course reading, sessions and sandbox checkout remain available. With this explicit review-only setting, preflight does not require a nonexistent ClamAV host. It is not a pretend virus scanner and is not the full upload-enabled production profile.

To have uploads working, configure an actually reachable scanner, then use:

```env
UPLOADS_ENABLED=true
UPLOAD_SCAN_REQUIRED=true
CLAMAV_HOST=<your actual scanner hostname>
CLAMAV_PORT=<its actual port>
```

Do not enter `127.0.0.1` or `scanner` on managed Hostinger unless a scanner actually exists there. Do not expose an unauthenticated ClamAV port to the Internet. Live production retains the strict scanner gate. A scanner on a private supported service/VPS is a separate infrastructure task; no such service is bundled or provisioned by this ZIP.

Admin MFA setup remains necessary for public production/review. Sign in to each admin portal and finish Account Security setup; this does NOT add email verification/MFA to ordinary student registration. Preserve the existing MFA encryption key.

## 4. Email — welcome + individual purchase + membership confirmation

Welcome email is a durable per-student notification. Course-purchase and membership congratulations are queued inside the verified payment transaction, with a unique invoice/term identity. Replayed provider events do not create another normal confirmation record.

The worker polls every 5 seconds when idle and retries failed SMTP attempts with backoff. This is not a guarantee of inbox delivery within 5 seconds: SMTP latency, service availability, backlog and recipient filtering still apply. Expiry scans remain separate at a 15-minute cadence.

Use Hostinger Email > the relevant mailbox > its current client/SMTP configuration. Fill actual values:

```env
SMTP_HOST=<actual SMTP host>
SMTP_PORT=<actual SMTP port>
SMTP_SECURE=<true for implicit TLS, false for STARTTLS as specified by your mail provider>
SMTP_USER=noreply@singhacademy.com
SMTP_PASS=<that mailbox's actual password>
EMAIL_FROM=Singh Academy <noreply@singhacademy.com>
```

Use `noreply@singhacademy.com` only if it is the active authenticated mailbox you intend to send from; your screenshot showed that mailbox, not `no-reply@singhacademy.com`. Confirm domain MX/SPF/DKIM and send/receive a webmail test. “Active mailbox” in hPanel alone does not prove DNS/SMTP/inbox delivery is configured.

For Stripe test / PayPal sandbox purchases, outbound purchase emails are off by default to avoid contacting real students during tests. Explicitly enable only your tester(s):

```env
SEND_SANDBOX_EMAILS=true
SANDBOX_EMAIL_ALLOWLIST=YOUR_ACTUAL_TEST_RECIPIENT_EMAIL
```

Replace the value with the actual recipient; use comma-separated exact addresses for more than one tester. There is no wildcard. Test purchase mail is labelled SANDBOX/no real money. Live stage rejects this setting: set `SEND_SANDBOX_EMAILS=false` before real payments.

Run against the configured backend environment:

```powershell
npm --prefix backend run mail:verify
npm --prefix backend run notifications:run
npm --prefix backend run diagnose:content
```

`mail:verify` tests SMTP connection/authentication, NOT inbox delivery. A new signup/purchase tests actual delivery. The outbox differentiates `queued`, `deferred`, `sent` (SMTP accepted), `dev_preview`, `skipped` and `failed`. Do not report a console preview as an email. Old sandbox records already marked skipped are not automatically bulk-resent.

SMTP delivery is at-least-once under crash recovery: deduped outbox/leases/message IDs prevent normal replay duplicates, but a crash after SMTP acceptance and before database acknowledgement may redeliver. Do not advertise guaranteed exactly-once email.

## 5. Clear stale API caches once; do not ask users to keep refreshing

Use the existing Hostinger cache controls to purge both apps after redeploy. Ensure `/api/*` is NOT force-cached by CDN rules and responses setting Cookie/session/billing data are not cached. If your Hostinger tier cannot exclude the API, temporarily disable that app's CDN/cache while validating; ask Hostinger support how to exclude API paths before re-enabling. Do not change unrelated DNS/mail records.

Keep immutable JS/images caching. This release sends private/no-store + CDN/Surrogate/LiteSpeed no-cache headers for API responses, and only successful public content has short, capped browser-memory reuse. No private user data is shared-cached.

The actual forwarded-IP topology was not remotely inspected. Do not guess new `TRUST_PROXY_HOPS` values or blindly trust arbitrary X-Forwarded-For. Verified student IDs now separate authenticated global-rate-limit buckets, reducing a shared-proxy bottleneck without weakening login limits.

## 6. Confirm BOTH apps are on the new deployment

Run this from project root on your machine (public reads only; no secrets required):

```powershell
npm run deploy:check -- --front https://mediumspringgreen-cod-301282.hostingersite.com --api https://navajowhite-lobster-767933.hostingersite.com
```

It checks health/version, database readiness, anonymous session response, team and course content on the backend AND through the frontend proxy. Expected health version: `60.7.0`. It prints HTTP status, cache flags, timing and counts, never user cookies/payment details.

Interpretation:
- Backend healthy but frontend proxy fails: check the frontend API_PROXY_TARGET, new route handler deployment, cache and backend origin/redirect settings.
- Both return 503: read backend Runtime logs; check environment validation, database/network/scanner availability.
- Successful 200 JSON with `team: []` / `courses: []`: run `diagnose:content` against the SAME database as Hostinger; check database name and active/published flags. This is not fixed by clearing cookies or generating fake content.
- Existing private page receives a genuine session expiry: sign in again; real revocation, password-reset and admin permissions are not bypassed by this patch.

## 7. Stripe / PayPal webhooks must use the ACTUAL current backend

For the current temporary-domain deployment:

```text
https://navajowhite-lobster-767933.hostingersite.com/api/payments/webhooks/stripe
https://navajowhite-lobster-767933.hostingersite.com/api/payments/webhooks/paypal
```

Your original dashboard endpoints were created for `api.singhacademy.com`. Setting PAYMENT_WEBHOOK_BASE_URL in `.env` alone does NOT move a provider's registered endpoint. Check the provider dashboard and use the matching signing secret / webhook ID for the endpoint actually receiving events. Keep sandbox and live endpoints/keys separate.

```powershell
npm --prefix backend run payments:check -- --remote --strict-webhooks
```

Provider configuration validation does not replace a real sandbox checkout + delivery event test. Never mark a paid course complete using a browser success URL alone.

## 8. Final browser acceptance before client review

Use the FRONTEND domain only for login. Do not log in through the backend domain expecting those separate-domain cookies to authenticate the frontend.

In a normal browser, sign in as Student A. Open Courses, Team, My Courses and My Billing repeatedly. Enroll a free course, navigate to a lesson, edit an answer, switch tabs/focus, and confirm the user/draft stay intact. Test a short network outage; expect a retry state, not “coming soon” or forced sign-out. Reconnect and use Retry without multiple full refreshes.

Use an incognito/separate browser as Student B. Enroll the same course; confirm independent progress, answers, invoices and certificates. Neither account should see the other's private state. Test real logout/password-reset/revocation still sign out that account correctly.

Complete separate sandbox course and membership purchases, verify My Billing + Client Admin records and a corresponding labelled email to your allowlisted inbox. Check provider webhook deliveries even when the buyer closes the return page. Test the existing certificate approval/download flow without reissuing old certificates automatically.

Only hand over after `npm run verify`, the public deployment diagnostic, these signed-in browser tests and inbox/webhook checks pass. No numeric “zero-millisecond” performance promise is made by this release.
