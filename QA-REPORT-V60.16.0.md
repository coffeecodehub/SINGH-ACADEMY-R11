# Verification report — Singh Academy 60.16.0

**Historical pre-R2 report.** For the current corrections and final executed
results, read `LOCAL-FIXES-R2.md` and `QA-REPORT-R2.md`. Counts and behavior below
describe the earlier source package.

This report records executed local checks. It is not a promise of universal accuracy, zero future vulnerabilities, a live payment-provider certification, or a public SEO/performance score. Source and deployment instructions are in `HANDOVER-V60.16.0.md`.

## Recorded results

| Check | Recorded result |
| --- | --- |
| Backend unit suite | 1,138 passed; 0 failed/skipped |
| Frontend reliability suite | 601 passed; 0 failed/skipped |
| Runtime and release-tool suite | 178 passed; 0 failed/skipped |
| Real MongoDB/HTTP integration suite | 121 passed; 0 failed/skipped |
| Model and real raw-webhook contracts | 17 passed; 0 failed/skipped |
| Full actual Next/React fixture browser suite | 98 passed; 0 failed/skipped |
| Real database browser suite | 49 passed; 0 failed/skipped, including all three new admin cases |
| New actual admin browser workflows | 3 passed; 0 failed/skipped |
| Local native Chromium modal regression | 4 passed; mobile/desktop, short/long biography, real link hit-testing and close/scroll behavior |
| Four fresh npm dependency audits | Backend production/full and frontend production/full all returned exit 0; 0 info/low/moderate/high/critical findings |
| TypeScript | Passed |
| Production Next build | Passed; final code-gate build includes the latest metadata and CSS changes |
| Source syntax/import check | 0 errors; frontend and backend source parsed and relative imports resolved |
| Original uploaded photographs | All five exact SHA-256 values and original dimensions retained |
| Landing/home/about visual acceptance | Six actual Chromium page captures at 390px/1440px; all 30 photo render checks passed, no horizontal overflow; all five HTTP image responses match the uploaded originals |

The four audit reports are independent scans of two workspaces, not four distinct sets of vulnerabilities. Additional focused tests overlap the broad suites and must not be added again to a unique-test total.

## Final code gate and combined database browser run

The complete `npm run verify` execution finished successfully with exit status 0 on 4 November 2026. It ran the native dependency checks, 17 contract tests, all four fresh audits, 178 runtime/tool tests, 601 frontend reliability tests, 1,138 backend tests, image and certificate checks, TypeScript, the production build and source/import validation. The last check parsed 163 frontend TS/TSX files, checked 232 backend JavaScript files and resolved 403 frontend relative imports with 0 errors.

The final combined real-database browser run passed all 49 cases in 57.9 seconds. The separate 98-case frontend fixture-browser run passed in 2.8 minutes. No cases were skipped or retried in these final runs. After final report/evidence updates, the explicit release snapshot was updated and its read-only checks were rerun before packaging; verification does not regenerate it automatically.

On 5 November 2026, the clean standalone ZIP was extracted independently, both workspaces installed through frozen `npm ci`, and the entire `npm run verify` gate passed again with exit 0: 17 contracts, 178 runtime/tool tests, 601 frontend reliability tests, 1,138 backend tests, all four fresh audits with zero findings, TypeScript, production build and source checks. Historical generated QA outputs were absent before this run. The log is `qa/v60.16.0/evidence/clean-package-verify.log`. Browser/real-database results above remain their separately dated executions; those suites were not rerun for documentation and packaging-only changes.

The new local ZIP helper passed six isolated fixture cases and full-project byte/inventory comparison using checksum-verified portable PowerShell 7.5.4. It preserves existing source/private configuration and original images, handles Unicode and bracketed route paths, and excludes private `.env` files, Git metadata and generated output. Missing input, existing output, private-file inventory entries and linked directories fail safely. Windows PowerShell 5.1 compatibility was reviewed, not executed on native Windows. No paid Atlas account or its credentials were used.

