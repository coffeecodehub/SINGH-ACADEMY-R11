# Singh Academy 60.16.0 R5 — local verification

R5 checks ran on **Node 22.23.4** on 6 November 2026. Identify this round by
its reviewed inventory and delivery manifest; earlier R4 reports are historical.

| Executed check | Result |
| --- | --- |
| Backend unit/regression suite | 1,342 passed; 0 failed/skipped |
| Frontend reliability suite | 843 passed; 0 failed/skipped |
| Runtime/tool suite | 178 passed; 0 failed/skipped |
| Model/raw-webhook contracts | 18 passed; 0 failed/skipped |
| Real MongoDB + HTTP integration | 219 passed; 0 failed/skipped |
| Controlled frontend browser suite | 140 passed; 0 failures/retries/skips |
| Real-database browser suite | 69 passed; 0 failures/retries/skips |
| TypeScript, production build, source/import checks | Passed |
| Fresh full/production dependency audits | All four completed; 0 known vulnerabilities reported |
| Fresh locked backend/frontend installations | Passed |
| Admin upload beyond the former 250 MiB boundary | Actual bounded-memory multipart disk-stream test passed |
| Preserved scanner hint and actual scanner rejection | Clean 4 MB upload with old 3.5 MB hint passed; real scanner 413 rejected without storing media |
| HD original and crop/save/reload | Browser verified 4464×2976 original bytes/SHA and separate 1200×675 crop, persisted metadata and reopening |
| Responsive visual review | Eight desktop/mobile captures inspected; no blocking findings |
| Original assets | 268 original public/certificate files and five available original HD photos retained byte for byte |
| Portable clean-package helper | Six cases passed on PowerShell 7.5.4 |

Rows overlap and are not a unique assertion total. The initial whole code gate,
final frontend checks, final production build and final browser evidence are
recorded separately. The immutable extraction's complete `npm run verify`, archive
CRC/inventory/hash checks and nine R4-to-R5 updater cases belong to the accompanying
**R5 delivery verification manifest**. That manifest is written after sealing;
a ZIP cannot contain its own final checksum or a report created after its seal.

Sanitized reports are under `qa/v60.16.0-r5/evidence/`. Full-size visual captures,
earlier investigation failures and local delivery fixtures stay outside the ZIP.

## Behavior verified

- Administrator media has no arbitrary application byte cap by default. The
  server marks admin uploads after authorization, streams to disk/scanner/GridFS,
  checks signatures and keeps required hosted malware scanning. Student 20 MiB
  assessment and 10 MiB receipt policies remain separate. Copied Cloudmersive
  3,500,000-byte local hints do not pre-reject uncapped admin uploads, but actual
  scanner rejection still fails. No provider plan is silently upgraded.
- Preview length is 10–20 seconds (default 15), not an original-video duration
  limit. Public full playback requires no account. Native, YouTube, Vimeo and
  TikTok controls preserve full playback; exact origin/window/ready gates reject
  spoofed player messages. Instagram uses its official embed and original-source
  fallback; Instagram does not supply an equivalent programmable preview API.
- Upload failure retains title/description, unfinished uploads cannot be saved,
  and invalid/empty sources receive validation before an avoidable save request.
- Optional page galleries support grid, masonry, justified, portfolio, single
  viewer and carousel layouts. Empty slots are omitted rather than required.
  Titles/captions, frame ratios, fit, crop and framing remain editable. Landing,
  Home and About have four safe placement anchors; legacy blocks remain before
  the footer and other public pages retain the footer fallback.
- Existing website photographs, including the five HD learning slots, can be
  replaced/cropped. Originals use the original-preserving uploader and display
  crops remain separate. Image-only settings survive Mongoose's omitted empty
  objects and editor reload; malformed historical settings normalize safely.
  Published nested gallery references are exact; drafts, original-only sources
  and learner-private blobs do not gain public access through another block.
- Future published Zoom webinars queue professional escaped HTML/text invitations
  to saved account emails for active live course, section or invoice-backed legacy
  members. Multiple eligible purchases deduplicate. Expired, sandbox, cancelled,
  blocked and removed accounts are excluded; entitlement and publication revision
  are checked again at delivery. Material changes create revised invitations;
  stale/unpublished notices do not send. Durable fan-out checkpoints, leases and
  retries retain sent-state safety. SMTP uses the configured Academy sender.
- Excel-readable CSV downloads cover active Forms, Reviews, Course/Section
  Purchases, Subscriptions, Certificates, Completion Notifications and Purchase
  Requests, alongside the existing student export. All matching pages stream with
  explicit projections, role boundaries, no-store headers, audit records, UTF-8
  BOM and spreadsheet formula protection. These are CSV files, not XLSX workbooks.
- Billing keeps explicit provider-backed enable/disable controls. New checkout
  defaults to renewal selected; existing disabled choices and one-time purchases
  are not silently charged. Immediate cancellation uses an accessible warning,
  acknowledgement, Next/review and final confirmation card. Opening, dismissing,
  going Back or pressing Escape makes no billing write. Owner/single-flight fences
  remain; cancellation revokes only the selected attributable access, without a
  refund. Renewal-off alone preserves the paid period. Eligible legacy plans also
  expose cancellation beside their invoice controls.

An expanded test suite initially exhausted its shared fixture account's login
budget. New exports now use a dedicated test administrator; production rate limits
were not relaxed. Browser acceptance also found and fixed the image-only editor
reload error; the full HD save/reload assertion remains and passes.

The public fixture-browser run preceded the final website-editor-only reload
normalization; the complete final production database-browser run includes the
new original/crop/save/reopen acceptance. Final immutable-extraction verification
covers the entire sealed source and tests.

## Remaining operator acceptance

Portable PowerShell 7.5.4 execution does not establish native Windows R5 acceptance.
Real SMTP inbox delivery, scanner reachability/allowance and provider-hosted payment
collections are not configured or certified here. SMTP is retryable at least once
with a stable Message-ID, not guaranteed exactly once after a crash.

No physical hosting/scanner bandwidth, disk, file-size or timeout limit is claimed
unlimited. Follow `START-HERE-WINDOWS.md` for the local-only upload troubleshooting
path and mail configuration. Hosted stages still require a real scanner. The
existing website theme and original asset bytes remain; no broad redesign was made.

No real charge, production database write, Hostinger deployment, DNS change or
GitHub clone/push was performed. Known dependency audits are not a guarantee
against unknown vulnerabilities. Hostinger plan/access/backend origin, DNS/TLS,
SMTP, scanning and backup/restore remain owner acceptance. The public domain is
`singhacademy.com`. India/Kigali originals remain unavailable above the 32 MiB
attachment limit; no additional photos from that archive are claimed. The exact
Shopify book URL remains missing. Read `LOCAL-FIXES-R5.md`,
`START-HERE-WINDOWS.md` and `HOSTINGER-R5-READY.md` before deployment.
