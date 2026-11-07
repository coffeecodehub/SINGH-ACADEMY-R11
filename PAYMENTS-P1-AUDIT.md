# Singh Academy V60.15.3 — Payment Patch P1 Audit

## Release status and scope

**Candidate payment patch, with executed offline tests; NOT a live-payment approval or deployment certificate.** The code was changed in a copy of the supplied project. No Hostinger account, Stripe account, PayPal account, live database, DNS, CDN, or customer payment was modified from this session.

Inputs: `completproject singacademy.zip` plus `SinghAcademy-Source-20261016-011822.txt`. The ZIP became accessible again. All **426 exported source blocks** match the ZIP after normalizing newline/BOM/outer whitespace. The deliverable is built from the original ZIP, not from an incomplete reconstruction of the text export.

The inventory covers every retained original file. Syntax, import-resolution, TypeScript, and automated suites were run as reported below. Manual deep review concentrated on payment routes, provider adapters, checkout/fulfillment, cancellation and refund handling, environment validation, and their tests. This does **not** assert that every non-payment line received an exhaustive manual security audit.

The public UI, student UI, admin UI, CSS, images, templates, frontend package files and frontend configuration are unchanged. **451 frontend files/assets are SHA-256 byte-identical** to the input ZIP. Existing dependency versions and both package locks remain unchanged. No database schema or migration changed. Version strings stay `60.15.3` so no UI/version label needs modification; `PAYMENTS-P1` identifies this patch.

## Confirmed issues and changes

### 1. Readiness checking incorrectly depended on enabled sales

Original `gatewayConfiguration()` gates both providers on `ONLINE_PAYMENTS_ENABLED === 'true'`. Original `checkPayments.js` rejects OFF and skips remote provider checks when the gateway reports disabled. This prevented the intended workflow: check live credentials while public checkout is paused.

The new checker offers `--allow-disabled`. It validates a **copy** of the candidate configuration with the switch logically on, while leaving process/server state and Hostinger unchanged. Ordinary `payments:check` still reports OFF unless that readiness-only option is selected. `--live` refuses sandbox/test or review configuration. Explicit public HTTPS origin and local configuration errors are checked before remote calls.

### 2. Missing PayPal approval-reversal event

`CHECKOUT.PAYMENT-APPROVAL.REVERSED` is still present in PayPal's official event catalog documentation. The actual reason the client's dashboard omits it is **not established**. The event must not be declared retired, equivalent to `PAYMENT.CAPTURE.REVERSED`, or silently removed from the strict policy.

New diagnostics authenticate to the configured PayPal environment, read the exact configured Webhook ID, compare its URL, and fetch the official API event catalog. An explicitly authorized optional repair PATCHes only `/event_types` on that existing webhook. Existing event names/resource versions and URL/ID are preserved. A second pre-write read detects concurrent edits; a post-write read checks identity, retention, and complete coverage.

The API can accept a documented event omitted by the dashboard, but success is not guaranteed. If the catalog also omits it, the diagnostic explicitly says so; an operator can authorize one documented subscription request. Rejection or incomplete read-back stays FAIL. No automatic URL correction, new webhook, all-events subscription, or waiver is introduced. `PAYMENT.CAPTURE.DECLINED` remains an accepted equivalent for the older DENIED name.

### 3. Preserve original PayPal webhook bytes

Original PayPal route parsed JSON before signature postback. PayPal explicitly warns that parsing and re-serializing `webhook_event` can alter its format and fail verification. The route now uses a raw JSON buffer. UTF-8/JSON validity is checked; the exact incoming JSON text is embedded unchanged inside the verification envelope. The optional serialized-body path is restricted to the verification endpoint, not exposed to order creation.

A successful PayPal postback result is still required before the event handler runs. This change does not trust browser-supplied signatures, fetch arbitrary certificate URLs, or bypass provider verification. Stripe's existing raw-body/HMAC verification remains intact. PayPal 204 empty responses are accepted for the documented webhook update operation; safe provider error codes/debug references are retained without raw responses or keys.

### 4. Approval reversal needs a durable capture stop marker

Original reversal handling only set an unpaid local checkout status to cancelled. The PayPal capture path uses `cancelRequestedAt` to block capture, not that display status alone. A delayed approved notification could therefore enter capture processing again.

The patched reversal handler writes `cancelRequestedAt` first. It cancels an unpaid checkout directly only when no capture-attempt marker exists. If a capture may already be in flight, it reconciles with `capture:false` and refuses to advertise safe cancellation/replacement until a terminal outcome is confirmed. A still-uncertain outcome returns a retryable error and is not marked processed. Paid orders are not downgraded.

### 5. One-command local operator workflow

