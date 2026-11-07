# PAYMENTS-P1-EYE-LOADING-REVIEW-1 — change scope

Base: exactly the uploaded SinghAcademy-V60.15.3-PAYMENTS-P1-COMPLETE(1).zip.
All package versions and dependency locks stay unchanged; this suffix identifies
the patch without a package/dependency migration.

## Modified existing files

- `frontend/components/auth/PasswordField.tsx`: visible eye/eye-off only within the
  existing non-submit visibility button, preserving original layout metrics.
- `scripts/verify-payment-scope.mjs`: require exact approved component before/after
  hash; keep the original baseline; exclude exactly three historical generated files.
- `CURRENT-RELEASE.md`: point to current patch results and pending gates.

## Added source/tests/documentation

- `frontend/test/p1-eye-controls.test.mjs`: 27 component/coverage source tests.
- `frontend/test/p1-loading-investigation.test.mjs`: 18 session/loading contracts.
- `frontend/ui-tests/p1-password-eye.spec.ts`: 16 actual Next/React cases, not yet run here.
- `scripts/measure-loading.mjs`: read-only anonymous loopback timing diagnostic.
- `scripts/test/p1-loading-measurement.test.mjs`: 19 profiler tests.
- `scripts/test/p1-ui-preservation.test.mjs`: 8 preservation-gate tests.
- `docs/p1-eye-ui-exception.json`: exact single-component authorization hashes.
- `docs/p1-eye-release-manifest.json`: original-to-output provenance.
- `START-HERE-P1-EYE-LOADING.md`, `TEST-RESULTS-P1-EYE-LOADING.md`, this file.
- `qa/p1-eye-loading/`: current logs, structured results and labelled static layout evidence.

## Generated state omitted

The original `frontend/.ui-stack.lock` is a stale process ID, not application source.
It is intentionally not shipped. Working-directory node_modules and TypeScript cache
produced during blocked installation/check attempts are also not shipped. No input
source, public image, backend file, package lock or migration script was removed.

## Not changed / not claimed

All 227 backend files, 253 public assets, all CSS/public copy, auth/session/API/loading
runtime and P1 payment logic remain identical. No backend security or timeout change;
no provider IDs/events/credentials modified. No performance improvement claim or
fresh production build/Next browser PASS. Old QA remains historical only.
