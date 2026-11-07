# Webinars, review approval and student lead exports

## Events and webinars

Both admin roles can create normal events or webinars through the existing Events
editor. Webinar records use `type: "webinar"`, `zoomUrl`, the existing UTC `date`,
`location` and plain-text `description` fields. A draft may omit its join link;
publication requires a complete HTTPS link on `zoom.us`, `zoom.com` or a subdomain
of either. Credentials, nonstandard ports, JavaScript links and lookalike domains
are rejected. Student-facing event summaries include only published records and
validated join links. An invalid legacy link is hidden until corrected.

## Explicit review approval

New learner reviews and learner edits are pending. They cannot publish themselves
by submitting a status or approval fields. Both admin roles can approve or reject;
Client Admin cannot rewrite the learner's text, while Super Admin retains the full
editor. Every write increments a numeric revision. Moderation and Super Admin
edits compare the observed revision and timestamp, including when two changes have
the same timestamp millisecond. A stale decision returns 409 and requires reload.

Publication requires `status: "approved"` plus the server-stamped `approvedBy`
ObjectId and `approvedAt` Date. Legacy rows marked approved by the former automatic
publication flow lack that evidence: they remain hidden publicly and appear as
awaiting approval in both admin review queues. Administrators can approve those
rows normally; no database migration or guessed historical approval is needed.
Student edits clear approval evidence. Moderation records the authenticated actor
in the audit log, and the public review/landing cache is invalidated after writes.
The V57 and V58 legacy migrations preserve review approval states.

## Excel-compatible lead export

`GET /api/admin/students/export.csv` is available to authenticated Client Admin and
Super Admin accounts. It exports every registered, nonremoved student, including
blocked students, across all pages. Pagination and role query parameters cannot
change the fixed student scope. Removed tombstones, admin accounts, financial data,
passwords, sessions, reset tokens and private admin notes are excluded.

The download is UTF-8 CSV with a byte-order mark, CRLF rows and these columns:
Name, Email, Phone, Country, Registration date (UTC), Status. Missing phones are
blank. All cells are quoted; embedded quotes are escaped. Formula prefixes are
neutralized, including international phone numbers beginning with `+`, so Excel
opens them as text. A database cursor streams all rows with backpressure handling;
disconnects close the cursor. Responses use attachment/no-store headers, and the
audit records the exporting administrator and row count without copying lead data.

## Country prices on the default term

Course and Section base terms now support `countryPrices` using the same validated
ISO-country entries as additional terms. A reviewed admin save opts a course or
section into `includeBaseOffer: true`: its default term is selectable under key
`base`, alongside additional terms with their existing stable keys. The selected
country total is projected per request and country maps remain private.

Existing products default to `includeBaseOffer: false`, preserving their previous
option selection until reviewed and saved. Legacy named membership plan selection
is unchanged. USA/default fallback and explicit administrator-set totals remain
authoritative; no prices are generated from a region or browser parameter.

## Verification

`backend/test/webinars-reviews-export.test.js` covers domain validation, safe public
DTOs, CSV formula escaping, revision guards and base-country persistence/projection.
`backend/integration/academy-r4.test.js` exercises real HTTP and generated MongoDB
transactions for publication, same-millisecond stale moderation, legacy approval,
both-role CSV exports beyond one page, secret exclusion and base/additional offers.
It does not contact Zoom, payment, mail or scanner providers.
