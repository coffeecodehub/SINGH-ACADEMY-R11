# Singh Academy 60.16.0 R4 — local verification

The final code gate passed on **Node 22.23.4** on 6 November 2026. This is
local R4 acceptance, identified by its exact source inventory and delivery
manifest. Earlier R3 counts do not certify R4.

| Executed check | Result |
| --- | --- |
| Complete `npm run verify` code gate | Passed, exit 0 |
| Backend unit/regression suite | 1,309 passed; 0 failed/skipped |
| Frontend reliability suite | 813 passed; 0 failed/skipped |
| Runtime/tool suite | 178 passed; 0 failed/skipped |
| Model/raw-webhook contracts | 18 passed; 0 failed/skipped |
| Real MongoDB + HTTP integration | 196 passed; 0 failed/skipped |
| Frontend fixture browser suite | 134 passed; 0 failures/retries/skips |
| Real-database browser suite | 60 passed; 0 failures/retries/skips |
| Development CSP/admin hydration/extension reproduction | 6 passed; 0 failures/retries/skips |
| TypeScript, production build and source/import checks | Passed; 0 syntax/import errors |
| Fresh backend/frontend full/production dependency audits | Four completed; 0 known vulnerabilities reported |
| Fresh locked dependency installations on Node 22 | Backend and frontend passed |
| Existing-database index CLI acceptance | Read-only detection, two additive indexes and final read-only check passed; fixture records and existing indexes unchanged |
| Responsive imagery review | 12 desktop/mobile captures inspected at 1440px and 390px |
| Retained imagery | 268 original public/certificate assets and five available original uploads retain their exact bytes |
| Portable clean-package helper | Six cases passed on PowerShell 7.5.4 |

Rows overlap and are not a unique assertion total. Sanitized logs and reports are
in `qa/v60.16.0-r4/evidence/`; full-size screenshots and earlier investigation
failures stay outside the clean archive. Archive CRC/inventory, clean-extraction
verification and nine offline-updater cases are separate delivery checks recorded
in the accompanying **R4 delivery manifest**. The immutable source ZIP cannot
contain its own final checksum or a report written after that ZIP was sealed.

## Behavior exercised

- Each course/section editor has a simple default USD total and country prices.
  Additional month terms use the same fields. USA/default applies to countries
  without an override; the stored account country determines checkout. Existing
  option keys/data survive and older records opt into the default-plus-options
  behavior on a reviewed admin save. Browser amount/country tampering is rejected.
- Published sections retain existing public card layouts and Academy Plans flow.
  Five unique available Ukraine/Brazil photographs occupy separate existing slots;
  curated cover framing removes Home hero letterbox bands while original HD bytes,
  existing founder imagery, cream/brown theme and automatic faculty motion remain.
- Public Video Reviews supports admin uploads and supported video URLs. Dedicated
  scanned media must be explicitly published; draft/unpublished and paid-course
  blobs remain protected. Native and ready-gated YouTube/Vimeo previews loop at
  the configured 10–20 seconds (default 15); full playback needs no account.
  Other accepted social sources open safely at their original source.
- Published Zoom webinars require a validated HTTPS Zoom joining URL. Actual admin
  create/edit persistence and the student's joining details were browser-tested.
- New and edited student text reviews remain private until an administrator
  approves the current revision. Missing legacy approval proof and stale moderation
  requests cannot make unseen content public. Both admin roles can moderate.
- Both admin roles download all eligible student leads as UTF-8 **CSV readable by
  Excel**, not an `.xlsx` workbook. Spreadsheet formula prefixes are neutralized;
  passwords, tokens and financial secrets are excluded.
- New recurring checkout starts with automatic renewal selected and explicit price
  consent. Disabling renewal preserves paid access. Separate **Cancel subscription
  now** requires confirmation, closes the selected Stripe/PayPal agreement and
  revokes only its attributable access, without a refund. Independent paid grants
  and historical financial amounts remain intact. Late verified payments are
  recorded once without restoring cancelled access.
- Deferred setup binds its original invoice; the deterministic purchase/setup race
  is fenced. Uncertain provider or collection state stays pending. Both-provider
  retry, selected-source isolation, reversal and duplicate-payment cases pass.
- Student removal requires administrator identity confirmation, blocks sign-in,
  revokes sessions and retains an audited tombstone/financial history. Provider
  agreements and hosted checkouts must close before final removal. Removal-only
  takeover resolves an older stuck renewal control; late old responses cannot
  clear the cancellation. Unknown provider identity stays pending without creating
  a new checkout. Removed accounts cannot regain access through old cookies/reset.
- Clean Admin and Super Admin do not produce hydration warnings. Deliberately
  injecting the reported random HTML attribute reproduces the warning; application
  code/server HTML do not contain it. No blanket hydration-warning suppression,
  disabled SSR, or weakened production CSP was introduced.

The initial browser selector failures and obsolete media source assertion were
corrected, with persisted webinar values and private-media ordering retained in
the checks. Final full runs pass without skipping assertions or retrying failures.

## Delivery and remaining acceptance

The compact offline builder uses the owner's verified **1052-file R3 project**
to create a separate complete R4 folder and ZIP. It verifies reused source/images
and every output file. Private settings copy only into the new local folder after
ZIP verification. No Git, network, provider or database operation is performed by
the updater. Both PowerShell ZIP assemblies are explicit. Portable Linux execution
of PowerShell does not establish native Windows 5.1 acceptance.

Synthetic loopback provider transports are used in local tests. Actual Stripe and
PayPal merchant credentials, hosted signed webhooks, real collections and future
renewal timing remain **unverified**. No live charge, production database write,
Hostinger deployment, DNS change or GitHub clone/push was performed this round.
Local checks do not guarantee unknown security flaws are absent.

The public domain is **singhacademy.com**. Hostinger plan/access/backend routing,
TLS, scanner service, SMTP inbox delivery and backup/restore require operator
acceptance. The India/Kigali archive exceeds the 32 MiB attachment-transfer limit
and was not retrieved; no extra photos or new solo portrait from it are claimed.
The exact Shopify book URL remains missing. Read `HOSTINGER-R4-READY.md`,
`LOCAL-FIXES-R4.md` and `START-HERE-WINDOWS.md` before installation/deployment.
