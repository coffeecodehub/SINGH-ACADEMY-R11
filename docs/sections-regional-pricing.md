# Sections, account-country prices and single-use coupons

R4 uses the same simple price flow for courses and sections. Enter the default
access duration and **USA/default total in USD**, then add optional country-price
rows. Add another access term when needed and enter its own total and country
rows. Each price is the **total for the whole term**, using a whole-month duration
from 1 to 120 months. No currency conversion, automatic regional rate or guessed
country price is created.

The student's saved account country selects its matching price. Countries with
no explicit price, including a blank country total, inherit that term's default.
An existing United States (`US`) row is the canonical USA/default total; when
there is no US row, the explicit base total is used. Editing or removing a legacy
US row keeps the default field consistent. Other country rows can be searched
by name or code, added, changed and removed directly. The default is edited in
its own field instead of adding a second USA price.

The old bulk-region previews, replacement confirmation panels and shortcut
groups are removed from the R4 form. Existing country totals remain intact.
Option features are not edited in this price flow, but their stored values,
stable option keys and other saved option data are preserved.

On a reviewed R4 course/section save, `includeBaseOffer:true` makes the default
term selectable with key `base`, followed by the configured additional terms.
Each term retains its own country prices. Legacy records default to
`includeBaseOffer:false`: options continue to replace the base until an admin
reviews and saves the product. This avoids silently changing existing catalogs.
Legacy named Academy membership plans retain their prior offer projection and
paid history; they do not receive the new course/section base prefix. New blanket
Academy memberships remain retired.

If an old custom option already uses reserved key `base`, saving explains the
collision instead of silently changing its identity. Other existing option keys
remain unchanged. Catalog edits do not rewrite old invoices, accepted renewal
prices or country snapshots.

Course sections have their own published catalogue and access terms. Courses
can be assigned to a section or remain standalone. A paid section includes its
currently published courses, including courses added during the active term.
It does not grant access to other sections or standalone courses. Existing
individual purchases and global Academy memberships retain their own access.
Section and course URL slugs are locked after creation to preserve purchase
references. Deleting a section archives it and preserves its history.

## Price and coupon boundaries

- Authenticated `/api/courses` and `/api/sections` responses project the prices
  for the country stored on the account. They never return country price maps.
  Raw catalogue records may be cached; the country projection happens per request.
- Public section metadata and `/api/content/landing` omit prices. Landing returns
  up to 24 published, unarchived sections in display order as `sections`; its raw
  summaries are cached and metadata is projected after the cache read. Successful
  admin changes invalidate that cache, including publication and archiving. The globally
  cached `/api/content/site` membership metadata contains names and descriptions,
  with prices obtained through the authenticated payment catalogue.
- Checkout quotes use stored product options and the authenticated account's
  country. Browser-supplied amounts, countries and access dates do not set prices.
- Coupons are scoped to one course or section and one global redemption. Claiming
  a coupon shares the checkout transaction. A competing order cannot transfer
  the reservation, including another order from the same student.
- Payment consumes the reserved coupon in its settlement transaction. An order
  whose remote checkout is safely closed can release an unconsumed reservation.
  Repeated fulfillment is idempotent. Expiry or revocation prevents new claims;
  it does not change the agreed price of an already reserved, settled order.
- Coupon discounts apply to the first paid term. Renewal uses its saved,
  undiscounted price. Full discounts use explicit coupon invoice evidence and
  create no fictitious provider payment.

Section access stores an independent contribution per owned, settled invoice.
The access resolver rechecks that invoice's ownership, section, environment,
grant dates, refund and revocation state. Intervals are half-open: access is
active at the start and inactive at the exact end. A refunded section does not
revoke an independently purchased course or global membership.

Both admin roles can manage sections and coupons. Student routes cannot enumerate
coupons. Section covers use `/api/admin/sections/upload`, which scans and preserves
the original image bytes and dimensions; public media access follows a published
section reference. Private learner files and payment receipts retain their own
ownership checks regardless of CMS references.

## Existing database updates

Pricing changes do not require seeding an existing customer database. Start with
the read-only `npm run db:check` and review its report against a backed-up intended
database. R4 registers the `User.deletedAt` and `VideoReview` indexes. Only after
review should an owner explicitly run `npm run db:prepare -- --apply` for supported
additive index creation. Do not drop, sync or seed records as part of this update.
Historical dataset/seed repair is a separate operation and is not a prerequisite
for saving the new default/country price rows.

## Local verification

`backend/test/regional-commerce.test.js` covers regional projections, configured
fallbacks, validation, explicit zero-discount evidence and every supplied seed
lesson. `backend/integration/regional-commerce.test.js` uses a generated disposable
replica-set database to exercise actual HTTP authorization, account-country price
authority, concurrent coupon claims, scoped section access and refund boundaries,
original image bytes, seed repair and transaction rollback. It contacts no external
payment, mail or scanner provider. Provider acceptance testing remains a separate
deployment check.
