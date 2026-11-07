# Singh Academy V60.7 — verification report and remaining deployment checks

## Scope and baseline

This release was prepared from the supplied `SINGH-ACADEMY-V60.6.1-SECURITY-VERIFY-FIXED-COMPLETE.zip`. It addresses session persistence under temporary API failures, public/private data loading, the frontend-to-backend gateway, and durable signup/course/membership email notifications. It does not redesign the public website or change certificate artwork, approval, download or verification code.

The screenshots demonstrate the visible symptoms, not their complete network cause. The old source confirms that session failures could clear authentication and course/team request failures could be presented as empty content. The actual Hostinger CDN rules, forwarding headers, live database contents and SMTP inbox delivery were not accessible from this execution environment.

## Confirmed source defects and changes

1. **Session failure was treated as logout.** Temporary timeout, 429 and server errors no longer erase an established session. An initial failed session check shows a reconnect state rather than pretending the visitor is anonymous. Real anonymous-session responses, revocations and expiry still require login. Portal generations stop an old request from clearing a newer login. Stable account objects prevent identical focus refreshes from resetting learner drafts.
2. **Content failures were treated as missing content.** Course and Team pages distinguish errors from a successful empty response. Retry is available without repeated full-page refresh. Previously loaded successful content can remain visible during a temporary refresh failure. Genuine missing/unpublished records are not invented or silently seeded.
3. **Public navigation and data fetching created unnecessary work.** Public links no longer require a new authentication check on each click. Successful public metadata requests share short, bounded browser-memory caching; no private account data uses that cache. Landing sections load independently instead of waiting for the slowest request. Membership labels use a small private status endpoint instead of requesting the entire learner library.
4. **Gateway behavior needed explicit session/cache handling.** The dynamic Next Route Handler streams raw request/response data, preserves separate host-only session cookies, forwards only expected headers and disables intermediary caching for API responses. It rejects an invalid/self-referencing API target and upstream redirects. Generic API retries apply only to safe GET requests, not checkout/purchase writes. Existing idempotent payment-confirmation polling remains intact.
5. **Shared proxy traffic could share an authenticated global limiter bucket.** Verified per-portal student identity now scopes the global authenticated limiter. Login-specific and anonymous safeguards remain. This is a code improvement; it is not proof of the actual forwarded-IP configuration at Hostinger, which still must be inspected rather than guessed.
6. **Email timing and coverage were incomplete.** Signup uses a durable per-student welcome outbox. Individual-course and membership confirmations are queued in the provider-verified payment transaction. The worker polls every five seconds when idle, with leases and retry backoff; expiry scans remain separate. Sandbox purchase email requires an explicit exact-recipient allowlist and is labelled as test money. SMTP acceptance is recorded separately from inbox delivery. A worker crash after SMTP acceptance but before database acknowledgement can still cause a retry; absolute exactly-once delivery is not claimed.
7. **Public development-mode deployment was an unsafe workaround.** There is now an explicit upload-disabled production/review profile for environments without a scanner. It blocks all new uploads before parsing; it does not pretend that files were scanned. MFA and SMTP requirements remain. Full upload-enabled review/live deployment still needs real scanner infrastructure. See the update guide for both profiles.

## Checks actually executed in this environment

| Check | Observed result | Scope |
|---|---|---|
| Backend test suite | **727 passed / 727 total**, zero failed, cancelled or skipped | Node test runner, including the project's existing explicit database/provider stubs. Not a real Atlas/provider test. |
| API, session and gateway reliability suite | **31 passed / 31 total**, zero failed, cancelled or skipped | 12 API client tests, 9 deterministic AuthProvider hook-harness tests, 10 gateway tests. The hook harness is not React/Next browser execution. |
| Local HTTP gateway streaming | Passed inside gateway suite | Real local HTTP transport to an emulated upstream, including unchanged raw webhook bytes and separate cookies. Not Hostinger network traffic. |
| Source parsing/import checks | **98 TS/TSX files**, **161 JavaScript files**, **254 relative imports**, **0 errors** | Syntax/local resolution only; not dependency-backed TypeScript checking. |
| Protected-file comparison | **283 protected files checked; 0 differences** | All baseline public assets/CSS plus selected certificate/issuance/download files. This is a hash comparison, not screenshot/pixel-diff browser QA. |
| Dependency comparison | Existing dependency versions, devDependencies, overrides and Node engine requirements unchanged | This does not constitute a fresh vulnerability audit. |

