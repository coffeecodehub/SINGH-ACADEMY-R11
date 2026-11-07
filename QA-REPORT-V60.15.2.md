# Singh Academy V60.15.2 — QA report

## Scope and verdict

This is a targeted source candidate correcting the retired-resource HTTP response and
the standalone startup warning in the separate DB-backed browser test runner. It is NOT
a new blanket security audit or authorization to switch to live payment keys.

The supplied V60.15.1 logs showed: 12 real model contracts pass, 77 MongoDB backend
integration tests pass, and a separate Next browser suite with 37 pass / 1 fail.
The failing `/free-resources` document returned 200 instead of the test's required 404.
The same log showed a `next start`/`output: standalone` startup warning.
The user's V60.15.1 reports also showed four completed advisory scans at zero; those
results belong to that run and those lockfile hashes, not a fresh V60.15.2 audit.

## Source finding — correction to the earlier interpretation

Both old `page.tsx` files already consisted of `notFound()` calls. A build route entry
therefore did not prove that old demo content was restored. The async RootLayout,
root loading boundary and child Suspense allow streaming; Next documents that a
not-found result after streaming begins can retain status 200. This is consistent
with the failure. The old Next trace body was not provided and the exact old framework
response could not be re-executed in this environment.

The correction does not depend on changing timing: both stubs are replaced by terminal
Route Handlers for their own roots/subpaths. They return a native status-404 Response
(GET and HEAD) without rendering RootLayout or its loading state. Middleware and page
access policy are unchanged, so guest page protection still runs first. There is no
resource content, script, user/query interpolation, new API, or weakened financial assertion.
A fixed noindex/no-store response retains the old status-page wording and appearance.

The DB-backed test stack starts `.next/standalone/server.js` rather than `next start`.
Its preparation function verifies a build exists and copies public/static assets into
only the generated output. It fails instead of silently falling back to the wrong runner.
The general frontend package start script, Hostinger settings and Dockerfile are unchanged.

## Executed in this authoring environment

| Check | Result | Evidence |
|---|---:|---|
| Backend unit/controlled source tests | 967 pass, 0 fail | backend-tests.log |
| Controlled frontend/source/HTTP-helper checks | 516 pass, 0 fail | frontend-controlled.log |
| Runtime/security/launcher tooling tests | 134 pass, 0 fail | runtime-tests.log |
| Protected-file checker | 284 checked; 0 unexpected differences | protected-ui.log |
| TypeScript syntax and relative-import/source parsing | 0 errors | source-check.log |
| New targeted helper/launcher checks (included in totals above) | 17 pass | targeted-tests.log |
| Native Chromium in-memory status-page layout comparison | 4 widths pass | native-404-layout.json |
| Source/dependency preservation | verified | source-scope.json |

Runtime: Node 22.16.0, npm 10.9.2; controlled TS harness used the available TypeScript
5.8.3 installation. This syntax/harness use is not the application's pinned full typecheck.
The HTTP helper checks run the actual response functions through Node HTTP/fetch; they
use manual path dispatch and are NOT Next route/middleware tests. The Chromium layout
comparison uses in-memory documents with the actual old CSS/new response markup, not
an application server or authenticated session.

## Not executed / blocked

- Fresh actual Next production build and application dependency typecheck: project dependencies unavailable.
- Fresh complete npm advisory audit and installed native Sharp execution: registry access failed
  with `EAI_AGAIN registry.npmjs.org` (registry-availability.log).
- Actual Mongoose contracts and Docker MongoDB suite: dependencies absent; Docker executable unavailable.
- Updated complete Next fixture/browser suites: not run. A separate native loopback navigation
  attempt also failed with `ERR_BLOCKED_BY_ADMINISTRATOR`; its error is retained, not hidden.
- Actual Hostinger, external provider checkout/webhooks, email inbox and live-money acceptance: not run.

No test was skipped or changed to accept 200. Old tests are preserved; new coverage is
required in the user's environment and CI. Node policy, package versions of dependencies,
MongoDB tmpfs sizing, existing security gates and security thresholds were not changed.

## Declared full-suite targets — NOT claimed executed here

| Stage | Count |
|---|---:|
| Actual Mongoose schema contracts | 12 |
| Real MongoDB backend integration | 77 |
| Local-release Next fixture browser suite | 75 (71 original + 4) |
| Separate DB-backed Next browser suite | 46 (38 original + 8) |

The eight new DB-backed cases create one real read-only learner once, then use its
cookies in otherwise separate browser contexts. This preserves the real eight/hour
registration limit alongside the seven existing registrations; no rate limit is bypassed.
Guest/invalid-session cases deliberately do not receive that learner cookie.

## Preserved scope

13 existing CSS files and 268 original public/backend asset-directory files
are byte-identical. All backend production code is identical apart from two version labels.
Middleware, page-session policy, live payment/refund/access, retired MFA behavior, private
ownership controls, root landing, Team/photo/video/certificate implementations are preserved.
Only the two old retired-page stubs are deleted; replacement 404 handler files are included.
Old current-named QA reports are archived under `qa/history-v60.15.1-packaged`; new
current-name reports deliberately start at `not_run` so they cannot be mistaken for new PASS.

## Required before staging / live

Run `npm run verify:release` then `npm run verify:integration` to completion on the new
folder with preserved reviewed locks/private config. Both final reports must pass with
version 60.15.2 and fresh timestamps. Verify same commit/locks in Node 22/24 CI. Retain
V60.15 staging read-only index and historical-access audits, then hosted sandbox, webhook,
invoice/access, inbox and trusted-edge acceptance. No 100% security or live approval is asserted.

## Official reference behavior reviewed

- Next not-found streamed response behavior: `https://nextjs.org/docs/app/api-reference/file-conventions/not-found`
- Route handlers bypass layouts: `https://nextjs.org/docs/15/app/getting-started/route-handlers-and-middleware`
- Standalone server and public/static preparation: `https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output`

See the separate source evidence for exact old/new lines. Final archive integrity and
fresh-extract results are recorded in the separate QA evidence ZIP.
