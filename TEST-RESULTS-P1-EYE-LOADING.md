# PAYMENTS-P1 eye icons / loading investigation — actual results

Recorded: 2026-10-16T08:11:51.586868+00:00. Base version: **60.15.3**. Patch: **PAYMENTS-P1-EYE-LOADING-REVIEW-1**.

**Result: updated source candidate, not production-approved. Loading is NOT declared fixed.**

## Executed after the edit

| Check | Actual result | Boundary |
|---|---|---|
| Backend suite | **1,085 passed, 0 failed, 0 skipped**, exit 0 | Handler/unit fixtures; not real MongoDB/provider acceptance |
| P1 payment regressions | **50 passed**, exit 0 | Already part of the 1,085; do not add twice |
| Frontend reliability | **561 passed, 0 failed, 0 skipped**, exit 0 | 516 existing + 27 password + 18 loading contracts; hook/module doubles |
| Runtime/tooling | **165 passed, 0 failed, 0 skipped**, exit 0 | 138 existing + 19 profiler + 8 preservation tests |
| Syntax/local imports | **0 errors** | 136 TS/TSX, 205 backend JS, 333 local imports; NOT full typecheck |
| Original UI baseline | **448 checked: 447 identical + 1 exact authorized component change** | Three generated files excluded; original manifest unchanged |
| Chromium static layout | **6 comparisons passed** | 390/820/1440 px × masked/shown; identical form/input/button metrics and zero pixel differences outside the existing button |
| Runtime policy | **Passed**, Node 22.16.0 | Same package versions; not deployment runtime proof |

Frontend source tests/parser used the available **TypeScript 5.8.3**, via the
existing TYPESCRIPT_PATH override. The project lock remains at **5.9.3**;
no dependency declaration/lock was changed to make tests pass.
The static Chromium test uses actual component hook-fixture markup and the exact
original project CSS, **not actual React hydration or a Next page**. Native button
click/Space/Enter caused zero form submissions in this fixture. Actual component
callbacks, independent fields, initial masking and form attributes are covered by
27 source-level tests. Sixteen actual Next/React acceptance cases were added but
could not execute here.

## Failed/blocked attempts — not converted into PASS

| Attempt | Actual exit/result | Reason |
|---|---|---|
| npm registry | exit 1 | `EAI_AGAIN registry.npmjs.org` |
| Locked backend/frontend offline install | exit 1 each | Required tarballs absent from cache (`ENOTCACHED`) |
| New frontend production build | exit **127** | `next: not found` after dependency install was blocked |
| Full frontend typecheck | exit **2** | Missing React/Next/Playwright packages/types; full diagnostic log retained |
| Actual Next password browser suite | exit **1**, no test execution | Project Playwright/Next not installed |
| Model/HTTP contracts | exit **1**, two test files fail to load | Missing `mongoose` / `express`; zero contract assertions executed |

No complete current dependency audit, real MongoDB integration suite, local
cold/warm Next benchmark, authenticated-session runtime benchmark or full live
handover test is claimed. Your earlier terminal build and LIVE configuration
passes remain **your previous results**, not a fresh build of this edit.

## Scope and preservation

Only one application runtime file changed:
`frontend/components/auth/PasswordField.tsx`.

The existing button retains its class, input/wrapper styles and original text
metrics. An invisible aria-hidden text spacer preserves old Show/Hide widths;
the only visible replacement is an inline current-color eye/eye-off SVG. Existing
accessible Show/Hide labels stay on the non-submit button, with pressed state and
tooltip. There is no new library, CSS asset, remote icon download or password API.

Coverage: student login (one), registration (two), Client Admin login (one),
Super Admin login (one), reset-password (two): **seven existing control instances**.
Forgot-password and OTP pages remain without an eye. Existing business/security
password fields that had no Show/Hide control remain unchanged.

**227 backend files, all 253 public assets, both lockfiles and all three package
manifests are byte-identical to the uploaded ZIP.** The auth middleware/provider,
API client/proxy, session policy, payment services/routes, raw signature handling,
checkout/reversal/idempotency logic, schemas, scanner configuration and timeouts
are unchanged. No provider credentials were requested, and no external payment,
GitHub, Hostinger, DNS or webhook operations were made.