`npm run payments:live` checks the original UI baseline, installs **existing locked** backend dependencies when needed, runs the 50 new regression tests, prompts privately for six live values, and runs provider registration checks in a child process. It does not read/write the user's `.env`, open a database, run migrations, start a server, create/capture/refund an order, or activate Hostinger checkout. Only explicit PayPal repair consent permits an external configuration write.

Root `payments:check` now forwards CLI flags to the backend using `--`. The new script supports a sanitized JSON report and clear distinction between registration, signed delivery, and settlement. Stripe checking handles endpoint pagination and verifies that the live account reports charges enabled; endpoint listing still cannot authenticate the saved signing secret.

## Executed verification

Runtime: Node.js 22.16.0, Linux x64. Existing dependencies from the supplied Windows ZIP were used for portable JavaScript, TypeScript and schema tests. Native Windows modules were not falsely treated as Linux-compatible.

| Check | Actual result | Scope |
|---|---|---|
| Original backend suite | 1,035 pass, 0 fail | Baseline before patch |
| Patched backend suite | 1,085 pass, 0 fail, 0 skip | Includes 50 new payment regressions |
| Frontend reliability suite | 516 pass, 0 fail, 0 skip | Existing logic tests, not full real-browser UI acceptance |
| Runtime/tooling suite | 138 pass, 0 fail, 0 skip | Existing runtime/build tooling tests |
| Schema + local HTTP contract tests | 14 pass, 0 fail | Real Mongoose schema validation; real Express + Stripe SDK HMAC; PayPal external response mocked |
| Frontend TypeScript | PASS, exit 0 | Full `tsc --noEmit` |
| Source parser/import check | PASS, 0 errors | 135 TS/TSX, 205 backend JS, 333 relative frontend imports |
| Export vs ZIP source | 426/426 match | Source provenance, not runtime behavior |
| UI file hash comparison | 451 unchanged | Original frontend files/assets |
| Interactive wizard terminal check | PASS | Six synthetic hidden inputs; no echo, no `.env` rewrite, invalid input rejected before authentication |
| Full Next production build | BLOCKED / failed attempt | Missing Linux SWC; npm registry DNS lookup `EAI_AGAIN` |

The 50 new tests are **included** in the 1,085 backend total; do not add them a second time. Retried incomplete test invocations were not called PASS; table/logs refer to completed successful runs.

Not executed: fresh npm install/audit against the registry, full production Next build, full browser end-to-end acceptance, real Atlas transactions, real SMTP inbox delivery, real Stripe/PayPal API authentication with client credentials, actual provider-signed delivery to Hostinger, a live purchase, actual refund/dispute acceptance, or production deployment. Preserving dependency versions is not a current vulnerability clearance.

## Changed existing files (six)

- `package.json`
- `.gitignore`
- `backend/src/routes/gatewayWebhookRoutes.js`
- `backend/src/scripts/checkPayments.js`
- `backend/src/services/gatewayWebhooks.js`
- `backend/src/services/paymentProviders.js`

New implementation/test files: `backend/src/services/paymentReadiness.js`, `backend/src/utils/paymentWebhookPolicy.js`, `backend/test/payments-live-readiness.test.js`, `backend/test/payments-live-safety.test.js`, `backend/contract-tests/payment-webhook-http.test.js`, `scripts/payments-live.mjs`, `scripts/verify-payment-scope.mjs`, `docs/payment-ui-baseline.json`. New guides and current audit evidence accompany these files.

The only existing runtime request-path changes are the PayPal route, provider signature/postback support, and approval-reversal branch. Existing Stripe checkout, PayPal order creation/capture, course prices, invoices, membership terms, assessment/certificate/authentication logic, startup gate and scanner settings are otherwise unchanged.

## Cleanup and the migration files

**13,581 files** omitted from the distribution: 13,300 dependency/generated/build/backup files, 194 generated logs/cache files, 85 generated QA media/archive artifacts, and two private `.env` files. Original ZIP remains untouched. No actual environment values are reproduced in this report. Examples remain for documentation.

All **18 migration scripts** are retained. Their corresponding commands appear in the backend manifest; root commands also delegate to multiple migrations. `preflight`, `reconcilePayments`, admin recovery and notification-worker scripts have operational roles and are not disposable merely because they are old. No migration or admin reset was executed. Historical documentation/source fixtures remain for compatibility and provenance; old report claims are **not** evidence for this patch. Read this report for current results.

The cleaned package retains 1,122 original files (six modified) plus the new payment utilities/tests/guides/evidence. Both frontend/backend lockfiles are preserved. `node_modules`, build output and private environment files are not part of the delivered ZIP. Keep private local `.env` values locally; do not upload sandbox configuration over Hostinger.

## Boundaries / remaining behavior to verify

