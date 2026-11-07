# Singh Academy V60.9 — local acceptance before deployment

This complete source release is based on V60.8. It implements the latest **login-only website pages**, desktop/tablet navigation repair, bounded catalog/image loading, start-at-zero recorded lesson videos, and live owned certificate-status refresh. **The V60.8 certificate renderer and artwork are unchanged.** Read `QA-V60.9.md` before treating any check as passed.

## 1. Keep the correct project and credentials

Stop older local frontend/backend terminals with Ctrl+C. Extract this ZIP once and open the folder containing `package.json`, `backend`, `frontend`, and `scripts` in VS Code. Do not put the whole extracted folder inside another application's `frontend` or `backend` directory.

Back up the existing project/database. Preserve your working private `backend/.env`, stable `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, exact MongoDB database name, and SMTP/provider credentials. Preserve tested frontend/backend `package-lock.json` files: dependency requirements have not changed. The delivered source archive, like the baseline, does not contain installed dependencies or generated lockfiles. Do not copy `.next` or `node_modules` from the old app.

Use Node **22.x**:

```powershell
node -v
```

Never seed/reset an existing database to fix a request timeout. There is **no new V60.9 database migration**. Only if the V60.7 notification migration has not already run on this database, take a backup then run `npm run migrate:v60.7` once.

## 2. Local URLs (do not mix Hostinger URLs into the local API target)

`frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=http://127.0.0.1:5000
```

Edit only these LOCAL values in your existing `backend/.env`, retaining actual credentials:

```env
NODE_ENV=development
DEPLOYMENT_STAGE=development
PORT=5000
FRONTEND_URL=http://localhost:3000
FRONTEND_URLS=http://localhost:3000
```

Open the website consistently using `localhost:3000`, not sometimes `127.0.0.1:3000`; these are different cookie hosts. `API_PROXY_TARGET` can still use 127.0.0.1. Restart terminals after changing environment files. A shell-level variable overrides file values; remove only conflicting local variables when needed.

For a first-ever installation, `npm run setup` creates missing local config. Do not regenerate/rotate existing auth/MFA secrets as a troubleshooting step.

## 3. Install and run the complete release checks

Run commands individually from the project root. Stop at any error:

```powershell
npm run install:all
npm --prefix backend run preflight
npm run verify
npm run payments:check
npm --prefix backend run mail:verify
```

`install:all` uses `npm ci` when a lockfile is present and `npm install` when absent. Review/commit both lockfiles after successful installation. `verify` runs reliability tests, UI-preservation checks, backend tests, installed Sharp/PDF checks, frontend TypeScript, a real Next build, source/import checks and production dependency audits. It must not be bypassed. Full audits including dev tools can additionally be run with:

```powershell
npm --prefix backend audit
npm --prefix frontend audit
```

No `npm audit fix --force`, test skipping, or disabled authentication/security gates to hide errors. SMTP authentication and payment configuration success do not prove real inbox delivery or provider fulfillment.

## 4. Start backend and frontend separately

Terminal 1 (project root):

```powershell
npm run dev:backend
```

Wait for MongoDB connection and the listening message. Check `http://localhost:5000/api/health`; version must be **60.9.0**. Then Terminal 2 (same project root):

```powershell
npm run dev:frontend
```

Check both:

```text
http://localhost:3000/api/health
http://localhost:3000/api/app-build
```

`/api/health` reports the BACKEND version. `/api/app-build` independently reports `frontendVersion: "60.9.0"`. One alone does not prove that both apps were updated.

With both terminals running, use a third terminal:

```powershell
npm run deploy:check -- --local --front http://localhost:3000 --api http://127.0.0.1:5000
```

Expected: **0 failed checks**. Anonymous `/api/courses` and `/api/content/team` now correctly return **401 SESSION_REQUIRED**. This is intentional login protection, not missing data. Signed-in data must be checked in the browser.

## 5. Required signed-in acceptance

### Guest paths and genuine login

Use a fresh private window. Visiting `/`, `/home`, `/about`, `/courses`, `/team`, `/events`, `/academy`, `/reviews`, `/contact`, `/learn/...`, `/billing`, or `/my-course` must lead to the relevant login page with a safe `next` path. No protected page body should be shown first. Sign in with valid credentials to continue.

Intentionally open: login, registration, password recovery/reset, legacy OTP compatibility, Terms, Privacy, and `/certificates/verify/<valid token>`. Student accounts never authenticate the admin portal. Provider webhooks are API callbacks and remain signature-verified rather than redirected to a login form.

Existing API-path-only cookies cannot authorize full page requests under the new policy. A **fresh manual sign-in once after upgrade** issues the correctly scoped HttpOnly `/` session cookie and expires legacy `/api` cookies. This is a migration to the new page gate, not recurring auto-logout. Do not clear records or reset passwords.

### Logout and transient network problems

Using the existing browser as well as a private window: login -> browse -> logout -> Back -> Refresh -> reopen site. Remain logged out until credentials are submitted again. An otherwise valid session should stay signed in when no explicit logout occurred. Check two tabs and a second independent student account. Session outages must not invent a new anonymous account or fabricate successful server logout.

A new document whose valid session cannot be verified during an API outage receives a retryable **503 reconnect page**, not protected HTML. That is deliberate fail-closed behavior. Existing pages retain their last successful content during transient refresh failures.

### Catalog, team images, and changes

