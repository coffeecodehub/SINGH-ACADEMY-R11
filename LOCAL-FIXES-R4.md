# Singh Academy 60.16.0 — local review R4

R4 is the current local correction candidate. The package version remains
60.16.0; use this document, the reviewed source inventory and the final R4
artifact manifest to identify the round. `QA-REPORT-R4.md` records executed
checks; the accompanying delivery manifest records archive/updater acceptance.
Earlier R3 results do not verify R4.
No deployment, GitHub operation or real provider acceptance is implied.

## Simple default and country prices

Course and section editors show the default access duration and USA/default USD
total immediately, followed by optional country-price rows. Each additional
duration uses the same flow. Enter the total for the entire term, using any
whole-month duration from 1 to 120 months. No prices are invented automatically.
Bulk region previews, overwrite panels and option feature editing are removed
from this simple form; existing stored option data and keys are retained.

Students choose the default term or an additional configured term. Existing
catalog records keep their earlier offer behavior until a reviewed admin save;
R4 saves explicitly opt in to base-plus-options with `includeBaseOffer:true`.
Base country rows are retained on save, alongside every additional term's rows.
The saved account country selects a matching country price; otherwise the
explicit USA/default total applies. Blank country totals inherit that default.
Changing catalog prices does not rewrite prior invoices or consented agreements.

## Renewal off and immediate cancellation are different actions

**Disable automatic renewal** stops future renewal and retains already-paid
access through its confirmed end date. Existing provider controls, deferred
renewal setup and explicit recurring-price consent remain. An eligible active
one-time purchase can schedule renewal with $0 due now; setup itself creates no
paid invoice, revenue or new paid-access term. Stripe and PayPal availability is
determined by the selected term and server quote.

**Cancel subscription now** is a separate action requiring explicit confirmation.
It terminates the selected agreement's rights and its canonical linked original
paid invoice's access, instead of retaining that access with renewal off.
Independent purchases and valid section/global coverage remain in force. A
one-time purchase cancellation affects only that owned invoice's rights.
Uncertain provider changes remain pending and retryable; a click or browser
return is not provider cancellation evidence. Cancellation does not issue a
refund or erase financial history. The final build must verify these boundaries.

## Student removal and exports

Client Admin and Super Admin can request student removal with reauthentication,
the student's email confirmation and a reason. Removal blocks the account and
revokes its sessions. Recurring provider agreements must be cancelled before
removal is finalized; uncertain cancellation stays pending for a safe retry.
Pending hosted checkouts also need safe closure. Final removal uses a soft-deleted
account/tombstone only after provider work is confirmed, and retains financial
and audit records needed for payment reconciliation. It does not hard-delete paid
history.

Student exports use **CSV**, which Excel can open or import. This is not an
`.xlsx` workbook. Export authorization and safe handling of spreadsheet-like
cell contents belong to the R4 checks; export does not edit the underlying users.

## Approved text reviews, video reviews and Zoom webinars

New or edited student text reviews remain pending until Client Admin or Super
Admin approves the current revision. Pending/rejected text is not public;
conflicting stale moderation requests must not approve a newer unseen revision.
This does not add a new registration-approval, two-factor or email-verification
gate.

Admin-created video reviews have separate publication controls. The public
`/video-reviews` page and Landing cards show published reviews, with short
15-second previews and a full playback action. Both admin roles can manage the
content; uploaded media still follows scan and publication checks. These public
testimonials do not weaken access controls for paid course media.

Events can be configured as Zoom webinars. A published webinar requires a valid
approved HTTPS Zoom link. Joining details are managed through the existing
event workspace; draft content is not promoted to a public webinar.

## Existing pages, original photos and hydration

The established cream/brown theme, typography, card structures and section sales
flow remain. The five accessible original Brazil/Ukraine photos keep their HD
bytes and resolution. The selected hero/story/event/gallery frames may crop the
display deliberately to fill their existing layout; the original file itself is
not replaced with a reduced-quality copy. No extra photo or solo portrait is
claimed from the India/Kigali archives: they exceeded the **32 MiB attachment
transfer limit** and remain unavailable in this environment.

Clean-browser checks of Admin and Super Admin produced no hydration warning.
Injecting the reported random `data-sqmjguha` attribute reproduced the warning;
that attribute is absent from application code and server HTML. Disable the
injecting extension for localhost, or use a clean browser profile. The app keeps
server rendering and does not suppress real hydration mismatches. Floto and
`chrome-extension://` console messages belong to those installed extensions.

## Existing database and local delivery

Keep the working R3 folder, database backup and private settings. Before starting
R4 against an existing database, run the read-only `npm.cmd run db:check` and
review any missing indexes. Only after reviewing that report and taking the
appropriate backup should the owner explicitly run
`npm.cmd --prefix backend run db:prepare -- --apply` for the supported additive index operation.
The updater does not migrate, seed, drop, sync or connect a database automatically.

The complete archive is `SINGH-ACADEMY-COMPLETE-60.16.0-R4.zip`. The R4 offline
updater uses the verified **1052-file R3 project** as its local source.
It embeds changed files and editable deployment
configuration, reuses only files with matching R3 hashes, and enforces a text
size below 1 MiB. Both PowerShell compression assemblies are explicitly loaded.
Earlier folders first need the existing R3 updater; that builder remains intact.

The updater creates a new complete R4 folder and clean ZIP, leaving R3 untouched.
Private `backend/.env` and `frontend/.env.local` can be copied only to the new
local folder after ZIP verification, never into the ZIP. Installation and
database setup remain separate owner actions. Use `START-HERE-WINDOWS.md` for
the Windows workflow. The accompanying delivery manifest records final updater
and clean-extraction checks; native Windows acceptance remains an owner check.

The confirmed public domain is **singhacademy.com**. Real Stripe/PayPal keys,
provider-hosted acceptance, the Hostinger plan/access, backend origin, DNS/TLS,
scanner and SMTP delivery remain owner inputs. No backend subdomain is assumed.
Do not paste credentials into chat or package private settings. The exact Shopify
product URL is also still needed before publishing a book shop link.
