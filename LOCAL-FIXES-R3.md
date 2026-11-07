# Singh Academy 60.16.0 — local review R3

R3 is the current local correction candidate. The package version remains
60.16.0; the reviewed source snapshot, R3 archive manifest and this document
identify the correction round. Final executed checks belong in
`QA-REPORT-R3.md`; pending checks must not be inferred from earlier R2 counts.
No deployment, DNS change, GitHub operation or real payment was performed for
this work. Keep the old working folder and its private settings as a backup.

## Sections and the existing visual layout

The cream/brown theme, typography and established page structure are retained.
Landing and Academy Plans use section cards in the existing card layout. Open a
section to review its courses, buy whole-section access or select an individual
course. Published content and prices come from the admin workspaces; no
unpublished placeholder catalogue or automatic prices are invented.

Super Admin → Page sections provides ordered text, image, video and action-button
blocks for supported pages. Cards support the existing cream/white/dark themes,
stacked/split layouts, text alignment, publication, ordering and deletion. Drafts
stay private. Published blocks render once through the shared page outlet.
Original-image upload and alternative text remain available; Contain preserves
the full image in its frame. These controls extend page content without requiring
a replacement site theme.

Both faculty rows move automatically in opposite directions. Hover and keyboard
focus pause the relevant lane. The reduced-motion presentation uses slower
automatic lanes. Profile buttons, keyboard access, the modal close control and
Escape/focus return remain part of the interaction; the R3 browser checks must
verify those behaviors on the final build.

## Exactly five original supplied photographs

R3 reuses the five accessible original files from the Brazil and Ukraine
Delegation archives. Each appears once across the new placements: two on Landing,
two on Home and one on About. The existing hero/story/event/card positions are
used rather than repeating every photograph in a gallery beneath each page.
Frames use Contain, intrinsic dimensions and descriptive alternative text. The
original bytes and resolution are preserved and recorded in
`docs/global-learning-images.json`.

The India archive exceeded the environment's **32 MiB attachment-download cap**;
its contents were not retrieved or reviewed. The earlier oversized Kigali
archive also remains outstanding. They are not represented as delivered images.
No new solo portrait was added. Existing founder imagery, the supplied founder
biography and book information remain; the exact Shopify product URL is still
an owner-supplied input.

## Administrator-owned country pricing

Client Admin and Super Admin set course/section term totals and country
overrides. The editor includes 249 ISO country/territory choices. A matching
override for the student's saved account country wins; otherwise the explicitly
configured USA/default total applies. Legacy records without a US override use
their explicit base as USA/default. No $5/$10 regional assumptions are created.

The server computes the quote from the saved account country and administrator
configuration. Students cannot authorize a price by changing browser fields,
and other countries' full maps are not disclosed to them. Existing paid invoice
amounts and consented recurring snapshots are preserved when an administrator
changes future catalogue pricing.

## Enable renewal without charging for access already paid

For an eligible **active one-time course or section purchase**, My Billing offers
**Set up automatic renewal**. This opens a new quote and consent flow; it does
not silently convert the old receipt or take another payment immediately.

- The review screen shows **$0 due now**, the first future payment date, recurring
  amount/currency and interval. Choose an available Stripe or PayPal recurring
  method, then approve its hosted agreement after explicit consent. PayPal
  Subscriptions is separate from its Orders-v2 one-time checkout.
- The first charge is scheduled at the end of the student's existing contiguous
  paid coverage, including applicable section or legacy Academy coverage. Setup
  requires that date to be **48 hours to 730 days ahead**. A separate prepaid
  future period after a gap prevents setup until it can be handled without
  charging over prepaid access. Unlimited access does not need renewal setup.
- A provider-confirmed setup records the future agreement. It does not create a
  new paid local invoice, receipt, revenue entry or paid access term. Existing
  access remains governed by its original payment. Only a later verified paid
  Stripe invoice or completed PayPal subscription payment can grant the future
  paid term after server verification.
- Discount codes are unavailable for deferred setup. The displayed standard
  recurring price is the consented snapshot; an earlier purchase's discount is
  not applied repeatedly. Stripe supports recurring terms of **1–36 months**;
  PayPal supports **1–12 months**. A selected term outside a provider's supported
  range displays an unavailable reason rather than silently changing the term or
  downgrading to a different payment type.
- **Disable automatic renewal** retains already-paid access. Stripe schedules
  renewal cancellation at the period end. PayPal immediately requests provider
  **SUSPEND** for future collections; it does not revoke the existing paid term.
  Both controls wait for provider confirmation.
- Stripe can enable an eligible active/trialing agreement again after consent
  to its saved recurring price. PayPal **ACTIVATE** additionally requires fresh
  consent, the unchanged future billing date, zero outstanding balance/failed
  payments and provider read-back. A changed, overdue or outstanding PayPal
  schedule cannot be silently resumed. Pending/failed confirmation is shown as
  pending/error, not success.
- An already-disabled PayPal agreement can be explicitly closed with **End this
  disabled agreement**. The provider must confirm cancellation before a new
  agreement can replace it. This retains paid access and does not start another
  charge; the next purchase still needs checkout and consent.

An expired purchase uses a regular new checkout: any amount due there is shown
before consent. It is distinct from the $0-today setup for an existing active
paid term. An ended provider agreement is not silently restarted. Reading My
Billing or following a setup link alone cannot charge a payment method.

An unapproved or uncertain PayPal subscription is not replaced with another
mandate just because the user returned or clicked Cancel. PayPal must confirm
cancellation or expiry before a replacement checkout can safely proceed. An
unconfirmed cancellation remains unresolved, preventing duplicate charging.

Both providers retain explicit one-time choices. The recurring candidate now
includes PayPal Subscriptions and its lifecycle/`PAYMENT.SALE.*` settlement
handling; the current PayPal webhook policy contains **19 required events**,
including the retained Orders/capture/dispute events. Actual merchant credentials,
signed delivery, deferred setup, future charging and renewal controls still need
acceptance with the operator's real test accounts before live use.

## Local delivery and remaining operator inputs

The R3 offline builder is intended to create a **new complete project folder and
ZIP** using the existing R2 or original 60.16.0 files plus the corrected embedded
source. It verifies reused original files and the complete result. Keep the old
folder untouched. Private backend/frontend settings are copied only to the new
local folder after the ZIP is sealed; they are excluded from that ZIP. Windows
PowerShell must load both `System.IO.Compression` and
`System.IO.Compression.FileSystem` before using ZIP types.

The final R3 updater/archive still needs the execution and extraction results
recorded in `QA-REPORT-R3.md`. Use `START-HERE-WINDOWS.md` for frozen dependency
installation, your own development Atlas/replica-set database and local startup.
Do not run verification against a frontend `.next` directory currently used by a
development server.

The confirmed public domain is **singhacademy.com**. Hostinger access/plan,
DNS/TLS routing, the actual backend origin, Stripe/PayPal credentials, a hosted
scanner and SMTP acceptance remain unconfigured/unverified here. No backend
subdomain is assumed. Keep secrets in private local/hosting settings, never in
chat. `HOSTINGER-R3-READY.md` gives the separate VPS/managed Node requirements and
future owner acceptance commands. Neither the offline builder nor local fixture
tests activate these services.

When the owner later runs `npm.cmd run payments:live` in an interactive terminal,
the checker asks for the actual HTTPS webhook origin or uses an already exported
`PAYMENT_WEBHOOK_BASE_URL`; it does not substitute an unconfirmed API subdomain.
Its hidden credential prompts stay in that terminal. This is a future provider
registration check, not checkout activation, deployment or a real charge.