Sign in and open Courses and Team. Confirm actual published records appear and images recover without requiring repeated page reloads. Wait for a complete initial image load, navigate away/back, then edit/publish a test record in admin and revisit/focus the student tab. No fake "no content" message should appear for a failed API response.

CMS catalog JSON reuse is account-scoped in the browser; server caching is only raw published CMS records. Successful admin writes invalidate the local worker's catalog cache. Other workers converge within the bounded TTL. Visible lists refresh every 30 seconds and on focus/online; hidden/offline pages pause polling. A changed image file gets a new ID; published image browser reuse is private, at most five minutes. Private assignments/receipt files are never put in the public image-variant cache.

A true missing/deleted file or unreachable external image cannot be reconstructed by caching. Existing fallback imagery is used after a bounded original-image retry. Check invalid uploads/URL records in admin rather than repeatedly refreshing.

### Desktop/tablet/mobile navigation

Set browser zoom to 100% for a reproducible baseline; test CSS viewport widths 375,820,1024,1228,1366,1440,1700. Above900px, the normal navigation links remain visible. At901–1199px they occupy a second row; at 1200px+ they fit in the header. At900px and below the existing mobile toggle remains. Test open/close, Escape, outside click, navigation, long names and Logout. Browser zoom changes CSS viewport size and can legitimately change the layout.

### Free/paid/membership and per-user data

A course explicitly marked free must show Start Course and enroll directly without starting Stripe/PayPal checkout. Paid course and membership verification remain server-side. Use two separate browser profiles: Student A and Student B may enroll in the same course, but progress, answers, payments, invoices and certificates must never cross accounts. Membership access rules from V60.8 are retained; this release does not rewrite billing or enrollment semantics.

### Lesson videos start at zero

Use a recorded YouTube/Vimeo/native video whose saved URL includes a timestamp (`t`, `start`, or `#t`). Open the lesson freshly: playback starts from0, not the shared-link offset. Play 20 seconds, move to another lesson (including a lesson reusing the same URL), return: a newly mounted player starts at 0. Confirm poster/play interaction is still usable and learning progress is not reset.

Live streams and unsupported external social providers may enforce their own playback behavior. Local code cannot guarantee a0-second position in a live broadcast or an external provider's resume feature.

### Certificate appears without manual refresh

Keep the student's completed course/My Courses page open showing Waiting for certificate. In an independent admin session review answers and issue the certificate. While the student tab is visible/online, its pending-status batch checks every 3 seconds; the download action should appear after the next successful response without a document reload. Focus an idle tab to recheck immediately. Network time is additional; this is bounded polling, not an instantaneous server-push promise.

The same check handles Try Again/revocation safely. The renderer, seal, signature and artwork remain V60.8. Already issued PDFs stay immutable. Polling reads status only and never resets the lesson, answer draft or learner progress.

## 6. Optional actual Next.js browser tests

After dependency installation and the complete build pass, run controlled UI tests (requires Playwright Chromium). The UI stack uses only a synthetic loopback API on 5109 and a separate Next dev server on 3108; it does not send mail or charge providers:

```powershell
npm --prefix frontend exec -- playwright install chromium
npm run test:ui
```

`frontend/e2e` is a separate real-HTTP/local-Mongo-replica-set stack and requires `TEST_MONGODB_URI`. GitHub's quality workflow provisions its isolated database and runs both stacks. Do not substitute the live Atlas/customer database for test fixtures.

## 7. Only then update Hostinger

Update the existing connected Git repo contents, preserving `.git` and private local config. Review staged files carefully: no `.env`, secrets, node_modules, .next, customer DB dumps or private test artifacts. Push the new commit, then redeploy existing backend FIRST and frontend SECOND. Do not create duplicate apps.

Frontend staging variables:

```env
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=https://navajowhite-lobster-767933.hostingersite.com
```

Backend staging origins:

```env
FRONTEND_URL=https://mediumspringgreen-cod-301282.hostingersite.com
FRONTEND_URLS=https://mediumspringgreen-cod-301282.hostingersite.com
PAYMENT_WEBHOOK_BASE_URL=https://navajowhite-lobster-767933.hostingersite.com
NODE_ENV=production
DEPLOYMENT_STAGE=review
REQUIRE_ADMIN_MFA=true
```

Retain actual secrets/provider/SMTP settings. A reachable real ClamAV scanner is needed for uploads enabled in production/review. If no scanner is provisioned, the existing documented review-only `UPLOADS_ENABLED=false` profile disables ALL new uploads; do not invent a scanner hostname or use NODE_ENV=development on the public app. Review is sandbox payments only. Before a live launch restore upload-enabled scanning and complete admin MFA, backups and real provider/webhook tests.

Read-only staging check:

```powershell
npm run deploy:check -- --front https://mediumspringgreen-cod-301282.hostingersite.com --api https://navajowhite-lobster-767933.hostingersite.com
```

Both app versions must be 60.9.0, and both sign-in boundaries must work. Then repeat signed-in acceptance on Hostinger (including sandbox invoices/receipt/email and correct webhook deliveries). This source delivery did not update your live apps.

Original-domain cutover is a separate operation after acceptance: `singhacademy.com` frontend, `api.singhacademy.com` backend. Protect the existing Hostinger email plan/mailboxes and DNS records; never approve a deletion warning without backup/migration. Update both origin configurations, API_PROXY_TARGET and provider webhook registrations together after connecting the final domains. Do not reuse sandbox webhook credentials for live mode.
