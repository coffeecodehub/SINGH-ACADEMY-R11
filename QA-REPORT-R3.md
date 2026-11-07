# Singh Academy 60.16.0 R3 — local verification

The final application checks below passed on **Node 22.23.4**, the reviewed
Hostinger target runtime, on 5 November 2026. Version 60.16.0 alone does not
identify R3; use its source inventory and artifact manifest. R2 counts are
historical and are not substituted for R3 results.

| Final check | Result |
| --- | --- |
| Complete `npm run verify` code gate | Passed, exit 0 |
| Backend unit/regression suite | 1,267 passed; 0 failed/skipped |
| Frontend reliability suite | 749 passed; 0 failed/skipped |
| Runtime/tool suite | 178 passed; 0 failed/skipped |
| Model/raw-webhook contract suite | 18 passed; 0 failed/skipped |
| Real MongoDB + Express/HTTP integration | 162 passed; 0 failed/skipped |
| Actual frontend fixture browser suite | 122 passed; 0 failures/retries/skips |
| Real-database browser suite | 53 passed; 0 failures/retries/skips |
| TypeScript, production build, source/import checks | Passed; 0 syntax/import errors |
| Fresh backend/frontend full/production dependency audits | All four completed; 0 known vulnerabilities reported |
| Clean locked backend/frontend dependency installs on Node 22 | Passed; input manifest/lock hashes match |
| PayPal request shapes against official published OpenAPI schemas | 54 passed; not remote merchant acceptance |
| Responsive visual review | 24 final-build captures inspected at 1440px and 390px |
| Original imagery | 268 original public/certificate assets and five accessible uploads retained byte for byte |

These checks overlap; the rows are not a unique assertion total. Logs and sanitized
summaries are in `qa/v60.16.0-r3/evidence/`. Full-size QA screenshots remain outside
the clean ZIP. Archive CRC/inventory, standalone extraction and offline-builder
results are recorded separately in the adjacent artifact manifest and updater
report; a ZIP cannot embed its own final checksum.

## Behavior exercised

- Published section cards retain the existing Landing, Home and About layouts,
  with honest empty/error states. Drafts remain private; old global Academy
  subscriptions are not substituted for new section sales.
- Five accessible Ukraine/Brazil originals occupy separate existing photo slots.
  Their HTTP bytes, orientation, contain frames and mobile spacing were checked.
  The existing founder portrait, cream/brown theme and page structure remain.
- Faculty lanes move automatically in opposite directions, with slower reduced
  motion. No Play/Pause opt-in remains. Hover/focus pause, keyboard access and
  profile interactions pass the actual browser checks.
- Admin-entered region totals expand into explicit reviewed country overrides.
  Existing overrides survive unless replacement is confirmed. The saved account
  country determines checkout; missing overrides inherit the admin USA total.
  Browser price/country tampering cannot change the server-authorized amount.
- Stripe and PayPal recurring purchases retain accepted price, country, interval
  and first-term discount. Stripe supports 1–36-month recurring terms and PayPal
  supports 1–12. Unsupported methods explain their limits.
- Eligible paid one-time purchases can authorize deferred renewal with **$0 due
  now**, after contiguous paid coverage, within the supported 48-hour to 730-day
  window. Setup alone creates no paid invoice, revenue or new access. Only a
  verified collected term grants its paid period.
- Disable preserves paid access. Stripe uses period-end cancellation; PayPal
  uses suspension and safe consented activation. Ending an already-disabled
  PayPal agreement is serialized and retryable; cancellation and financial
  reconciliation must finish before its billing key is released.
- Completed, legitimately delayed, failed, mismatched and replayed payments,
  scoped partial refunds/reversals, owner isolation, uncertain creation and
  cross-provider duplicates are covered. Late sales are reconciled before safe
  replacement; pending/unknown/unrecorded collections retain the old key.
- Browser cancellation URLs, approval/ACTIVE states and zero-now setup are not
  collected-money evidence. Valid collection delays retain the provider period.

The image lifecycle race found in browser testing was fixed without removing the
loaded-state assertion. Final browser tests pass. Earlier failures and focused
investigation evidence remain outside the clean ZIP.

## Delivery and remaining acceptance

The offline builder creates a separate complete folder/ZIP from hash-verified
local release files. It preserves old source and excludes private settings,
dependencies, build output and Git metadata from the ZIP. Private settings are
copied only into the new local folder after ZIP verification. Both ZIP assembly
imports are explicit. Portable PowerShell checks do not replace native Windows
owner acceptance; delivery test results belong to the external artifact manifest.

Local provider transports are synthetic. Real Stripe/PayPal merchant credentials,
signed hosted delivery, actual collections and future renewal timing remain
**unverified**. Local tests do not certify unknown vulnerabilities or production
readiness. No live charge, production database write, deployment, DNS change or
GitHub push/clone was performed for this round.

The public domain is `singhacademy.com`; Hostinger plan/access, backend routing,
scanner, SMTP inbox delivery and backup/restore still need operator acceptance.
The India/Kigali archive exceeded the 32 MiB attachment-transfer limit and was not
retrieved; no new photographs or solo portrait from it are claimed. An exact
Shopify book URL is still needed before publishing its shop button. See
`HOSTINGER-R3-READY.md` and `LOCAL-FIXES-R3.md` for setup and administration.
