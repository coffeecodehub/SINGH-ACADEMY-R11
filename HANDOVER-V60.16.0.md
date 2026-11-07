# Singh Academy 60.16.0 — implementation and handover

The current local correction round is **R3**; read `LOCAL-FIXES-R3.md` first. It
supersedes earlier descriptions of new Academy-wide membership sales, default
country pricing, repeated galleries and cancellation-only billing controls.

This is the complete project source, not a patch. Keep production credentials, databases and user uploads separate from the source archive. No live payment account, scanner subscription or hosting deployment was created by this work.

For the clean standalone ZIP and your own MongoDB/Atlas on Windows, use `START-HERE-WINDOWS.md`. That workflow requires no Git, GitHub clone, Docker or local MongoDB installation. `scripts/Package-Clean.ps1` creates another complete clean ZIP locally when needed. The clean package keeps the full reviewed source, original images, test helpers and selected small verification evidence; generated dependencies, build directories, private environment files and historical screenshots are omitted.

## Delivered workflow

1. **Sections → courses → lessons.** Both admin roles can create a section with title, description, original cover image, publication state and USD price options. Assign courses from the course editor. Students can explore a section, buy its complete access or choose an individual course. A section purchase unlocks only that section, including published courses added to it during the active paid term. Existing standalone purchases and Academy-wide memberships retain their independent access.
2. **Flexible access durations.** Admins configure total prices for any whole-number term from 1 to 120 months, such as 6, 9 or 12 months. Displayed prices are totals for the selected term. Recurring intervals support Stripe 1–36 months and PayPal Subscriptions 1–12 months; unsupported selected terms show the provider's reason. Longer configured terms remain available as explicitly one-time purchases.
3. **Single-use coupons.** Both admin roles can generate a secure code, choose 1–100 percent, select one course or section, set expiry and revoke unused codes. One global successful redemption is allowed. Reservations and settlement are transactional; another checkout cannot steal a reserved code. A safely closed unpaid checkout can release its reservation. Discounts apply to the first term only; renewal uses the clearly disclosed, undiscounted snapshot. A 100% code uses one-time access with a genuine zero-total invoice and no invented payment record or card charge.
4. **Account-country pricing.** Registration requires one of 249 ISO country/territory choices. Prices are exclusively administrator-entered; no automatic $5/$10 regional defaults exist. Blank country overrides inherit the admin-configured total. The server uses the saved account country, never a browser-supplied country or amount. Other countries' maps are not sent to students or public metadata. Client Admin can correct a student's country with password confirmation. A correction does not rewrite already-purchased prices or an existing renewal agreement.
5. **Founder and photographs.** The supplied Dr. Sukhsimranjit Singh biography is on About, with a compact founder introduction on landing/home, the personal website and Cross-Cultural Intelligence book information. All five photographs from Brazil and Ukraine Delegation are integrated across landing, home and About. Original bytes/resolution are retained; `docs/global-learning-images.json` records dimensions, archive provenance and SHA-256 values.
6. **Super-admin page sections.** The Page Sections editor creates and orders text, image, video and button sections with responsive layouts, alt text, original media uploads, drafts, publication and deletion. Published blocks appear once before the shared footer on supported content pages; custom pages use `/pages/<slug>`. Administrative, authentication and payment forms cannot be overwritten as CMS content. Concurrent saves use revision checks. Private learner files/receipts cannot become public through a CMS reference.
7. **Hardening and indexing.** Targeted dependency advisories were patched. Authentication/reset races, duplicate reviews, notification leases, upload cancellation, modal scrolling, reduced motion and production Docker/API routing were corrected. Metadata, protected-page noindex headers, robots and sitemap support are included. Public sitemap/canonical configuration needs the actual `PUBLIC_SITE_URL`; authenticated catalogue/learning pages intentionally remain protected. No claim of a universal security, SEO or performance score is made.
8. **Renewals and billing policy.** New checkout offers Stripe or PayPal automatic renewal for supported selected terms, with explicit consent and a visible renewal price. Verified Stripe invoices and completed PayPal subscription payments create independent idempotent paid-access grants. Eligible active one-time course/section purchases can authorize deferred renewal with $0 due now and a first charge at the existing contiguous paid-coverage end, within the application's 48-hour to 730-day window. Setup confirmation alone creates no new paid invoice, revenue or access. My Billing retains the paid period when renewal is disabled: Stripe uses provider-confirmed period-end cancellation; PayPal immediately requests SUSPEND for future collections. PayPal ACTIVATE requires fresh consent, the unchanged future billing date, zero arrears/failed payments and provider read-back; unsupported/ended schedules need a new consented checkout. Unapproved/uncertain PayPal subscriptions cannot be replaced until the provider confirms closure. Explicit one-time choices remain available. Purchases are non-refundable except where applicable law or provider rights require otherwise. Cancelling future renewal does not refund a paid term.

## Outstanding supplied content

- The **India & Kigali** archive exceeded the upload transfer tool's **32 MiB** limit. Reattach it in smaller parts to add those photographs. No placeholder photos were presented as those missing images.
- A specific **Shopify product URL** was not supplied. The book name and author link are present; no Shopify destination was invented. Super Admin can add the verified shop button using Page Sections when its URL is available.

## Fresh local development

Use the existing checkout in an isolated cloud task; do not create another worktree unless requested. Node 22 or 24 and a MongoDB replica set are required. This release was tested on Node 24.