The original `docs/payment-ui-baseline.json` is retained. Its gate now accepts
only the exact before/after hash of the authorized PasswordField edit; it still
fails for a different eye implementation, original unpatched component or any
unauthorized protected source change. The exact historical generated paths
`frontend/.ui-stack.lock`, `frontend/qa/ui-report/index.html` and
`frontend/qa/ui-results.json` no longer decide source preservation. The stale
process lock is omitted from the release. Historical QA reports are retained as
history, not current proof.

## Loading investigation: compilation is not the same as API waiting

1. **Development compilation:** `next dev` compiles requested routes; this project's
   `frontend/package.json` still uses plain `next dev`. A first-request delay cannot
   be called an API delay or a compilation delay from total time alone. No Next
   runtime was available to measure compile time on this edit. Compare the Next
   terminal's compile duration with repeat requests and a separately built
   production `next start`; no framework/bundler/dependency upgrade was made.
2. **Server document session:** `frontend/lib/server/pageSession.ts` verifies a valid
   portal cookie through `/api/auth/session?compact=1` before allowing protected
   content. It retains a **10,000 ms** deadline. Guest entry pages with no valid
   cookie do not make that network call. Controlled tests verify that a delayed
   authenticated result still blocks access and a 503 stays unavailable.
3. **Browser API/session:** `frontend/lib/api.ts` keeps a **12,000 ms** GET timeout.
   The session call has one attempt; other eligible GETs can make two attempts,
   with a **350–550 ms** retry wait when no longer accepted Retry-After applies.
   Thus a failed ordinary GET can spend roughly 24 seconds plus retry/overhead;
   these are code-configured limits, **not measured latency from your website**.
   Payment writes retain their distinct 70-second client / 65-second proxy window
   and are not auto-retried.
4. **Recovery/DB:** AuthProvider preserves reconnect/error state and backoff instead
   of granting access on failure. Backend session resolution checks AuthSession,
   then User, plus an activity update when due. Actual database/network cost was
   not measured. The server-side session fetch is part of document TTFB and will
   not necessarily appear as a separate browser Network request.

On a public login page with an unresolved valid cookie, a failed server check can
be followed by client session checking; the code allows sequential waits. This is
a **possible mechanism**, not the established cause of the reported slowness.
There is no measured before/after speed improvement to claim.

A dependency-free, **loopback-only, anonymous GET** diagnostic was added:
`node scripts/measure-loading.mjs --mode development` (then production separately).
It compares first/repeat document requests, direct backend health/readiness/guest
session/site reads and same-origin proxy reads; it records status, TTFB, body time
and bytes, not response bodies, credentials or cookies. It deliberately reports
`authenticatedSessionLatencyMeasured: false`, `compilationTimeMeasured: false`
and `loadingFixed: false`. An HTTP 200 is not a speed target or deployment gate.
Do not use its guest measurements as signed-in access proof.

Background reference (not evidence for this installation):
https://nextjs.org/docs/app/guides/local-development

## Payments status to retain

User reports: earlier **1,085 backend tests + production build passed**, Stripe and
PayPal LIVE configuration checks passed, and
`CHECKOUT.PAYMENT-APPROVAL.REVERSED` was added to the **existing** PayPal LIVE webhook
and read back successfully. The webhook ID must remain unchanged. These external
facts were not rechecked here, and the completed repair must not be repeated just
because an older guide describes it.

Still pending: actual deployed transaction, authentic signed delivery, correct
student course/membership access, and invoice/receipt verification. No new-checkout
switch, secret, webhook ID or event list was changed. Existing P1 tests and code
remain intact.

## Evidence

Current machine-readable summary: `qa/p1-eye-loading/test-results.json`.
Raw executed logs: `qa/p1-eye-loading/*-final.log`, `*-tests.log`,
`frontend-build-final.log`, `typecheck-attempt.log`, `contracts-attempt.log`,
`next-browser-attempt.log`, installation/registry logs and `source-syntax.log`.
Static browser comparison data/screenshots: `qa/p1-eye-loading/layout/`.
Original-to-release source hashes: `docs/p1-eye-release-manifest.json`.

Older `qa/`, frontend browser reports and old release guides are historical.
Only the new report above describes this patch; it does not grant deployment approval.