Raw outputs are included in `qa/v60.7/backend-tests.log`, `frontend-reliability-tests.log`, `source-check.log` and `preservation-check.log`. The protected-file baseline and changed-file manifest are also included.

## Checks attempted but blocked / not completed

- **Full `npm run verify`: blocked before dependency-backed stages.** The supplied archive did not contain package-lock.json files. The release script correctly stopped with a missing-lockfile error; it was not modified to hide this. This environment could not reach the package registry to install the pinned dependencies. Consequently **the V60.7 Next production build, real `tsc --noEmit`, dependency-backed Sharp check and fresh npm vulnerability audits were not completed here**. The user's previous V60.6.1 audit/build results must not be described as new V60.7 results. See `qa/v60.7/full-verify-attempt.log`.
- **Chromium browser acceptance: blocked before the first page.** The available managed Chromium returned `net::ERR_BLOCKED_BY_ADMINISTRATOR` for the localhost fixture. Zero browser passes are claimed. See `qa/v60.7/gateway-browser-results.json`. The fixture is retained for a normal test environment; the browser policy was not bypassed.
- **Full Next Playwright acceptance:** four additional failure/recovery test cases are supplied in `frontend/e2e/reliability.spec.ts`; these were **not run here**. The existing GitHub browser workflow remains enabled and must pass on the installed dependency tree.
- **Live Hostinger diagnostics:** the frontend/backend hosts could not be inspected from this execution environment. That does not establish that the user's site is down. Use the included `deploy:check` command on the user's machine and inspect runtime logs on Hostinger.
- **MongoDB, SMTP, Stripe and PayPal:** no live database writes, real charges, external emails, credential changes or provider webhook changes were performed. Actual signup, sandbox checkout, webhook receipt and inbox delivery remain deployment acceptance items.

## Required release gate on the user's network

Preserve the existing private env files, stable auth/MFA secrets and tested lockfiles. From the project root with Node 22.x:

```powershell
npm run install:all
npm --prefix backend run preflight
npm run migrate:v60.7
npm run verify
npm run payments:check
npm --prefix backend audit
npm --prefix frontend audit
```

Review and commit generated/updated lockfiles. `verify` still runs the old and new tests, protected-file check, image/PDF scripts, dependency-backed TypeScript check, real Next production build, source checks and high-severity production dependency audits. Do not disable failing gates or use `--force` to conceal them.

Update the **existing** backend and frontend apps using `HOSTINGER-V60.7-UPDATE.md`, then run:

```powershell
npm run deploy:check -- --front https://mediumspringgreen-cod-301282.hostingersite.com --api https://navajowhite-lobster-767933.hostingersite.com
```

Complete signed-in browser acceptance with two separate student accounts, interrupted-network recovery, draft persistence, genuine logout, individual-course/membership sandbox purchases, receipts, webhook deliveries and an allowlisted inbox confirmation. Do not change domain/email hosting, seed the existing database or reset learning records to fix a failed connectivity check.

## Performance and integrity boundaries

No fixed zero-millisecond response time, bug-free guarantee, penetration-test certification, inbox delivery guarantee or full deployment readiness is asserted. These code changes reduce unnecessary requests and prevent temporary infrastructure failures from being misreported as logout/empty content; they cannot replace correct API URLs, healthy infrastructure, actual database records and valid SMTP/provider configuration.

The existing certificate renderer/theme and immutable already-issued PDFs are intentionally unchanged by this reliability release. The UI hash check preserves the approved assets and styles; honest loading/error states and the requested membership-state behavior use the existing styling. All access, progress, assessment, payment and notification data remains bound to the authenticated student.
