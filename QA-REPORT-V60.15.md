# Singh Academy V60.15.0 — actual QA and verification boundary

Recorded 2026-10-06. Input: Singh-Academy-V60.14.1.zip, SHA256 `518c794c9298943bca256bdffdda68991b9c9d4441b368ef9170107d8812fe4d`. No live accounts/hosting/customer database were connected or changed. No real provider charge/refund/email was initiated.

## Implemented changes (not a claim of live clearance)

| Audited behavior | Implementation | Regression evidence |
|---|---|---|
| Sandbox membership overwrites real course dates | Invoice-source course grants; membership remains independent Subscription; existing library rows preserved | Real source services in controlled unit regressions; new realMongo scenario added |
| Full refund/overlapping renewal access leakage | Per-invoice explicit intervals; active term union excludes revoked/full-credit invoices; original legitimate grants preserved | Original refund/checkout tests + new full/partial/older/newer term cases |
| Old missing-ID checkout permanently stuck | Persist exact creation body/key/account before POST; leased recovery; safe never-sent closure; bounded Stripe discovery; explicit operator reconciliation |21 recovery/provider-source tests, zero real provider calls |
| Contradictory deployment settings lower controls | Hosted/live predicates plus validator rejects incompatible stage/runtime; defensive Secure/currency/access/scanner policy | New environment/cookie/gateway regressions |
| Proxy-based guest rate-limit collisions | HMAC signed client attribution; strict trusted-edge opt-in; invalid/required proof rejected; diagnostic fingerprints |12 actual proxy-function Request/Response tests plus backend signature/rate tests; actual Hostinger edge NOT verified |
| Public assessment hash can reveal low-entropy answer | Public HMAC token; unchanged internal historical digest and revision checks | Dictionary probe negative; stale/raw tokens rejected; existing answer/cert tests retained |
| Ping is not unique-index proof | Read-only inventory + explicit additive preparation; hosted startup verifies critical indexes | Semantic index cases; actual database inventory NOT run here |
| Signup falsely labels email ownership verified | New public registration stores emailVerified:false, verification gate still off | Existing registration/notification tests retained; old metadata not rewritten |
| Local/CI coverage confusion | Separate explicit verify:integration, strict committed locks in CI, reports retain handoverReady:false | Tooling tests; real gates attempted but blocked here |
| Audit DNS failure handled as extra unexplained raw failure | One FOUR-scan structured audit;2 bounded transport retries; complete-report zero requirement | Transport/vulnerability/malformed-report negative tests |

## Executed, final results in this environment

Node22.16.0, npm10.9.2, Linux. These are real command results, not claimed Node24/Hostinger runs.

| Executed check | Result | Scope |
|---|---:|---|
| `node --test backend/test/*.test.js` |962 passed,0 failed,0 skipped | Actual source unit/controlled adapters, NOT a real database |
| `node --test frontend/test/*.test.mjs` |506 passed,0 failed,0 skipped | Controlled functions/contracts, NOT full Next browser rendering |
| `node --test scripts/test/*.test.mjs` |124 passed,0 failed,0 skipped | Runtime/security/release-tool behavior |
| `node scripts/check-release-ui.mjs` |284 protected checks PASS | Expected scope of the inherited protection manifest |
| Source syntax/import checker |132 TS/TSX,190 JS,330 imports,0 errors | Global TypeScript parser, NOT dependency-backed app typecheck |
| Original CSS comparison |13 files identical | Actual byte comparison |
| Public/backend asset comparison |253 files identical | Actual byte comparison |

No original source files were removed. The complete modified/added file list and hashes are in SOURCE-COMPARISON.json; exact textual diff is in SOURCE.patch.

## Attempts which DID NOT pass (retained as evidence)

1. Normal environment's `CI=true` release attempt correctly refused to invent missing committed lockfiles. The supplied archive did not contain actual npm lockfiles.
2. An explicit local-style attempt with CI unset reached npm resolution and failed `EAI_AGAIN registry.npmjs.org` for bcryptjs. Native binary installation, fresh real audits, app TypeScript/build and full browser gates therefore DID NOT run.
3. `npm run verify:integration` failed its Docker-availability prerequisite: Docker/mongod were not installed. It did NOT connect to production or claim real integration success.

The user's earlier log showed actual Sharp0.35.5/vips8.18.7 and a V60.14.1 build passing, then ENOTFOUND during audit. That evidence describes THAT run, not a new V60.15 full audit/build.

## Explicitly not verified

- Dependency lock resolutions/native Sharp binaries and fresh online vulnerability totals for this release.
- Complete application TypeScript/Next production build, Next browser suite and DB-backed frontend tests.
- New realMongo transactional integration cases and GitHub Node22/24 matrix.
- Actual Atlas unique/performance indexes, legacy customer invoice/access history and backup/restore.
- Real hosting edge IP sanitation, shared proxy identity configuration, actual load/performance.
- Actual Stripe/PayPal sandbox/live checkout, delayed/replayed webhooks, real refunds, receipt/access and inbox delivery.

## Deliberate safety boundaries, not silent "everything fixed" claims

Normal unpaid known-order provider switching remains available. An old/unidentified remote order or uncertain capture is not automatically forgotten. PayPal missing-ID CREATE replay defaults OFF until API/merchant retention is known. A guessed unbounded retry could charge twice; it is intentionally refused.

Ambiguous historical invoices are reported and do not receive invented lifetime access. Required database indexes may block a new hosted backend until reviewed/additively prepared. No destructive migration is supplied. Already-paid records should be assessed on a backed-up staging clone before promotion.

Trusted proxy attribution is implemented but deployment-dependent. A key without an actually sanitized edge IP header is not proof of a client address. The existing default fallback remains for local/staging compatibility; handover:check refuses readiness until proof enforcement is configured. Two-network and spoof-resistance hosting verification is mandatory.

New signup remains instant/noMFA/noemailverification; emailVerified is truthful for new records. Past ambiguous email flags are not bulk rewritten or treated as proof for new privileged features.

Historical version reports retained inside the archive are historical, not current evidence. Current local/CI reports overwrite their own filenames when YOU execute the gates. No 100% security, zero-unknown-vulnerability or live-approved claim is made.

## Official references reviewed

- Stripe idempotency: https://docs.stripe.com/api/idempotent_requests — exact-body/key consistency and >=24h pruning risk.
- PayPal idempotency: https://developer.paypal.com/api/rest/reference/idempotency/ — retention is API-specific, not guessed.
- Express proxy trust: https://expressjs.com/en/guide/behind-proxies/ — actual topology and header-overwrite requirements.
- npm audit: https://docs.npmjs.com/cli/v11/commands/npm-audit/ — advisory reports depend on registry response.
- Mongoose transactions: https://mongoosejs.com/docs/transactions.html — session operations inside a transaction are sequential.

See LOCAL-GUIDE.md for the exact release, integration, database and staging/handover steps.
