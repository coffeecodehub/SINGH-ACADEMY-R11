# Singh Academy V60.10 — Local test and Hostinger update guide

This guide supersedes the older deployment notes in this archive. Do not mix an older frontend with this backend. The new version is **60.10.0** in both applications.

## 1. Preserve your working configuration

Stop old frontend/backend terminals using Ctrl+C. Extract the ZIP and open the folder that directly contains `package.json`, `backend`, and `frontend` in VS Code.

Keep a backup of the previous code and database. Copy your working private `backend/.env` into the new backend folder. Preserve the exact MongoDB database name and AUTH_SECRET. Existing MFA encryption secrets may be preserved for rollback, but the new sign-in flow does not use them. Do not paste secrets into chat or GitHub.

Dependencies were not changed by this release. Preserve your already-tested `backend/package-lock.json` and `frontend/package-lock.json`; do not copy `node_modules` or `.next`. If no lockfiles are available, `install:all` generates them on a working network. Review and commit lockfiles, never credentials. Do not run `npm audit fix --force` or delete your database.

## 2. Local environment only

Use Node **22.x**:

```powershell
node -v
```

Create/update `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=http://127.0.0.1:5000
```

In your existing **local** `backend/.env`, use:

```env
NODE_ENV=development
DEPLOYMENT_STAGE=development
PORT=5000
FRONTEND_URL=http://localhost:3000
FRONTEND_URLS=http://localhost:3000
PUBLIC_API_URL=/api
```

Leave actual MongoDB, SMTP, Stripe test and PayPal sandbox credentials unchanged. Keep the real database name in the connection URI. Use `http://localhost:3000` consistently during the desktop tests, rather than alternating between localhost and 127.0.0.1 as browser origins.

`REQUIRE_ADMIN_MFA` and `REQUIRE_EMAIL_VERIFICATION` are no longer configuration controls. Remove these rows if present. Setting them to true cannot re-enable these features in V60.10. Password-reset email codes are deliberately retained; they are not login MFA or account email verification.

**Do not copy local NODE_ENV=development to public Hostinger deployment.** A local PowerShell environment variable can override an env-file value. Restart both dev servers after changing environment files. Inspect only nonsecret settings when troubleshooting.

## 3. Verification commands — run one at a time

From the project root:

```powershell
npm run install:all
npm --prefix backend run preflight
npm run verify
npm run payments:check
npm --prefix backend run mail:verify
```

Stop on any failed command and retain its complete error output. Do not deploy while `verify` is failing. It must complete the backend/reliability tests, image/certificate smoke checks, TypeScript, Next production build, source checks and dependency audits. No V60.10 migration is required. Keep the existing notification/index migrations already applied in V60.7–V60.9; do not rerun seed commands on your populated database.

`payments:check` without `--remote` checks configuration only. `mail:verify` tests the SMTP connection/authentication from the machine running that command, not Hostinger's environment or actual inbox delivery.

## 4. Start the two local applications

Terminal 1, project root:

```powershell
npm run dev:backend
```

Wait for MongoDB connection and `Singh Academy V60.10.0 API listening on port 5000`.

Terminal 2, same project root:

```powershell
npm run dev:frontend
```

Check these addresses:

```text
http://127.0.0.1:5000/api/health
http://localhost:3000/api/health
http://localhost:3000/api/app-build
```

The first two should return `version: "60.10.0"`. `app-build` must return `frontendVersion: "60.10.0"` and `pageAccess: "public-landing-protected-pages-v6010"`. A proxied health response alone does not prove the frontend code was updated; inspect app-build as well.

Terminal 3, same root:

```powershell
npm run deploy:check -- --local --front http://localhost:3000 --api http://127.0.0.1:5000
```

Target: **0 failed checks**. The check now also verifies public landing summaries and reports their course/team/review counts. Anonymous `/api/content/team` and `/api/courses` must return 401; they are protected. The public root must load and `/about` must redirect to `/login?next=%2Fabout`.

If port 5000 works but port 3000 API does not, check the nonsecret API_PROXY_TARGET in `frontend/.env.local` and restart the frontend. If port 5000 does not work, inspect the backend terminal first; changing the UI cannot repair a stopped database/API.

## 5. Browser acceptance checklist

### Public landing and destination login
- Open `/` in a signed-out/private browser: original landing content remains visible, not the login screen.
- Click About, Team, Courses, Academy Plans or another internal landing CTA: sign-in is required and `next` contains the intended destination.
- Paste `/about` directly while signed out: sign-in is required.
- Complete login: the requested page opens. Registering through the login page also preserves the destination.
- Logo/home, login, registration, password recovery, Terms/Privacy, valid certificate verification and external mail/social links are intentional exceptions. The menu toggle must still open on mobile.
- Signed-in visitors can still view `/`; root does not forcibly redirect to `/home`.

### Session and loading
- In your existing browser (do not clear old cookies first), login → navigate → logout → Back → refresh. The old account must not reappear.
- Open a second tab and verify explicit logout propagates; authenticating requires credentials again.
- Simulate an offline connection after signing in. Loaded data must not be replaced with fake empty records or an automatic logout.
- Restore the network and retry. A protected-page session check that cannot reach the API goes to `/connection`, not a fabricated anonymous session. This route has bounded recovery and preserves the return query/order reference.
- Check courses/team and existing media after sign-in. A genuinely deleted/missing media file still needs correction in the CMS.