- **Fixed-term purchases, not automatic recurring billing.** Existing hosted Stripe mode is payment and PayPal uses CAPTURE. No recurring subscriptions were added. Courses and Academy membership retain their existing term/renewal rules.
- **Refunds/disputes.** Existing verified refunds update records; full refund revokes linked access, partial refund does not erase the full entitlement. Disputes and capture reversals create manual-review notifications rather than inventing a provider refund decision. These paths still need real sandbox/provider acceptance.
- **Admin review visibility limitation.** The existing Client Admin notification filter is certificate-focused and its UI action opens certificate review. Payment/dispute notification records exist, and purchase/subscription registers remain, but this patch does not certify those financial notices as visible through that notification tab. It does not redesign the UI. Until a separately scoped display change, monitor Stripe/PayPal dispute notifications in the provider dashboards.
- **Paused checkout is not an all-processing kill switch.** Previously created orders/webhooks may still need fulfillment/reconciliation. Avoid switching accounts/keys while orders are in flight.
- **Credential verification boundary.** A local API check uses the values entered locally, not a secret read-back from Hostinger. The operator must use exactly the saved live configuration. Listing a Stripe endpoint cannot prove `whsec` matches the deployed value. PayPal webhook lookup does not prove merchant-ID ownership; actual payee checks happen in order/evidence paths.
- **Hostinger client-IP/scanner warnings** are separate from this payment patch. No blind forwarded-header trust, scanner bypass, DNS/CDN change or security flag change was introduced.

## Activation and rollback

1. Extract as a fresh candidate and run `npm run payments:live`. Keep Hostinger `ONLINE_PAYMENTS_ENABLED=false`. No SSH or `.env` editing is needed for this command. It installs dependencies from preserved locks if missing.
2. Confirm only the intended PayPal webhook update when prompted. If the API rejects the event, keep the saved webhook intact and use the sanitized error/debug reference with PayPal support. Do not delete the event from the policy to force a green result.
3. Test the payment patch against a separate sandbox app/backend and staging database: successful course purchase and fixed-term membership, cancellation/decline, close browser before return, duplicate signed webhook, partial/full refund and concurrent approval/reversal. Do not mix live keys with sandbox DB/state for actual checkout. Do not point PayPal simulator mock events at the postback verifier as proof of success; mock postback is unsupported.
4. Secure a backup and the current healthy deployed commit/environment. Commit the six changed files plus the new payment files; preserve all frontend files and original locks. Deploy **backend application** with the existing root `backend` / current Node settings. GitHub-connected frontend auto-deployment may also react to a shared-repository commit; inspect the hosting rules rather than assuming it cannot redeploy. No frontend source edit is necessary. Do not use `git add .` blindly with private files.
5. Wait for deployment to complete, then require HTTPS readiness 200 with `ready:true`. A starting 503 can be transient, but repeated/lasting 503 requires runtime-log investigation and rollback rather than blind retries.
6. After provider/sandbox checks and merchant approval, explicitly set only the new-checkout switch to true in Hostinger, keeping both live provider credentials, live merchant ID, production stage and direct webhook origin. This command/package does not change Hostinger for you. Confirm public payment methods and a **genuine, client-authorized purchase** with actual provider notification, exactly one invoice/payment and the correct user's access/receipt. Do not use test cards in live mode or synthetic successful events to manufacture payment evidence. A real purchase charges real money.
7. On errors, pause new checkout again. Review the existing transaction before retrying; do not re-pay or erase financial records. If code rollback is needed, restore the known healthy commit with a coherent matching environment. Do not automatically revert provider keys or delete webhook histories while transactions remain unresolved.

## Official references consulted (16 October 2026 review)

These references explain provider behavior; they do not certify this installation.

- PayPal event names: https://developer.paypal.com/api/rest/webhooks/event-names/
- PayPal uncaptured/approval-reversal behavior and sample: https://developer.paypal.com/v5/checkout/uncaptured-payments
- PayPal API event catalog: https://developer.paypal.com/api/webhooks/v1/webhooks-event-types-list
- PayPal webhook update API: https://developer.paypal.com/api/webhooks/v1/webhooks-update
- PayPal raw-body postback and simulator limits: https://developer.paypal.com/api/rest/webhooks/rest/
- Stripe webhook verification: https://docs.stripe.com/webhooks
- Stripe checkout fulfillment: https://docs.stripe.com/checkout/fulfillment
- Stripe account retrieval: https://docs.stripe.com/api/accounts/retrieve
- Stripe webhook endpoint pagination: https://docs.stripe.com/api/webhook_endpoints/list

## Evidence locations

`qa/payments-p1/test-results.json` summarizes executed tests and unexecuted checks. Completed sanitized logs are under `qa/payments-p1/`. `docs/payment-release-manifest.json` maps original files to output hashes and lists cleanup categories. `docs/payment-ui-baseline.json` enables the one-command frontend-preservation gate.
