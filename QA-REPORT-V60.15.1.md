# Singh Academy V60.15.1 — QA report and verification boundary

## Scope and decision

Input: `Singh-Academy-V60.15.zip`; reported failure log: `Pasted text(20261006-193133).txt`.
This is a targeted integration-fixture/verification correction, not a production payment-policy or UI redesign.
No live database, hosting configuration, provider account, secret or customer record was accessed or changed.
This archive is a corrected candidate, NOT a live-payment clearance certificate.

## Root cause confirmed from log AND source

The uploaded run successfully started its Docker MongoDB replica set with a 2 GiB `/data/db` tmpfs.
The V47, V48 and V60.14 real-database suites completed successfully. The new V60.15 suite failed at
`Payment` document validation before eight financial/access scenarios could exercise their intended assertions.

`backend/integration/v60-15-security.test.js` called:

```js
fulfillOnlineOrder(order._id, evidence, 'integration_fixture')
```

`backend/src/models/Payment.js` allows exactly:

```js
['provider_webhook', 'provider_api', 'admin_recorded']
```

The service copies its third argument into `Payment.verificationSource`. The test-only label was therefore
invalid when actual Mongoose validation ran. The controlled in-memory tests did not exercise that validator.
The reported **9 failures** are **8 failed child tests plus their failed parent**, not nine distinct defects.
Nothing in this log establishes a Node incompatibility or a Docker fault after successful container startup.

## Correction

1. A shared, explicitly synthetic, test-only evidence helper uses `provider_api`, the existing service path
   already exercised by other integration tests. Synthetic identifiers and comments remain unmistakable.
   Calling this helper does NOT contact Stripe/PayPal or certify real provider verification.
2. The eight existing financial/access scenarios retain their assertions. Their settlement helper additionally
   verifies the persisted Payment's verification source, owner, test/live marker and provider payment ID.
3. A new real-database negative scenario supplies the old invalid value deliberately. It must be rejected;
   invoice/payment/enrollment/subscription writes and the user's commerce counter must roll back.
4. New `test:contracts` tests import the REAL Mongoose Payment and CheckoutOrder models and call
   `validateSync()` without connecting to MongoDB. They cover both providers, both modes, both product types,
   invalid verification source, invalid amount and missing owner. There are 12 declared schema cases.
5. `verify` (and therefore `verify:release`) now runs the actual schema-contract command after installed
   dependency checks and before audits/builds. `verify:integration` runs it before Docker startup.
   It is mandatory; missing dependencies or validation failures are not skipped or converted to success.
6. The current README/release pointer identifies V60.15.1 instead of older V60.14 instructions.

## Preserved boundaries

- Production Payment schema, settlement/refund/access logic and payment-provider adapters: unchanged.
- All original eight V60.15 financial regressions remain; no timeout increases or test skipping.
- Original 71 Next UI cases remain unchanged; no browser suite pass is inferred from that preservation.
- Approved styles, photographs, video player, public team preview, multi-category Team, header/footer,
  certificates, auth/MFA retirement: preserved. Only health/startup/admin version labels change.
- Dependency declarations/overrides and Node 22.x || 24.x policy: unchanged.
- Compose MongoDB 2 GiB tmpfs and GitHub Node 22/24 matrix: unchanged.

## Executed here

Environment: Node 22.16.0, npm 10.9.2, Linux. These results are not Node24/Windows/Hostinger runs.

| Check actually executed | Result | Scope |
|---|---:|---|
| Backend unit/controlled tests | 967 passed, 0 failed, 0 skipped | Includes 5 new helper/source checks; NOT real MongoDB |
| Frontend controlled/reliability tests | 506 passed, 0 failed, 0 skipped | NOT full Next browser rendering |
| Runtime/security/release tooling | 127 passed, 0 failed, 0 skipped | Includes 3 new mandatory-gate checks |
| Protected-file checker | 284 checks; 0 unexpected differences | Existing protection manifest |
| Syntax/relative imports | 132 TS/TSX files, 193 JS files, 330 imports; 0 errors | Global TypeScript parser, NOT app typecheck/build |

Package/byte-comparison results are in `SOURCE-COMPARISON.json` and `PACKAGE-CHECK.json` inside the evidence ZIP.
The final archive is freshly extracted and the available controlled suites are run again on that extraction.

## Attempts that did not complete

- Normal `verify:release` with CI unset reached dependency resolution and failed `EAI_AGAIN registry.npmjs.org`.
- `test:contracts` could not load Mongoose because dependencies could not be installed. The 12 REAL schema
  validation cases are added, but **not claimed passed here**. The separate source-level enum check is NOT
  a substitute for the real validator.
- `verify:integration` correctly stopped at that missing-dependency prerequisite. Docker/mongod are also
  unavailable in this environment. No database was contacted, and no real integration PASS is claimed.
- Fresh online audit, native Sharp check, full app TypeScript/Next build, full UI suite and DB-backed browser
  suite therefore were NOT executed here. Historical user results apply only to the user's recorded version/run.

Actual failure logs are retained in the evidence ZIP. No network/Docker limitation has been hidden by mocks
or a skip flag. No `0 vulnerabilities`, `77/77 integrations passed` or `100% secure` claim is made.

## Required local verification

1. Copy your private environment files and reviewed backend/frontend package-lock.json files into the new root.
2. Run `npm run verify:release` to install locked dependencies and execute the full local sequence.
3. With Docker running, run `npm run verify:integration`. Expect 12 schema-contract cases, then **77 backend
   integration tests including parent containers** (76 original total + 1 new rollback case), then DB-backed
   browser tests. A successful backend total alone is NOT the final gate; the browser stage must finish too.
4. Inspect current-version reports, then test the same commit/lockfiles on both GitHub Node jobs and staging.
5. Review inherited V60.15 database index/access-history/trusted-proxy requirements before hosted promotion.
6. Actual provider sandbox transactions, signed webhooks, invoice/access reconciliation and inbox delivery
   remain independent acceptance checks before live-money handover.

## References

Source-derived diagnosis is based on the supplied log and the packaged source diff.
External API semantics consulted: Mongoose 8 validation documentation,
https://mongoosejs.com/docs/8.x/docs/validation.html (enum, validateSync, pre-save validation).
