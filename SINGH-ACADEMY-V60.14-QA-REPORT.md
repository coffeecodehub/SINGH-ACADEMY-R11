# Singh Academy V60.14.0 — QA report and verification boundary

## Release status
Source update prepared from the supplied V60.13.3 complete archive. This is a
candidate for local + GitHub + sandbox acceptance, not a claim that live payments
or Hostinger have been verified. The author's executable runtime was Node 22.16.0.
The user's Node 24 installation and the existing Hostinger Node 22 setting do not
need to change.

## Requested changes

### 1. Payment provider reselection
A returning student can select either provider using the existing checkout
buttons. Selecting a DIFFERENT provider sends an authenticated, student-owned,
CSRF/origin-checked release request for the original request key. A return-page
“Choose payment method” link returns to the same course/plan and renewal reference.
The old browser metadata is not blindly discarded.

Stripe: the server retrieves and verifies the exact saved session. Only a
confirmed open, unpaid session with no active/ambiguous payment attempt is expired.
Its status is re-read after expiration, including lost-response/racing-settlement
cases. Paid orders are reconciled to the original invoice/access instead of creating
another checkout. Processing/unknown payments remain blocked pending review.

PayPal: CAPTURE Orders v2 has no generic “cancel order” API. The server durably
blocks its own future capture paths, serializes capture/release with a database
operation lease, verifies the remote order and permits replacement only when no
capture has been attempted or authorized. An uncertainty marker survives lease
expiration. A late old return/webhook cannot initiate a new application capture
after cancellation. This is local checkout cancellation, NOT a claim that the
PayPal approval page has been remotely voided. Verified money already captured
is still reconciled rather than discarded.

A closed predecessor has one server-persisted replacement request key. Replays
and competing tabs receive that same key. Normal checkout fingerprint/idempotency
validation prevents two alternative replacements under it. The losing tab reads
the canonical checkout instead of silently retrying another charge.

Payment evidence, amount/currency/environment checks, ownership, fulfillment
transaction, paid invoice/receipt creation and notification deduplication remain.
No live provider operations were performed during authoring. Simulations do not
prove real provider capture or webhook delivery.

### 2. Landing Team photographs
Both existing animated Team tracks now render eager images with the actual
marquee-card responsive size descriptor. Offscreen incoming cards begin requesting
their photos without a mouse hover. Existing original files, cropping, component,
animation, speed and styles remain. The browser can reuse identical clone URLs.
“Eager” is not a guarantee of zero network/decode time; missing source photos and
slow external storage still require real deployed checks.

### 3. Multiple Team categories
New validated `categories` array supports founder/faculty/board/core. The admin
add/edit form uses four checkboxes styled by the existing form classes. At least
one category is required; unknown or duplicate values are rejected. Existing
single-category records remain readable, and legacy single-category writes remain
compatible. Editing unrelated fields does not discard multiple categories.

Each selected public filter includes the member. “All” still lists each database
record once. Founder membership determines the first sort rank; core-only members
remain last. The public landing still allows member preview without authentication;
full Team navigation is still protected. Team categories are presentation groups,
not User authentication roles or administrator permissions.

### 4. GitHub CI and obsolete integration expectations
The uploaded final CI log did NOT show a Node engine failure. MongoDB disk space
was corrected by enlarging the isolated `/data/db` tmpfs from 512m to 2g. The
workflow now checks actual free space inside that filesystem (768 MiB floor);
MongoDB's own safety threshold is not disabled. The test database is still
loopback-bound, disposable and separate from Atlas.

Two real integration tests retained retired V48 requirements:
- The administrator helper required MFA setup even though the current API
  deliberately signs administrators in without a setup-only session.
- The certificate test required a review-acknowledgement checkbox despite that
  checkbox gate being removed from the approved workflow.

The rewritten tests actually authenticate both administrator portals, check the
independent HttpOnly session cookies and role boundaries, and verify retired MFA
routes cannot re-enable a setup gate. Certificate tests reject a stale attempt and
incorrect current password, then require successful issuance of the saved current
attempt without a separate checkbox. Assertions are not loosened to allow any
status, and authentication/issuance application code is unchanged.

The separate frontend replica-backed e2e test also now treats exact `/` as public
while requiring direct `/team` and other internal pages to redirect guests.

GitHub helper actions are checkout@v5/setup-node@v5, and runner OS is explicitly
ubuntu-24.04. The application test matrix STILL includes Node 22 and Node 24.
Action helper runtime is distinct from the Node version installed for the app.
No test is skipped to suppress a red result; no continue-on-error is added.
Broad runner SDK deletion is not used as a substitute for correctly sizing tmpfs.

## Executed checks in this environment