```sh
npm --prefix backend ci --include=dev --include=optional
npm --prefix frontend ci --include=dev --include=optional
npm run setup
```

Setup generates local auth/admin secrets without printing them. Edit the ignored `backend/.env` locally to set your dedicated development MongoDB URI, for example a replica set named `rs0`. Keep frontend browser requests at `NEXT_PUBLIC_API_URL=/api`; the frontend server uses `API_PROXY_TARGET=http://localhost:5000` in local development.

Start separate terminal processes:

```sh
npm run dev:backend
npm run dev:frontend
```

The provided `dev/mongo-compose.yml` starts a local-only replica-set database. Initialize `rs0` and wait for a writable primary before using transactional features. In a constrained Docker environment, explicitly configure a suitable Mongo nofile limit; this cloud runtime required soft/hard 16384 for concurrent integration tests. Never expose this unauthenticated development database publicly.

Fresh admin setup and optional curriculum seed use the repository's existing commands:

```sh
npm --prefix backend run seed:admins
npm --prefix backend run seed:courses
```

Review target database and local private passwords before running seeds. The full 82-lesson dataset now validates before writing and each course commits atomically. Existing courses are preserved; see `docs/sections-regional-pricing.md` for explicit missing-content repair. No production seed or migration was executed during this work.

## Existing database upgrade

Back up and inspect the intended staging database first. Preserve existing .env values, uploads, users and financial records.

1. Resolve legacy duplicate reviews before adding the stronger unique index: follow `docs/review-index-migration.md`. Its initial inspection is read-only and never deletes records.
2. Inspect all required unique/TTL indexes with `npm --prefix backend run db:check`. After reviewing the target, add missing indexes with `npm --prefix backend run db:prepare -- --apply`; this tool does not drop indexes or reset financial data. Production startup verifies critical indexes.
3. Configure sections and country totals in the admin UI. Existing courses do not move into an invented section automatically. Assign them explicitly.
4. Correct legacy blank/non-ISO account countries through Client Admin before expecting a country override; otherwise the explicit administrator default remains the applicable fallback.
5. Retain payment/environment separation. Test records are not live collection evidence.

## Provider and hosting activation — required before live client acceptance

Supply real values securely in the deployment environment, not in chat, source, browser variables or this archive. Keep Stripe/PayPal/scanner/database/SMTP secrets backend-only. Configure actual HTTPS origins and review the same-origin proxy topology.

- Set MongoDB replica-set/Atlas access, auth secret, SMTP and sender, front-end origins, scanner configuration and any provider bindings required by your deployment. Upload scanning must remain fail-closed on hosted deployments. No provider plan or account was purchased.
- Configure actual backend `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` and PayPal client ID/secret/webhook ID, plus reachable signed webhook routes. This client requires both recurring providers; use `PAYMENTS_REQUIRE_BOTH=true` for that hosted target. `ONLINE_PAYMENTS_ENABLED` stays false until both are configured and accepted. Test/sandbox and live stages must not be mixed.
- The required Stripe webhook policy retains the existing events and additionally requires **invoice.paid**, **invoice.payment_failed**, **customer.subscription.updated**, and **customer.subscription.deleted**. Validate provider registration with the existing payment readiness tooling. Do not claim recurring billing is live solely because mocked/local tests pass.
- PayPal's current required webhook policy includes 19 Orders/capture/dispute, subscription lifecycle and `PAYMENT.SALE.*` events. Register and validate the complete policy; the earlier Orders-v2 event set alone is insufficient for subscription collections.
- Execute real test-account subscription checkout/deferred setup, signed renewal events, payment failure, duplicate events and both providers' renewal controls before going live. Confirm paid access dates and invoices through the deployed UI; test PayPal SUSPEND/eligible ACTIVATE and unresolved-approval handling separately from Stripe's period-end controls. Review statutory cancellation/refund obligations with the account owner.
- Set frontend server `PUBLIC_SITE_URL` to the exact HTTPS origin for canonical/social/sitemap metadata. Docker Compose derives it from reviewed `DOMAIN`. The Docker-only internal API exception permits only the fixed private backend service; it is not a general bypass of upstream validation.
- Run deployed smoke checks, real email delivery, scanner quota/size acceptance, backup/restore and hosting trust/client-IP checks. These external operations were not executed in the local implementation environment.

## Verification and release integrity

Actual results, counts and limits are in `QA-REPORT-V60.16.0.md`. Useful commands:

```sh
npm run check:runtime
npm run test:runtime
npm --prefix backend test
npm run test:reliability
npm --prefix backend run test:contracts
npm --prefix frontend run typecheck
npm run check:security
npm run audit:security
npm run check:release-ui
node scripts/verify-payment-scope.mjs
npm run verify
```

Real database tests require a dedicated `TEST_MONGODB_URI` explicitly ending in `_test`; the suite creates and cleans generated databases. Browser tests need the production build and project-compatible Chromium. This cloud run used an external config selecting installed Chromium because the browser download CDN is restricted. Standard local commands remain `npm run test:ui` and `npm --prefix frontend run test:browser` after installing the appropriate browser.

The 60.16.0 baseline is a strict, versioned snapshot of the user-authorized new flow, source/tests/configuration, documents and assets. Original artwork and original uploaded photograph hashes remain separately verified. Verification never regenerates or repairs a failed baseline automatically; any later legitimate source change requires a separate reviewed snapshot update.