## Behavior exercised

- Required ISO country registration and stored country projection; administrator-only country correction with reauthentication; browser price/country tampering does not set a purchase amount.
- Sections, independent course purchases, later courses in an active section, half-open expiry boundaries, private lesson media and full/partial refund boundaries without cross-section access.
- Administrator-entered month terms and country totals, absence of other-country price maps, raw catalogue cache isolation, both administrator roles and student denial.
- Concurrent single-use coupon claims, reserve/consume/release/retry boundaries, correct first-term discounts and genuine 100% discounted access with no fake provider payment.
- Real Stripe SDK request construction against an explicit synthetic HTTP provider, actual webhook HMAC verification, subscription creation, first discount, undiscounted renewal, duplicate invoice replay, unpaid settlement rejection, cancellation ownership and retained paid access.
- Corrected PayPal capture exclusion after release. PayPal is intentionally not offered as recurring checkout.
- Super-admin draft/public page-section separation, revision concurrency, private-file rejection, original image bytes through Mongo/GridFS, safe content validation and scanner fail-closed behavior.
- Course seed validation for all 82 supplied lessons, atomic rollback, explicit missing-content repair, and preservation of existing edits.
- Actual frontend section discovery, selected-duration totals, recurring consent/provider availability, coupon disclosure, payment retry identity, owner switching, free courses, certificates, authentication, responsive navigation and unsaved-answer exit protection.
- Actual admin section creation/editing, country price entry, course assignment, coupon generation/clipboard/revocation and student country correction.
- Test-runner owned-process cleanup and zombie-lock recovery, without terminating unrelated processes.

## Initial failures and corrections

Initial combined runs identified outdated test fixtures expecting the former one-time-only flow or exact pre-section component placement. Those fixtures were deliberately migrated while retaining payment ownership/idempotency assertions. All 224 original payment-browser assertions remain represented.

The first current-release browser run found two mobile issues: a faculty portrait overlapped its profile link, and the longer registration form required scrolling before measuring password-field geometry. The modal now uses normal image flow and a reachable sticky close control; the eye-control test measures fully visible controls. The subsequent entire 98-case suite passed without retries or skipped cases.

Actual admin browser acceptance also corrected test startup readiness to wait for the real API rather than a login page alone, and used standard role-based selection for wrapped form controls. The three admin flows then passed. Initial failing logs are retained separately from final results.

## Execution environment and evidence

Node 24, locked npm installations and a local MongoDB replica set were used. Database tests create guarded generated databases; they do not target production records. In this managed runtime Mongo needed a supported file-descriptor limit of 16,384 for concurrent suites.

Browser checks used installed Chromium through external test configurations because the browser-download CDN is restricted. These checks are actual browser behavior, but not a claim that the exact browser binary downloaded by Playwright was tested. Standard projects can install their matching Playwright browser normally.

The clean standalone package includes selected final logs, machine-readable summaries, `visual/visual-qa.json` and four audit reports under `qa/v60.16.0/evidence/`. `verification-summary.json` identifies the final broad suites. Full screenshots and historical generated reports are retained in the development workspace and omitted from the clean ZIP. Required test helpers, integrity manifests, original product artwork and all five uploaded photographs remain included.

## External acceptance not executed

No real Stripe/PayPal account was charged, no live subscription was created or cancelled, no hosted webhook registration was changed, no external email was delivered, and no production scanner/account/quota or Hostinger deployment was exercised. These require the owner's real configuration and sandbox/staging acceptance, including the four newly required Stripe subscription lifecycle events.

Public Lighthouse/field performance scores, search ranking, independent penetration testing and production backup/restore were not measured. SEO controls and local responsive/browser behavior are implemented and tested to the stated scope; they are not labelled “100% SEO/security/performance.”

The India & Kigali archive could not be transferred because it exceeds 32 MiB; a split upload is still needed. A specific Shopify book product URL was not provided and was not invented.
