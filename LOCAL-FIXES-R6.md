# Singh Academy 60.16.0 — local review R6

R6 is the current local correction release. The package version remains 60.16.0;
identify this round by its reviewed inventory and final delivery manifest.
`QA-REPORT-R6.md` records executed local checks, including both complete browser
suites. Final archive, clean-extraction and updater results are in the accompanying
delivery manifest; R5 counts do not certify R6.
No GitHub operation, hosted deployment or real merchant acceptance is implied.

## Administrator video uploads and 503 diagnosis

Original-video duration is separate from the 10–20-second preview. Administrator
uploads retain the R5 default `ADMIN_MEDIA_MAX_UPLOAD_MB=0`, which removes the
application byte cap; actual disk, hosting, timeout and scanner capacity remain
operational limits. Student assessments and payment receipts keep their separate
policies. Required hosted malware scanning is not bypassed.

A 503 is not evidence of a duration restriction. It may mean uploads were
disabled, scanner configuration is invalid, the service is unreachable/busy, or
its authentication/allowance failed. Read the authenticated upload status and
returned error code rather than assuming every failure has the same cause.
R6 returns a machine-readable upload reason code and request ID where available;
configuration status is not represented as proof that a remote scanner is reachable.
For your own media on localhost development, run from the **new R6 project root**:

```powershell
npm.cmd run uploads:local
npm.cmd run uploads:local -- --apply
```

The first command is read-only. When settings change, the explicit `--apply` operation creates a private
`.env.uploads-local-backup-*` and changes only `UPLOADS_ENABLED=true`,
`UPLOAD_SCAN_PROVIDER=clamav`, blank `CLAMAV_HOST`, `UPLOAD_SCAN_REQUIRED=false` and
`ADMIN_MEDIA_MAX_UPLOAD_MB=0`. It preserves database, authentication, SMTP and
scanner credentials. Stop/restart the backend afterward, using a fresh terminal
if old exported variables override the file. Local development originals are not
malware-scanned in this explicitly chosen path; signature/type checks remain.

The helper requires both file and exported stage/runtime values to be compatible
with development, all configured frontend origins to be loopback, and no
contradictory exported upload settings. It refuses test/review/production and
remote frontend origins instead of relabelling them. Do not force a hosted stage
to development to bypass scanning. The offline updater and setup do not run this
configuration action automatically. Configure a real scanner before hosting.

Keep existing database/authentication/provider secrets private. A local-only
configuration change needs a separate explicit action and backup; it does not
provision a hosted scanner, buy a larger provider allowance or prove a clean
remote verdict. Production/review stages still require a real scanner.

## Automatic video previews and galleries

The global Play/Pause video-preview button is removed from Landing and Video
Reviews. Supported previews start muted automatically, loop their short preview
and pause while the full viewer is open. Opening the viewer plays the full source
without Academy registration. The source file is not trimmed to teaser length.
CMS page videos use the same short-preview/full-viewer pattern for supported
uploaded and social sources.

YouTube, Vimeo and supported TikTok players offer controllable previews.
Instagram controls its official embed and does not expose an equivalent supported
seek/autoplay API; private, deleted or embedding-restricted sources cannot be
forced to play. Original-source fallback remains available where appropriate.
Browser autoplay policies may require interaction for unmuted full playback.

Carousel galleries move automatically when visible. Hovering or keyboard focus
pauses motion for inspection; offscreen/hidden-document and reduced-motion
preferences are respected. Existing layouts, page widths, text and theme remain.
No requirement is added to fill every optional image slot.

The two requested new hero replacements (certificate group on Landing and
whiteboard photograph on Home) are **pending original downloadable image files**.
They are visible as inline chat images but are not available as original HD files
in this workspace. Do not describe them as embedded/replaced or fabricate higher
resolution. The five already available HD originals remain unchanged. The existing
Website Content image slots can be replaced/cropped through the authorized editor
once the actual originals are supplied.

## Confirmed save feedback and image loading

A confirmed successful admin/Super Admin content save should display a clear
success acknowledgement. Pending, failed or conflicting requests must not display
success. Existing page-section and website content controls still govern drafts,
publication, crop settings and placement.

Above-fold image priority, appropriate display variants, stable frames and bounded
loading can reduce visible delays. Original HD files remain retained. No claim is
made that every image loads before navigation or within microseconds on every
network. Lower-page media must not delay the entire application while loading.

## Pending checkout and automatic renewals

A checkout that has only been started is pending, not a paid membership. Continue
uses the owned existing provider checkout; it must not create another purchase or
charge by navigating a link. Cancel pending requests safe provider closure and
removes the current card only when closure is confirmed. If collection wins a
race or provider state is uncertain, the result must remain honest and retryable.

Finalized cancellation cards are omitted from the current renewal workspace;
financial invoices, receipts and audit history remain. The separate manual
Refresh renewals button is removed in favor of state synchronization. Automatic
renewal can be enabled/disabled for eligible confirmed agreements. New recurring
checkout defaults to renewal selected but retains explicit recurring-price consent;
existing disabled settings and one-time purchases are not silently charged.

Disabling renewal retains the paid period. Explicit immediate cancellation uses
the warning/acknowledgement/review card and ends only selected attributable access,
without a refund. These actions do not erase independent paid coverage or invent
provider confirmation.

## Webinar mail and the rest of the learning flow

R5's durable webinar publication queue remains: eligible active paid course,
section and verified legacy members receive an individual professional invitation
with UTC date/time, agenda and Zoom link through the configured Academy sender.
Revision, recipient and entitlement checks prevent stale/unpublished invitations.
Without actual SMTP, development output is only a console preview. Actual inbox
acceptance remains an operator check; delivery retries use a stable Message-ID
but are not guaranteed exactly once after a crash.

Country prices, USA fallback, scoped single-use coupons, selected access,
certificates and Stripe/PayPal payment evidence must retain their existing
server-authoritative behavior. Local synthetic transports do not certify live
merchant credentials, hosted webhooks, real collections or future renewal timing.
Read the R6 QA report for the exact executed scope, rather than assuming the
entire project is covered by a single test count.

## Existing database and complete local delivery

Preserve the current database and working R5 folder. Inspect it with the read-only
`npm.cmd run db:check` before any separately reviewed additive preparation. Never
seed/drop/sync an existing database as an update shortcut. Runtime or index changes
must follow the final reviewed R6 model requirements.

The complete archive is intended as `SINGH-ACADEMY-COMPLETE-60.16.0-R6.zip`.
After the root seals it, the compact offline builder uses the verified **1131-file
R5 project** as its local source. It embeds changed/configuration files and reuses
only matching file hashes. It creates a new complete R6 folder and ZIP, leaves R5
unchanged and copies private `backend/.env`/`frontend/.env.local` only into the new
local folder after the clean ZIP is verified. The ZIP contains no private settings,
Git metadata, dependencies or build caches. Both PowerShell ZIP assemblies load
explicitly. The updater makes no network, provider, database or npm calls.

Final archive/updater checksums and clean-extraction acceptance belong to the
accompanying delivery manifest. Portable PowerShell execution does not replace
native Windows acceptance. Use `START-HERE-WINDOWS.md` for general setup and
`HOSTINGER-R6-READY.md` for future hosting acceptance. The confirmed domain is
`singhacademy.com`; Hostinger access/plan/backend routing, scanner, SMTP, DNS/TLS
and backup/restore remain operator inputs. The original India/Kigali archive and
exact Shopify product link remain unavailable; no new assets/link are claimed.
