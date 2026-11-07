# Singh Academy V60.9 — actual QA and verification boundaries

## Basis and scope

Baseline: the supplied `SINGH-ACADEMY-V60.8-COMPLETE.zip`. Latest user requirements: protect content pages before login, restore visible desktop navigation, improve course/team data and image reliability, reset newly opened recorded video playback to 0, and expose admin-issued certificates without manual page refresh. Work was performed on the source package; **no Hostinger app, live database, DNS, mailbox or provider account was changed**.

## Executed checks

| Check | Actual result | Evidence |
|---|---:|---|
| Backend exported functions/handlers with explicit dependency stubs and existing unit tests | **790 passed, 0 failed, 0 skipped** | `qa/v60.9/logs/backend-tests.txt` |
| Frontend API/auth/policy/media/hooks/status-feed reliability and loopback diagnostic-CLI tests | **140 passed, 0 failed, 0 skipped** | `qa/v60.9/logs/frontend-reliability.txt` |
| Actual SiteHeader markup + stylesheet in Chromium layout fixtures | **144 passed, 0 failed** | `qa/v60.9/header-browser/header-layout-results.json` |
| Source syntax/local imports | **112 TS/TSX parsed;167 JS checked;281 relative imports;0 errors** | `qa/v60.9/logs/source-check.txt` |
| Strict TypeScript of the three dependency-free new policy/image-source/completion-feed modules | **PASS** | `qa/v60.9/logs/pure-module-typecheck.txt` (empty error output; exit0) |
| V60.8 protected files and entire original stylesheet prefix | **284 files +61,169-byte CSS prefix;0 differences** | `qa/v60.9/logs/ui-preservation.txt`, hash manifests |
| Historical asset preservation check with explicit approved layout exception | **251 files; 0 unexpected differences** | `qa/v60.9/logs/historic-ui-preservation.txt` |
| Current certificate PDF generator | **PASS**: one page, actual dynamic text, sample serial/marker and verification link | `qa/v60.9/certificates/checks.json`, rendered PNG/PDF |

Execution environment: Node 22.16.0, npm 10.9.2; available TypeScript 5.8.3 for source/harness/isolated-module checks; Chromium 144.0.7559.96 through Python Playwright for layout fixtures. The package's actual dependency-backed TypeScript version is determined by its existing frontend requirements/lockfile and must be tested locally/CI.

The test counts are **not** hundreds of independent end-to-end production journeys. Backend tests use explicit model/provider stubs in relevant cases. Frontend hook/component harnesses execute actual source callbacks with controlled browser globals. Layout fixtures render the actual header JSX into HTML with controlled users/menu state; they do not run a full React/Next server or real customer account. Loopback CLI tests exercise the deployment-check script against controlled HTTP responses, not the user's hosting.

## What was found and changed

### Pages/login

V60.8 content routes such as About were intentionally public, not failed authentication. V60.9 implements the newly requested private-page policy. Middleware verifies the real same-portal backend session before protected document rendering; a cookie name alone is insufficient. Browser-provided session-bootstrap headers are stripped. The safe verified snapshot avoids a duplicate initial client session read. Root-scoped HttpOnly cookies permit the document gate to see valid sessions; old API-path cookies are expired after a fresh explicit sign-in. Logout fences, duplicate-token revocation and stale-response protection remain.

Content/courses/reviews API routers now require login too. Explicit public exceptions are auth/register/recovery, Terms/Privacy, signed certificate verification and required provider callbacks. Private page failure is503/reconnect if the session service is unavailable, never a fabricated anonymous success or protected document.

Tests include guest direct paths, forged/revoked/role-mismatched cookies, logout fences, unavailable service, spoofed snapshot headers, compact session reads, proper cookie scope and unchanged per-user restrictions. Course access is checked before creating an assessment attempt.

### Navbar

The V60.8 901–1399px hamburger breakpoint was too broad for the user's laptop expectation. An appended, scoped correction keeps links visible above 900px;901–1199px uses a second row and constrained desktops use tighter spacing. The original <=900px mobile menu is retained. Browser zoom changes CSS viewport width; different zoom levels legitimately choose different responsive layouts.

144 Chromium fixtures cover 24 widths 320–1920px ×3 account/name states ×open/closed, with overflow, control clipping, item/link overlap and visibility checks. Screenshots are clearly labelled layout-only fixtures.

### Loading/images

