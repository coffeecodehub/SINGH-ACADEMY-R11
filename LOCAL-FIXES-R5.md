# Singh Academy 60.16.0 — local review R5

R5 is the current correction candidate. The package version remains 60.16.0;
identify this round by this guide, its reviewed source inventory and the final
artifact manifest. `QA-REPORT-R5.md` records executed checks; the accompanying
delivery manifest records immutable extraction/updater acceptance. Earlier R4
execution results do not certify new R5 behavior.
No GitHub operation, production deployment or real merchant acceptance is implied.

## Original videos and short previews

The 10–20 second setting controls only the public muted preview (default 15
seconds). It is not an upload-duration limit. Opening a published review plays
its full original video without requiring a student account. Uploaded originals
retain their original bytes; paid course videos do not become public reviews.

Trusted administrator media uses `ADMIN_MEDIA_MAX_UPLOAD_MB=0` by default,
meaning there is no application byte cap for those multipart streams. Student assessment uploads retain their separate 20 MiB limit and receipt
screenshots their 10 MiB limit. They do not inherit the uncapped administrator
media setting. There is no promise of physically unlimited
storage, bandwidth, request time or scanner capacity. The actual hosting proxy, free disk space and selected scanner
still need to accept the file. Required malware scanning must succeed before a
file is published; setting a larger number does not upgrade a scanner plan.
A rejected scanner response must not be reported as a successful upload.

Existing private environment settings are preserved; no scanner subscription
allowance or key is silently overwritten. Administrator media does not pre-reject
a file using a copied Cloudmersive 3,500,000-byte local plan hint when the new
administrator cap is zero (also its default when absent from an older `.env`). The actual
Cloudmersive response still decides whether that plan accepts and clears the
file; a real provider 413 stays a failure. Use a scanner service/plan that can
scan the intended originals, such as an appropriately configured private ClamAV.
This update does not purchase a larger Cloudmersive plan or bypass required scans.

If the real provider still returns 413 during localhost testing, follow
**R5 local upload troubleshooting** in `START-HERE-WINDOWS.md`. It describes the
existing development-only `clamav`/blank-host, non-required-scanning path and a
backend restart, preserving your active Cloudmersive key. That path is never the
hosted/production configuration; real scanning is required before deployment.

YouTube, Vimeo and supported TikTok players expose preview/full-video controls.
Instagram uses its official embed; Instagram decides autoplay and does not expose
an equivalent supported seek/preview API. Accepted unsupported social sources
open at their original source. Private, deleted or embedding-restricted posts
cannot be forced to play by application code. Do not enter provider credentials
into content fields or paste keys in chat.

## Page sections and editable imagery

Super Admin can create page sections for Landing, Home and About with a title,
description/content and optional imagery. Four positions insert content before
the introduction, after the introduction, after learning sections or before the
footer. Other supported pages retain the before-footer placement. Existing saved
blocks default to their previous end position.

Gallery layouts are Grid, Masonry, Justified, Portfolio, Single Image and Carousel.
Choose the layout, desktop column count and frame aspect in the existing editor.
Unused image slots are optional and are not published. Uploaded image rows can be
reordered/removed, with optional individual titles and captions, alternative text,
cover/contain fit and horizontal/vertical framing. Crop controls retain original
image metadata; the site theme and page content width still frame the section.
Final acceptance belongs to the R5 report.

The five retained original learning-photo slots are also available through the
website image editor's allow-list, so Landing, Home and About photographs can be
replaced/cropped without editing source files. This does not grant arbitrary
filesystem access or change the original photos retained in the release.

Editing a displayed crop must not silently discard the retained original image.
Keep the existing founder portrait and HD-photo provenance unless deliberately
replacing a slot through the authorized editor. Five unique accessible original
Brazil/Ukraine photographs remain available. The India/Kigali archive was not
retrieved because it exceeds the 32 MiB attachment-transfer limit.