| Check | Observed outcome | Scope / evidence |
| --- | --- | --- |
| Backend unit/contract tests | 891 passed; 0 failed/cancelled/skipped | `qa/v60.14/backend-recheck.log`; stubs and controlled dependencies, not real MongoDB |
| Controlled frontend/reliability tests | 494 passed; 0 failed/cancelled/skipped | `qa/v60.14/frontend-recheck.log`; hooks, callbacks, source and local HTTP fixtures |
| Runtime/release tooling | 51 passed; 0 failed | `qa/v60.14/runtime-recheck.log`; executed on Node 22.16.0 |
| Protected source/CSS checker | 284 protected files + original CSS prefix; 0 differences | `qa/v60.14/ui-preserved.log` |
| Full existing stylesheet byte comparison | All 13 existing CSS files identical | `qa/v60.14/change-manifest.json` |
| Source/import validation | 132 TS/TSX, 176 backend JS, 330 relative imports; 0 errors | `qa/v60.14/source-recheck.log`; syntax/local resolution, not dependency types |
| Additional JS module syntax | Exit 0 | `qa/v60.14/script-syntax.log` |
| Workflow + Compose parse; embedded Bash | Valid; 9 shell steps parse with bash -n | `qa/v60.14/workflow-validation.json`; not a GitHub execution |
| Dependency install attempt | BLOCKED / failed | `qa/v60.14/dependency-install-attempt.log`; EAI_AGAIN registry.npmjs.org |
| Full app TypeScript / Next production build | NOT RUN for this update | Required after dependencies are installed |
| Fresh npm audit | NOT RUN for this update | No new “zero vulnerabilities” claim |
| Real MongoDB replica-set integration | NOT RUN here | Required in GitHub or an isolated Docker environment |
| Full Next/Playwright browser runs | NOT RUN here | 71 synthetic UI cases are declared, not reported passed |
| Actual payment/streaming/inbox/Hostinger | NOT RUN here | Requires provider/network/deployment acceptance |

New backend coverage includes provider identity mismatch, paid/processing refusal,
Stripe expiration with readback, capture uncertainty, lease semantics, authorized
replacement keys, category validation, sorting and legacy filters. Frontend
controlled tests exercise the actual checkout component callbacks, provider-switch
requests, safe return metadata, eager Team properties, the actual admin checkbox
callback/save path and public multi-category filtering.

The additional real Express/Mongo integration suite has controlled provider
responses only; it verifies database persistence, operation exclusion, repeated
release identities, old callback rejection and normal PayPal fulfillment. It has
been authored and syntax-checked, NOT executed here.

## What is unchanged
All dependency declarations/devDependencies/overrides/engines match V60.13.3.
No lockfiles or secrets were invented. Production authentication/session modules,
video player, original images, all CSS, footer component, certificate artwork/
renderer, student progress/assessment handlers and mail services are unchanged.
The version label is updated in root/backend/frontend manifests, health/startup
metadata and a legacy dashboard release label; this does not restore Business
Admin or change permissions.

Historical QA files remain for provenance. They describe their own older versions,
not a successful V60.14 full browser or deployment run. Use this report and the
current local guide for this release.

## Required acceptance before live release
1. `npm run verify:release` in the user's existing supported local runtime.
2. Both GitHub Node jobs, including real MongoDB integration and both browser stacks.
3. Manual guest Team preview, eager incoming photos, admin multi-category edit,
   every public filter, and unchanged video/auth/certificate behavior.
4. Both providers, both products, Back/Cancel, repeated provider switch, competing
   tabs, paid/processing/unknown states, owned invoices/access and exact email inbox.
5. Matching reviewed backend then frontend commit on temporary Hostinger domains,
   followed by sandbox webhook delivery/provider logs. Finish in-flight test
   checkouts before upgrading the payment services.
6. Only after those pass: reviewed final domains/HTTPS/live credentials/webhooks
   and separately authorized live acceptance. No secrets belong in the ZIP/chat.

Read `SINGH-ACADEMY-V60.14-LOCAL-GUIDE.md` for the exact commands and safe branch
workflow. A successful local fixture test is not a substitute for real CI or
provider acceptance.

## Fresh extracted-archive verification
The complete candidate ZIP was CRC-checked and freshly extracted. All 1,237
candidate entries were byte-compared with the authoring tree: zero differences.
Backend 891/891, controlled frontend 494/494, runtime tooling 51/51, source/import
validation and protected-file checks were then rerun from that extracted root;
every listed command exited 0. The final archive was rebuilt only to include this
record and the final logs. See `qa/v60.14/fresh-extract-check.json` and
`fresh-extract-*.log`. This does not change the full build/browser/Mongo/provider
verification boundary above.
