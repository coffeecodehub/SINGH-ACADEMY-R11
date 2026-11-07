# Singh Academy V60.10 — Actual QA report

## Baseline and scope

Baseline: supplied `SINGH-ACADEMY-V60.9-COMPLETE.zip`. Work was limited to the latest requested landing/login policy, calendar membership display, removal of login MFA/account-verification settings, and targeted reliability of content/settings/session/mobile checkout. Public CSS, certificate renderer and certificate assets are not redesigned.

## Evidence-backed findings

1. V60.9's public-page allowlist omitted `/`, making the previous landing protection incorrect for the clarified scope. Root is now public; navigation and server guards preserve protected destinations. A read-only landing DTO exposes only published summaries, not curriculum, assessment, billing or credentials.
2. The old remaining-day display rounded fractional 24-hour periods upward. The new count uses UTC calendar boundaries consistent with existing billing date labels. Exact access expiry is not recalculated by this display.
3. Legacy database MFA flags and setup-only sessions could require setup even when a UI/env switch was removed. The active login/security/production validation flow no longer requires or enables MFA; old setup endpoints return 410. Correct password/portal/account/session checks are still required.
4. Provider Back/BFCache could restore checkout busy state. Checkout now resets that UI on pageshow, has a synchronous duplicate-click lock, and retains the cryptographic per-checkout idempotency key. A secure random-values fallback covers browsers without randomUUID.
5. The old unavailable page-session response was raw HTTP error content, which is unsuitable during a Next client navigation. The middleware now redirects to a bounded reconnect route without declaring logout or discarding the destination/order query.
6. Malformed historic website settings or incomplete checkout responses could become render exceptions. Boundary shape validation produces existing retry/default states rather than rendering invalid collections.
7. The supplied generic error screenshot alone does NOT establish a unique exception or hosting cause. Stale-chunk one-shot recovery and error references were added; unidentified live issues still require actual Runtime logs.

## Commands actually run here

Environment: Node 22.16.0; global TypeScript parser/transpiler; Chromium at `/usr/bin/chromium`.

| Check | Actual result | Evidence |
|---|---:|---|
| `npm --prefix backend test` | **820 / 820 passed**; 0 failed/cancelled/skipped | `qa/v60.10/backend-tests.log` |
| `npm run test:reliability` with TYPESCRIPT_PATH pointing to installed global TypeScript | **206 / 206 passed**; 0 failed/cancelled/skipped | `qa/v60.10/frontend-tests.log` |
| Actual SiteHeader/CSS Chromium fixtures | **144 / 144 passed** | `qa/v60.10/header.log`, `header-browser/header-layout-results.json` |
| Source syntax + local imports | **117 TS/TSX**, **170 JS**, **289 local imports**; **0 errors** | `qa/v60.10/source-check.log` |
| Protected UI + original CSS prefix | **284 files**, **0 unexpected differences** | `qa/v60.10/protected-ui.log` |
| Certificate renderer/assets | Byte-identical to baseline | `qa/v60.10/certificate-preservation.json` |

Scope: backend tests include model/provider stubs and unit/handler fixtures. Frontend tests execute transpiled functions/hooks and controlled HTTP proxy tests, not a complete React/Next app. Chromium renders the actual header markup/styles under controlled fixtures (guest/student/admin and viewport cases), not the full site connected to Atlas or Stripe. Tests were updated where the latest user instruction intentionally retired old MFA/root-blocking behavior; corresponding password, role, CSRF, certificate and provider checks remain.

### New regression coverage

- Root stays public while direct About/Courses/Team/Billing access requires a real session.
- Guest landing internal/hash CTAs preserve requested target, team modal CTA requires login, login/legal/external/menu exceptions do not loop.
- Guest landing consumers share a single summary API request; private data is excluded by explicit projection and output whitelists.
- Legacy MFA accounts use password-only login; old setup routes cannot issue a secret; unrelated production gates still reject invalid configuration.
- UTC next-date membership display, scheduled/past-due/cancelled/expired cases, leap-year boundaries; browser/API count parity; exact paid time preserved.
- Duplicate checkout clicks single-flight, retained key after provider Back, timeout releases UI without replay, unsafe redirects rejected.
- Payment return single-flight, paid polling stops, cancelled return read-only, malformed response becomes recoverable error.
- Compact auth unavailable read is not immediately retried in a tight loop; explicit logout fences compact rechecks.
- Only known stale chunk-load exceptions trigger bounded reload; blocked browser storage cannot create a reload loop.

## Checks NOT completed here

`npm run verify` was invoked and **did not complete**. It correctly stopped because this supplied source archive has no backend/frontend package-lock.json. Registry access probe failed with `Could not resolve host: registry.npmjs.org`. Logs are `qa/v60.10/full-verify-boundary.log` and `npm-registry-boundary.log`.

Therefore no claim is made of a fresh dependency installation, full dependency-backed TypeScript check, full `next build`, current npm audit, full signed-in browser/Hostinger acceptance, MongoDB transaction integration, actual provider capture/webhook or actual inbox delivery for V60.10. Previous-version successful builds/audits are not substituted for a current run. Run the unmodified full verification gates in your networked development environment with valid lockfiles, then do the guide's manual checks.

## Intentional limitations and retained behavior

- The membership visual follows **UTC**, not arbitrary browser-local dates. Its label is explicit. It never changes authorization or subtracts paid hours.
- Removing MFA means password-only staff login; this lowers protection against a compromised password by the user's request. Staff must retain strong unique passwords and correct portal access.
- Account email-verification is removed, but password-reset email codes and actual payment/webhook verification remain.
- Public landing can show approved summaries/photos. Full destination pages and private learning/billing remain protected. Auth/legal/verification and external links are explicit exceptions.
- Upload malware scanning is not removed. Hosted review may disable all new uploads explicitly; production upload requirements are otherwise unchanged.
- Existing issued PDFs stay immutable. Certificate theme assets are preserved byte-for-byte.
- Performance measures reduce duplicate work/background contention and improve recovery. This is not a latency guarantee, penetration test certificate or a proof of zero future errors.

## Packaging

Release package version: 60.10.0. No new dependencies, schema changes, seed/reset or database migration were added. Source config examples contain placeholders, not actual credentials. Generated caches/node_modules are excluded. A separate packaging-integrity JSON records the archive test and exact source-byte comparison after ZIP creation.