## Webinar announcements

Publishing a dated Zoom webinar is intended to create a durable announcement for
eligible active course or section members, plus verified active paid legacy
Academy members, addressed individually to their saved account email.
The message includes the webinar title, date/time with its timezone, description
and Zoom joining link, using the configured Singh Academy sender. Draft events,
expired/test access and removed accounts must not receive that members' mailing.
The first publication and material title/date/Zoom/details changes create a new
announcement revision. Unchanged retries or layout-only edits do not create new
mailings. Repeated worker attempts reuse the revision's per-user delivery key.

SMTP service and the application's existing notification worker must be running
for real inbox delivery. Configure the actual private `SMTP_HOST`, port/security,
SMTP credentials and Academy `EMAIL_FROM`; restart the backend after changes.
Without SMTP, development output is only a console preview, not inbox delivery. Dates are explicitly labelled UTC in the message. The
existing worker handles publication fan-out and send retries; this does not add
an untracked fire-and-forget send during the admin request. Console previews and synthetic mail tests are not delivered email.
This update does not supply SMTP credentials, DNS sender authentication or a mail
subscription. Final recipient, retry and publication semantics follow the tested
R5 implementation and deployment guide.

## Excel-readable exports

The authorized admin workspaces expose exports for their relevant records and
leads. Exports use UTF-8 CSV that Excel can open/import; a `.csv` file is not an
`.xlsx` workbook. Permissions, active filters, formula-prefix neutralization and
exclusion of private credentials still apply. An export does not edit the users,
purchases, messages or financial records it describes.

## My Billing controls

Disabling automatic renewal stops future recurring charges after provider
confirmation and retains already-paid access. Enabling requires an eligible
agreement or a new explicitly accepted checkout; existing disabled agreements
are not silently re-enabled. New recurring checkout starts with renewal selected
and still requires its price/payment consent.

Cancel subscription/purchase access now is a different confirmed action. It ends
only the selected subscription or purchase's attributable access, with no refund;
independent paid coverage and financial history remain. R5 adds a professional
warning/review card before the final cancellation request. No request should be
sent before acknowledgement and final confirmation. Uncertain provider outcomes
remain pending and retryable rather than being claimed as cancelled.

## Existing database and offline delivery

Keep your working R4 folder, database backup and private settings. Run the
read-only `npm.cmd run db:check` against the intended development database before
starting R5. If it reports missing indexes, review the report and backup before
using `npm.cmd --prefix backend run db:prepare -- --apply`, then check again.
Do not seed, reset, drop or sync an existing customer database for this update.
The offline updater does not connect to any database automatically.

The planned archive is `SINGH-ACADEMY-COMPLETE-60.16.0-R5.zip`. The R5 updater will
accept the verified **1106-file R4 project** as its local source. It embeds changed
files and editable deployment configuration and reuses only hash-matching files.
It creates a separate complete R5 folder and ZIP, leaving R4 unchanged. Both
PowerShell compression assemblies are explicitly loaded. Private `backend/.env`
and `frontend/.env.local` copy only to the new local folder after the clean ZIP is
verified; private settings are never included in that ZIP.

The existing user source is
`C:\Users\it's_me_Programmer\SinghAcademyBuilds\SINGH-ACADEMY-R4-20261106-101112`.
Install frozen backend/frontend dependencies in the new R5 folder and follow
`START-HERE-WINDOWS.md`. Archive/updater and clean-extraction evidence belongs to
the accompanying final delivery manifest. Native Windows execution remains a
separate owner acceptance check until it is actually performed.

The confirmed domain is **singhacademy.com**. Read `HOSTINGER-R5-READY.md` for
hosting/scanner/SMTP requirements. Hostinger plan/access/backend routing, real
Stripe/PayPal merchant transactions and signed hosted webhooks remain operator
acceptance work. The exact Shopify book product URL is also still missing.
