# Singh Academy V60.14.0 — exact change scope

Baseline: `Singh-Academy-V60.13.3.zip`. No baseline files removed.
All 13 existing CSS files and original image assets are unchanged. New admin
category checkboxes and the return-page method-selection link reuse existing styles.

The machine-readable old/new SHA-256 comparison is in
`qa/v60.14/change-manifest.json`. Full test coverage and execution limitations are
in `SINGH-ACADEMY-V60.14-QA-REPORT.md`.

## Modified existing files

| File | Purpose |
| --- | --- |
| `.github/workflows/quality.yml` | CI action helpers/OS, actual MongoDB data-filesystem capacity check; keep both Node families and tests. |
| `README.md` | Current release/QA guide entry point. |
| `backend/integration/v48-learning-review.test.js` | No review-checkbox gate; retain wrong-password/stale-attempt negative cases. |
| `backend/integration/v48-role-http.test.js` | Current no-MFA real login/portal security and multi-category CRUD assertions. |
| `backend/package.json` | Version metadata only. |
| `backend/src/app.js` | Health version label only. |
| `backend/src/models/CheckoutOrder.js` | Private release/capture operation lease and replacement identity fields. |
| `backend/src/models/TeamMember.js` | Validated multiple categories with legacy primary-category compatibility. |
| `backend/src/routes/adminRoutes.js` | Multiple-category serialization and deterministic team sort. |
| `backend/src/routes/contentRoutes.js` | Membership filters/sort for team categories. |
| `backend/src/routes/paymentRoutes.js` | Authenticated student-only release endpoint with existing write security. |
| `backend/src/server.js` | Startup version label only. |
| `backend/src/services/landingContent.js` | Whitelisted public multiple-category metadata and sort. |
| `backend/src/services/onlineCheckout.js` | Owned release protocol, durable capture exclusion, shared operation claim and replacement key. |
| `backend/src/services/paymentProviders.js` | Verified Stripe expiration and PayPal pre-capture closure inspection. |
| `backend/src/utils/cmsValidation.js` | At-least-one canonical category array; legacy write compatibility. |
| `backend/test/cms-handlers.test.js` | Controlled test/fixture coverage or loaders for the requested changes; no application-design change. |
| `backend/test/inMemoryModels.js` | Controlled test/fixture coverage or loaders for the requested changes; no application-design change. |
| `backend/test/v48-boundaries.test.js` | Controlled test/fixture coverage or loaders for the requested changes; no application-design change. |
| `backend/test/v60-10-policy.test.js` | Controlled test/fixture coverage or loaders for the requested changes; no application-design change. |
| `dev/test-mongo-compose.yml` | Isolated test tmpfs 512m → 2g; no Atlas/production database change. |
| `frontend/app/checkout/page.tsx` | Existing method buttons allow verified provider reselection. |
| `frontend/app/checkout/return/page.tsx` | Return to same purchase to choose method; retain cancellation lineage until safe replacement. |
| `frontend/app/page.tsx` | Only Team track image loading/sizes properties. |
| `frontend/app/team/page.tsx` | Existing tabs filter by every selected category. |
| `frontend/components/business/BusinessPortal.tsx` | Existing release label only; no business/permission changes. |
| `frontend/components/cms/ContentCollection.tsx` | Existing Team category field becomes four checkboxes; other form/design unchanged. |
| `frontend/e2e/public-portals.spec.ts` | Exact public landing exception, protected full Team and other routes. |
| `frontend/lib/checkoutSafety.ts` | Retain release-request state without storing payment evidence. |
| `frontend/lib/imageSources.ts` | Actual animated Team card responsive sizes. |
| `frontend/package.json` | Version metadata only. |
| `frontend/test/v60-10-reliability.test.mjs` | Controlled test/fixture coverage or loaders for the requested changes; no application-design change. |
| `frontend/test/v60-12-fixture-api.test.mjs` | Controlled test/fixture coverage or loaders for the requested changes; no application-design change. |
| `frontend/test/v60-12-workflows.test.mjs` | Controlled test/fixture coverage or loaders for the requested changes; no application-design change. |
| `frontend/test/v60-13-2-player-gate.test.mjs` | Controlled test/fixture coverage or loaders for the requested changes; no application-design change. |
| `frontend/ui-tests/payments-v60-12.spec.ts` | Controlled test/fixture coverage or loaders for the requested changes; no application-design change. |
| `package.json` | Version metadata only. |
| `scripts/ui-fixture-api.mjs` | Synthetic provider-release/replay/late-capture fixtures only. |

## New source and documentation

- `SINGH-ACADEMY-V60.14-LOCAL-GUIDE.md`
- `SINGH-ACADEMY-V60.14-QA-REPORT.md`
- `backend/integration/v60-14-payment-switch.test.js`
- `backend/src/utils/teamCategories.js`
- `backend/test/v60-14-switch-team.test.js`
- `frontend/lib/teamCategories.ts`
- `frontend/test/v60-14-team.test.mjs`
- `frontend/ui-tests/team-multi-v60-14.spec.ts`

## Preserved surfaces
Production session/authentication implementation, existing video player, all
stylesheet files, original photo files/cropping, footer, certificate master
artwork/renderer, assessment/progress handlers and mail delivery services are
unchanged. No dependency declarations, overrides or accepted runtime families
changed. Team categories never alter User roles.

## QA evidence
`qa/v60.14/` contains final successful executable-unit/control/syntax reports,
workflow parse validation, the dependency-install failure evidence and source
hashes. These are not represented as a full Next/Mongo/provider/Hostinger PASS.
Historical baseline QA artifacts remain under their original version names.
