# Singh Academy 60.16.0 R6 — local verification

The executed checks below ran on **Node 22.23.4** on 6 November 2026. This is
the R6 source verification report. Earlier R5 counts do not certify R6. Final
archive, independent clean-extraction and offline-updater results are recorded
separately in the accompanying delivery manifest after the archive is sealed.

| Executed check | Result |
| --- | --- |
| Complete `npm run verify` code gate | Passed, exit 0 |
| Backend unit/regression suite | 1,353 passed; 0 failed/skipped |
| Frontend reliability suite | 868 passed; 0 failed/skipped |
| Runtime/tool suite | 178 passed; 0 failed/skipped |
| Model/raw-webhook contracts | 18 passed; 0 failed/skipped |
| Real MongoDB + HTTP integration | 239 passed; 0 failed/skipped |
| Real-database browser suite | 70 passed; 0 failures/retries/skips |
| Focused automatic-motion browser acceptance | Three passed; 0 failures/retries/skips |
| Complete controlled frontend browser suite | 146 passed; 0 failures/retries/skips |
| TypeScript, production build and source/import checks | Passed |
| Fresh backend/frontend full/production dependency audits | Four completed; 0 known vulnerabilities reported |
| Fresh locked backend/frontend installations | Passed; final extraction acceptance remains separate |
| Portable clean-package helper | Six cases passed on PowerShell 7.5.4 |
| Final responsive visual inspection | Eight R6 screenshots personally inspected at 390px/1440px; no new visual defects |
| Original public/certificate assets and available HD photos | 268 original assets and five original photo hashes retained in executed gate |
| Exact final source inventory | Reviewed snapshot recorded in `docs/release-baseline-v60.16.0.json`; final read-only check in delivery manifest |
| Archive CRC/inventory/hash and independent clean extraction | Post-seal result in accompanying delivery manifest |
| R5-to-R6 offline updater | Post-seal runtime results in accompanying delivery manifest |
| Native Windows R6 execution | Not executed here |
| Two new hero image replacements | Pending original downloadable image files |

Rows overlap and are not a unique assertion total. The focused motion cases are
overlap with the complete controlled-browser suite. Sanitized logs belong
in `qa/v60.16.0-r6/evidence/`; earlier failed runs, investigation fixtures and
full-size captures remain outside the clean ZIP. Final immutable-extraction
`npm run verify`, archive checksums and offline-updater acceptance belong to the
accompanying **R6 delivery verification manifest**, written after sealing. A ZIP
cannot contain its own final checksum or evidence produced after its seal.

## Behavior covered by executed checks

- Administrator original-video duration remains separate from the short preview.
  The R5 zero administrator product-byte-cap policy remains; stream/signature
  checks and required hosted scanning are retained. A 503 carries a diagnostic
  code/request ID where available. Configuration readiness is not reported as
  proof that a remote scanner is reachable. **The owner's exact observed 503
  cause remains unknown because its response body/configuration was not supplied.**
- `uploads:local` previews configuration read-only; explicit `-- --apply` backs up
  and changes only the local upload profile. File and exported runtime/stage,
  loopback frontend origins and exported upload overrides are guarded. The helper
  preserves database, authentication, SMTP and provider secrets and requires a
  backend restart. It does not relabel hosted/review/production or silently run
  from setup/updater. The explicitly chosen development path is not malware-
  scanned; hosted scanning still needs a real configured service.
- Global Play/Pause review-preview buttons are removed; muted automatic short
  previews and public full-viewer behavior retain origin/window/ready gates.
  CMS media uses preview/open-full behavior for supported native/social sources.
  Instagram and browser policies remain outside application control.
- Carousel motion, hover/focus inspection, visibility and reduced-motion behavior
  receive focused real-browser checks. Optional gallery slots, existing frame
  widths, original image sources and layout choices remain in place. Image
  variants/priorities address display latency without waiting for every image
  before rendering or promising microsecond loading on every connection.
- Admin/Super Admin save feedback is tied to confirmed server success. Failed,
  pending and conflicting saves must not claim success. Saved page-section and
  website settings retain their existing publication/dirty-state contracts.
- Pending checkout cards are not represented as paid access. Continue uses the
  owned existing provider checkout. Cancel pending closes that checkout only
  after verified provider state; a payment that wins the race is reconciled rather
  than falsely reported cancelled. Claimed/in-flight provider creation remains
  pending where identity/closure is unresolved, without creating a second order.
- Finalized cancellation cards leave the current renewal workspace while invoices,
  receipts and audit history remain. Automatic renewal retains eligible provider-
  confirmed enable/disable controls, new-checkout default selection and explicit
  recurring-price consent. One-time and previously disabled choices are not
  silently charged. The manual Refresh renewals button is removed.
- Turning renewal off preserves paid access. Explicit immediate cancellation still
  uses acknowledgement/review/confirmation, revokes only selected attributable
  access and issues no refund. Independent coverage, source-invoice ownership,
  idempotent collections and late-payment financial history remain protected.
- Country-price selection and USA fallback, scoped single-use coupons, certificates,
  member access, Stripe/PayPal evidence and existing webinar queue regressions ran
  in the local suites. Actual gateway/provider transports are synthetic loopback;
  no real merchant credentials or collections are established by those passes.
- Webinar invitations continue to use a durable publication revision and per-user
  dedupe/checkpoint/lease flow. Active paid course, section and verified legacy
  members are rechecked at delivery; stale/unpublished/removed cases do not send.
  Professional escaped UTC date/agenda/Zoom details use the configured Academy
  sender and stored account recipient. Real SMTP inbox delivery remains unverified.

## Pending assets and operator acceptance

The requested Landing certificate-group and Home whiteboard replacements are
visible only as inline chat images, not downloadable original HD files in this
workspace. They are **not claimed as replaced or embedded**. Existing available
originals remain; supplying screenshots or generated substitutes cannot establish
HD preservation. The original India/Kigali archive remains above the attachment
transfer limit, and the exact Shopify product URL remains missing.

Actual storage, hosting, timeout, bandwidth and scanner allowances are not
physically unlimited. A reachable appropriate scanner remains required before
hosting. Browser/Instagram autoplay and privacy rules cannot be overridden; full
provider/inbox behavior needs owner acceptance. SMTP delivery is retryable at
least once with a stable Message-ID, not guaranteed exactly once after a crash.

No real charge, production database write, Hostinger deployment, DNS change or
GitHub clone/push was performed for this work. Known dependency audits do not
certify absence of unknown vulnerabilities. The confirmed public domain remains
`singhacademy.com`; Hostinger plan/access/backend origin, TLS, SMTP, scanner and
backup/restore require operator acceptance. Use `LOCAL-FIXES-R6.md`,
`START-HERE-WINDOWS.md` and `HOSTINGER-R6-READY.md` for exact setup boundaries.