### Calendar membership counter
- Display uses the **UTC calendar dates already shown in My Billing**.
- For a 365-day active term starting Oct 3 UTC, the count becomes 364 after the Oct 4 UTC date boundary, even if fewer than 24 hours passed.
- An open visible billing page updates the display within its 30-second timer/focus refresh; a full reload is unnecessary.
- At midnight of the end date the display may show 0 and **Access ends today**. Access is still governed by the full original expiry timestamp, not this visual counter.
- Scheduled, cancelled, expired and past-due terms retain their explicit states. Never edit paid dates in MongoDB to make a UI test pass. Local timezone dates may differ from the clearly labelled UTC billing basis.

### Mobile Stripe/PayPal checkout
Use test/sandbox credentials only. Do not use real payment details for testing.

- Tap the same payment button rapidly: the UI permits one in-flight request.
- On the provider page, use browser Back: the Academy payment controls must not remain permanently busy. Retrying the same checkout reuses its request key.
- If a network error occurs after submitting, inspect My Billing/provider status before making a new purchase. A timeout is not proof the payment failed.
- Approve a sandbox payment and return: the page confirms the existing order (does not create another purchase), then stops polling when paid.
- Cancel PayPal/Stripe: the cancelled return reads status without requesting a fresh capture.
- Verify the correct student's invoice, receipt and individual-course/membership access; verify another student's records remain separate.
- Check webhook delivery on your actual HTTPS sandbox deployment. Local return flows alone do not prove public webhook delivery.

### Email and certificate
- Confirm actual welcome/purchase mail reaches the test student's inbox. SMTP acceptance alone is not delivery proof.
- For sandbox purchase mail, enable SEND_SANDBOX_EMAILS and put the **test student's exact recipient address** in SANDBOX_EMAIL_ALLOWLIST. Sender SMTP_USER/EMAIL_FROM are separate. Real production must have SEND_SANDBOX_EMAILS=false.
- Complete a short course, approve it from Client Admin and confirm the already-open student screen picks up the issued certificate.
- Download the newly issued PDF; student/course/dates/number must be correct. The V60.9 certificate renderer and artwork are unchanged; old stored PDFs are not silently rewritten.

### Admin login and security
- Both administrators use their assigned portal email/password, with no authenticator setup/code prompt.
- Legacy accounts with `mfaEnabled` or old setup-only sessions must not get stuck.
- Authenticator settings are removed. Password changes, current-password confirmation and session/device revocation remain available.
- Password-only access is less resistant to a stolen password than MFA. Keep strong unique staff passwords; do not weaken role/session/CSRF checks.

## 6. Hostinger update — only after the above checks pass

Update the SAME connected Git repository with the new source and validated lockfiles. Keep `.env*` credentials ignored. Review `git status` before committing. Redeploy existing backend first, then existing frontend; creating a new app is not required.

Frontend Hostinger variables during temporary-domain testing:

```env
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=https://navajowhite-lobster-767933.hostingersite.com
```

Backend Hostinger origin settings:

```env
NODE_ENV=production
DEPLOYMENT_STAGE=review
FRONTEND_URL=https://mediumspringgreen-cod-301282.hostingersite.com
FRONTEND_URLS=https://mediumspringgreen-cod-301282.hostingersite.com
PUBLIC_API_URL=/api
PAYMENT_WEBHOOK_BASE_URL=https://navajowhite-lobster-767933.hostingersite.com
```

Keep actual database, session/auth, SMTP and sandbox provider secrets in Hostinger only. The removed MFA/email-verification switches do not need replacements. Do not set the local port blindly on hosted runtime.

Upload scanning is a **different security control** and was not disabled by this patch. Public review with no scanner can explicitly use `UPLOADS_ENABLED=false` to disable ALL new uploads; otherwise configure `UPLOAD_SCAN_REQUIRED=true` plus a real reachable scanner. Do not invent CLAMAV_HOST. For final live production, meet the full existing scan/HTTPS/SMTP/payment requirements.

Purge stale app/API caches through the existing Hostinger controls after redeploy, and ensure `/api/*`, HTML, authenticated responses and Set-Cookie responses are not force-cached by CDN rules. Immutable static assets can stay cached.

Run:

```powershell
npm run deploy:check -- --front https://mediumspringgreen-cod-301282.hostingersite.com --api https://navajowhite-lobster-767933.hostingersite.com
```

Both health versions and frontend app-build must be 60.10.0. Then run signed-in acceptance on desktop and mobile.

Connect `singhacademy.com` / `api.singhacademy.com` only after those tests pass and after confirming the existing email plan/mailboxes are preserved. Switching web domains also requires updating frontend/backend origins, payment return URLs and the correct sandbox/live webhook registration. Existing mailbox deletion warnings must not be blindly accepted.

## 7. If the generic error screen recurs

Record the route/action, timestamp, displayed support reference (if any), browser error and relevant Hostinger frontend Runtime log. The code logs `[SA_PAGE_ERROR]` with the error class/reference. Only detected stale JavaScript chunk failures get one bounded automatic page reload per path per 10 minutes. Other runtime exceptions remain visible rather than being silently hidden.

The user-provided screenshot did not contain an exception stack. This release fixes identified paths and adds recovery/reporting, but does not prove every possible runtime error is eliminated. Never repeat a payment solely because this screen appears.