Browser catalog reuse is keyed by portal/account epoch/logout marker. Only raw published CMS data has a small bounded server cache (default 10s), with in-flight coalescing, error-not-cached behavior and successful-write invalidation. Records are normalized to the requesting portal after reuse. Sessions, memberships, progress, invoices and certificate status are never shared-cached. Lists keep known content during transient errors, including a known empty list without repeated loading flicker. Visible/online refresh is30s plus relevant focus/invalidation events.

A one-off delayed authenticated catalog warmup is limited to Courses and Team and skipped on Save-Data/2G. It is not an endless background keepalive or a substitute for operational hosting capacity.

Published CMS images can use bounded WebP downsize derivatives after visibility proof; only two transforms run at once, with original-image fallback when busy/unavailable. The in-memory variant cache is bounded 24MB/80entries and accepts only named widths. Private receipts/assignments never use it. The component tries the original source after a variant failure, then one bounded retry and existing placeholder; it does not loop endlessly or modify external signed query strings. Initial visible course/team images receive priority; lower images remain lazy.

Tests cover cache memory/TTL/races, coalescing 12 reads into one loader, failed fetch preservation, hidden/offline pause, private-file exclusion, HEAD/ETag behavior, original-image fallback, and account fences. **Installed Sharp transformations were not re-executed here because dependencies are unavailable.** A genuinely missing remote/GridFS file still requires content repair.

### Video

The old resolver retained timestamp parameters from shared links. Recorded YouTube/Vimeo/direct-video URLs now begin at 0 where controlled; Vimeo unlisted authorization is retained and signed direct query strings are not arbitrarily rewritten. Player instances are keyed by lesson and block so reusing a URL in another lesson does not retain old playback state. Native metadata callback sets currentTime0. Poster interaction is retained; completion/progress is not reset by playback reset.

Tests execute the real resolver/component callback with controlled media objects. Real external player playback, especially live streams or provider-managed resume, must still be checked in a browser; the application cannot force a live broadcast to have a0-second recorded start.

### Certificate status

A read-only student-only batch endpoint filters every request by the actual authenticated user plus bounded validated completion IDs. It exposes status/display fields, not PDF storage or verification secrets. A per-account foreground feed batches all visible cards, checks pending records every 3s and other records every 15s, backs off on errors, and pauses when hidden/offline. Same-browser invalidation messages contain no learner data. My Courses/Certificates also refresh their lists to discover new completion records without blanking known content.

Tests cover pending-to-issued update, per-user isolation, malformed IDs, batch limits, stale/unmounted responses, no duplicate flight, hidden/offline pause and retained error state. Polling changes status only; it cannot grant payment access, rewrite progress or issue certificates. Expected visible update is **next successful poll plus network latency**, not an instantaneous push guarantee.

## Preserved

- V60.8 certificate renderer, PDF writer, approved artwork/seal/signature/font metrics and sample generator are byte-identical. Newly rendered sample was opened and checked; old issued PDFs remain immutable.
- Original stylesheet bytes are an exact prefix; only requested navbar/loading rules are appended.
- Published assets and unrelated design files remain identical (284 protected-file check).
- Payment verification, idempotent fulfillment, invoice ownership, subscription terms, email outbox and student progress/assessment isolation are retained. There is no new DB migration or seed/reset.

## Not executed / not certified

The source baseline has no generated dependency lockfiles or node_modules. Registry DNS is unavailable in this execution environment (`registry.npmjs.org` could not resolve). The actual `npm run verify` attempt correctly stopped at its missing-lockfile gate. This gate was **not removed**.

Therefore the following are **NOT claimed as passed**: fresh install/npm ci; full dependency-backed frontend TypeScript; Next.js production build; current backend/frontend npm audit; installed Sharp image smoke; real HTTP/Mongo replica-set integration; full Next/React Playwright UI/e2e stacks; deployed Hostinger session behavior; real Stripe/PayPal delivery; inbox SMTP delivery; production load testing/latency, backup/restore or penetration testing. Logs documenting the blocked verify/network attempt are included. Old historical QA reports are not current release evidence.

Full networked UI/integration tests and the CI workflow were updated to reflect the new page gate: they now acquire a real isolated test session or use an explicitly synthetic loopback session API instead of assuming browser request interception can authorize server-rendered pages. These stacks must execute successfully locally/CI before release.

Use `START-HERE-V60.9.md` for exact commands. Both independent frontend build and backend health versions must be 60.9.0 after redeployment. Anonymous protected catalog401 is now the expected smoke-test result. Signed-in acceptance is still mandatory.
