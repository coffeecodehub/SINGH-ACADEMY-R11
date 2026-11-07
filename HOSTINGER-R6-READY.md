# Singh Academy 60.16.0 R6 — Hostinger deployment readiness

This is a deployment runbook, not a deployment receipt. The confirmed public
domain is **singhacademy.com**. Hostinger access/plan, DNS/TLS routing, the backend
origin, Stripe, PayPal and the hosted upload scanner have not been configured or
verified in this work environment. No hosting purchase, DNS change, remote
deployment, provider transaction or Git operation has been performed. Local QA
results belong to the release QA report and do not establish hosted readiness.

Use the sealed complete R6 project, or the new folder produced by the R5-to-R6
offline builder after its final verification. Keep the existing 1131-file R5
folder as a backup. The offline builder creates a new local folder and ZIP; it
does not provision Hostinger, install dependencies or change a database. Private
settings belong in the new local folder or hosting secret settings, never the ZIP
or a chat message. `START-HERE-WINDOWS.md` remains the local installation guide.
Earlier Hostinger guides describe historical deployments and retired workflows.
Use `LOCAL-FIXES-R6.md` for the current behavior and `QA-REPORT-R6.md` for this
round's evidence. This runbook contains no new QA counts or hosted acceptance
claim.


## R6 acceptance additions

`npm.cmd run uploads:local` is a read-only local check;
`npm.cmd run uploads:local -- --apply` explicitly backs up and edits only local
upload settings. It requires development file/exported modes and loopback
frontend origins, rejects contradictory exported settings and refuses hosted
review/production rather than relabelling them. It preserves all provider,
authentication, SMTP and database secrets. Stop/restart the backend after applying.
This path does not scan local development media or provision a hosted scanner;
required hosted/review scanning remains. The offline updater/setup never runs it
automatically. See `LOCAL-FIXES-R6.md` and `START-HERE-WINDOWS.md` for exact scope.

Accept pending checkout continuation/cancellation against actual sandbox provider
state before live keys: pending is not paid, completed collection cannot be
reported cancelled and uncertain closure must remain pending. Finalized cards may
leave the current workspace while invoices/receipts/audit records remain.

Check confirmed save acknowledgement, automatic preview/full-viewer behavior,
hover/focus/reduced-motion carousel handling and responsive image frames. Browser
and Instagram policies still apply; image/network latency is not guaranteed in
microseconds. The two new hero replacements remain pending original image files.
Do not certify them from inline screenshots or substitute invented high resolution.

## Decisions and inputs still required

| Input | Needed before deployment |
| --- | --- |
| Hostinger product | VPS with Docker/SSH, or a managed Node.js plan supporting both applications below. The hosting type is still unconfirmed. |
| Exact origins | Public frontend: `https://singhacademy.com`. For managed split hosting, the actual backend HTTPS origin still needs confirmation. No `api.` subdomain is assumed. DNS/TLS routing must be verified on the selected host. |
| Authorized access | Owner-controlled hPanel/SSH access and the supported source-upload method. This workflow does not require GitHub. |
| Database | The intended Atlas/replica-set database, deployment network access, database user permissions, and a tested backup/restore procedure. Preserve the existing database name and authentication secrets when updating an existing site. |
| Mail | The actual SMTP service, sender mailbox/domain, private credentials and verified sending DNS. A development console preview is not inbox delivery. |
| Upload scanner | A reachable private ClamAV service or an owner-approved Cloudmersive account/plan with the required file-size, quota and privacy terms. No scanner subscription is supplied. |
| Payments | Owner-configured Stripe and PayPal accounts supporting the requested recurring flows, matching environment selection, webhook destinations and private credentials. R6 includes Stripe subscriptions and PayPal Subscriptions; actual merchant/provider acceptance remains unverified. |

Choose hosted **review** with test/sandbox payments before live production. Keep
`ONLINE_PAYMENTS_ENABLED=false` until the selected providers and signed webhook
delivery are accepted. This client requires both recurring providers; configure
both and use `PAYMENTS_REQUIRE_BOTH=true` for the hosted target. The existing
`payments:check` command audits both and does not certify partial configuration.

## Common application requirements

- Node.js **22.x** is the existing deployment target. The project also accepts
  24.x; use it on a host only after validating that same runtime and lockfiles.
- MongoDB must support transactions: Atlas, a replica set or a compatible sharded
  deployment. The development Mongo Compose file is not a production database
  deployment. Uploaded media is stored in GridFS; source-file backups do not back
  up database records or uploaded files.
- Review the R6 model/index report before using an existing database. The registered
  model set includes `User.deletedAt` and the `VideoReview` public-list index
  `{published:1, order:1, createdAt:-1}`. Run the read-only index check first;
  missing indexes do not authorize automatic preparation, seeding or schema sync.
- Browsers call same-origin `/api`. The frontend server proxies to the backend;
  browser database/provider/SMTP credentials are never needed.
- Both processes must remain running. The backend owns notification polling and
  incoming provider webhooks. Confirm the plan's restart/idle behavior and the
  operator's reconciliation/monitoring procedure.
- Confirm proxy upload-body limits, request duration, disk headroom, scanner
  capacity and simultaneous-transfer behavior. Trusted administrator media uses
  `ADMIN_MEDIA_MAX_UPLOAD_MB=0` by default (no application byte cap); the shipped
  Caddy configuration removes the old fixed 251 MiB/150-second request-header
  restriction. No product setting removes a managed platform's hard limit or
  purchases scanner capacity. Student/receipt limits remain separate.
- Disable shared/CDN caching for `/api/*`, authenticated pages and responses using
  session cookies. Verify the hosting edge overwrites the trusted client-IP
  header before configuring signed proxy identity. Keep database/scanner ports
  private and preserve signature verification and raw webhook request bodies.

## Path A — Hostinger VPS with Docker

The supplied `compose.production.yml` is this path. It runs Caddy, frontend,
backend and ClamAV. It does not create MongoDB. The service memory limits total
about 3.75 GiB before the operating system, image builds and other processes;
select capacity with headroom and validate actual usage rather than treating the
limits as a measured minimum or a purchased plan.

The VPS needs Docker Engine, Compose **v2.30+**, persistent storage, and access to
the configured database, SMTP and payment services. Caddy uses public TCP 80/443;
UDP 443 is optional HTTP/3. The frontend/backend/scanner are on internal Compose
networks. Do not publish ports 3000, 5000 or 3310 directly. Preserve Caddy TLS and
ClamAV definition volumes across updates.

Upload/extract the complete source using the owner's approved file-transfer
method into a new deployment directory. Keep the previous release available for
rollback. Configure `.env.deploy` with `DOMAIN=singhacademy.com` and create a private
`backend/.env.production`. Use restrictive permissions on these private files.

`npm run setup:production -- --domain=singhacademy.com` can create candidate
files from a configured `backend/.env`; it refuses to overwrite an existing
production file. Review the result: the helper copies the existing
`DEPLOYMENT_STAGE` and payment/scanner selections. Explicitly select `review` or
`production` to match the intended environment, and review
`PAYMENTS_REQUIRE_BOTH`. It does not validate credentials or deploy anything.

Only after configuration, database/index readiness, backups and deployment
authorization are complete, run from the uploaded project root:

```sh
docker compose --env-file .env.deploy -f compose.production.yml config --quiet
docker compose --env-file .env.deploy -f compose.production.yml build --pull
docker compose --env-file .env.deploy -f compose.production.yml run --rm --no-deps backend node src/scripts/preflight.js
docker compose --env-file .env.deploy -f compose.production.yml up -d
docker compose --env-file .env.deploy -f compose.production.yml ps
```

Review runtime logs locally if a service is unhealthy. Configuration-only
preflight does not prove database, scanner or SMTP connectivity. The Compose
frontend uses `API_PROXY_TARGET=http://backend:5000` with the explicit fixed
Docker-only exception. Keep this Docker setting inside this topology; managed
hosting uses the HTTPS backend origin instead.

Production containers are read-only and omit test tooling. Run report-writing
database/readiness tools from a private full-source operator/staging directory
with Node 22 and frozen backend dependencies, rather than assuming they can
write `qa/` inside a production container.

## Path B — Hostinger managed Node.js apps

Confirm the purchased plan supports **two** long-running Node applications,
HTTPS origins, server-side environment variables, outbound database/provider
access and the required upload limits. Confirm its source-ZIP/file-upload method
before proceeding. If that product only offers a Git integration, select an
owner-approved alternative delivery/hosting method; this runbook does not
authorize connecting a GitHub repository.

Upload the complete source, preserving its `backend` and `frontend` structure,
then select each app root. Do not upload Windows `node_modules` or build output;
install native dependencies on the Linux host from the supplied lockfiles.

| Setting | Backend app | Frontend app |
| --- | --- | --- |
| App root | `backend` | `frontend` |
| Runtime | Node 22.x | Node 22.x / supported Next.js preset |
| Install | `npm ci --omit=dev --include=optional` | `npm ci --include=dev --include=optional` |
| Build | No compilation step | `npm run build` |
| Start | `npm start` (`node src/server.js`) | `npm start` (`next start`) |
| Build output | None | `.next`, using the platform's Next.js preset |

Use the platform-provided `PORT`; do not replace it with a conflicting hard-coded
value. If the platform specifically requires the standalone Next entry instead
of its Next preset, deliver `.next/standalone/server.js` together with the matching
`.next/static` and `public` directories, as demonstrated by `frontend/Dockerfile`.
Preserve their relative paths and the runtime environment.

Frontend server settings:

```dotenv
NODE_ENV=production
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=https://YOUR_BACKEND_HOSTNAME
PUBLIC_SITE_URL=https://singhacademy.com
```

Set these before the frontend build/start. Keep local-test and Docker-internal
proxy exceptions unset. Provider, MongoDB, SMTP and authentication secrets belong
only in the backend. A separate `SA_PROXY_SHARED_SECRET`, if the verified edge
integration is enabled, is shared only by the frontend/backend servers and is
never a `NEXT_PUBLIC_*` variable.

Backend essentials, in private platform settings:

```dotenv
NODE_ENV=production
DEPLOYMENT_STAGE=review
FRONTEND_URL=https://singhacademy.com
FRONTEND_URLS=https://singhacademy.com
PUBLIC_API_URL=/api
PAYMENT_WEBHOOK_BASE_URL=https://YOUR_BACKEND_HOSTNAME
ONLINE_PAYMENTS_ENABLED=false
PAYMENTS_REQUIRE_BOTH=true
```

Also configure the actual MongoDB URI, stable authentication secret, SMTP values,
and upload policy from `backend/.env.example`. Exact origins have no paths,
wildcards or trailing slash. Existing authentication secrets are preserved during
an update. Student/admin sign-in uses email and password; retired historical MFA
setup instructions do not apply.

Managed Node does not start the Compose `scanner` service. Choose a real scanner:
`UPLOAD_SCAN_PROVIDER=cloudmersive` with its backend key and subscribed byte limit,
or `clamav` with an actually reachable private scanner host/port. Hosted uploads
require `UPLOAD_SCAN_REQUIRED=true`. Scanner account limits still apply;
removing a local product cap or changing an environment number does not upgrade
that account. Verify the actual file size and duration used in owner acceptance.
`ADMIN_MEDIA_MAX_UPLOAD_MB=0` disables only the administrator product byte cap.
A positive value is an explicit administrator-media ceiling. The copied legacy
Cloudmersive local byte hint does not cap administrator uploads in zero-cap mode;
the real provider must still accept and return a complete clean scan. Student
and receipt paths retain their configured limits and scanner protections. Keep
`MAX_CONCURRENT_UPLOADS` and storage/timeout headroom appropriate for the host.

Original administrator video duration is not restricted to preview length. Test
an original longer than 20 seconds and larger than the previous local hint, plus
real scanner rejection and provider quota/413 failure. Native uploads, YouTube,
Vimeo and supported TikTok players expose their preview/full playback controls.
Instagram uses an official embed; autoplay/seek behavior is provider-controlled.
Never describe an unsupported Instagram preview API as an application feature.

R6 adds public video-testimonial uploads through the admin Video reviews
workspace (`/api/admin/video-reviews/upload`). They require the same real scanner,
byte allowance, admission checks and reachable GridFS storage as other uploaded
media. Confirm a clean original video can be uploaded and played through public
range requests only after its review is published. Unpublished testimonial files
must stay private, and an arbitrary paid-course video must not become public by
being referenced as a testimonial. External embedded videos do not prove that
the hosted upload scanner works.

For an explicitly limited public review with no scanner, the supported profile
is `DEPLOYMENT_STAGE=review` and `UPLOADS_ENABLED=false`. New image, assignment,
receipt and video-testimonial uploads are then unavailable; existing media
remains readable. This is
not full upload acceptance or the live production configuration.

## Readiness and acceptance on the selected host

Keep private values in the host's secret settings or private files. The following
example commands use a private full-source operator directory with Node 22,
backend dependencies installed and a private, dotenv-compatible
`backend/.env.hosting-checks` containing the same selected host values. Quote
values containing `#` as required by dotenv/Node syntax. Compose's generated
`.env.production` uses **raw** syntax; do not parse that raw file with Node or
source it in a shell. On a hosting console that securely injects the actual app
environment, omit `--env-file` instead. Existing process variables take precedence
over a Node environment file, so use a clean operator session.

```sh
node --env-file=backend/.env.hosting-checks backend/src/scripts/preflight.js
node --env-file=backend/.env.hosting-checks backend/src/scripts/checkDatabase.js
node --env-file=backend/.env.hosting-checks backend/src/scripts/checkPayments.js --allow-disabled
node --env-file=backend/.env.hosting-checks backend/src/scripts/checkUploadScanner.js
```

These checks do not enable checkout or create a purchase. Missing indexes cause
the read-only database check to fail; review its report, confirm the intended
database and backup, then separately authorize additive index preparation with
`node --env-file=backend/.env.hosting-checks backend/src/scripts/checkDatabase.js --apply`.
From a locally configured full-source project the corresponding commands are
`npm run db:check`, then, only after review, `npm --prefix backend run db:prepare -- --apply`
(`npm.cmd` on Windows). This operation adds reviewed missing indexes; it does not
authorize dropping indexes or collections, `syncIndexes`, seeding, or replacing
customer data. Include the R6 `User.deletedAt` and `VideoReview` indexes in that
review. Preserve the database, GridFS uploads and financial records. Review any
historical migration separately.

After the owner configures real services, run the relevant external probes from
the selected host or a demonstrably equivalent environment. These are future
operator acceptance steps; none were executed for this readiness document:

```sh
node --env-file=backend/.env.hosting-checks backend/src/scripts/checkPayments.js --allow-disabled --remote --strict-webhooks
node --env-file=backend/.env.hosting-checks backend/src/scripts/checkUploadScanner.js --remote --test-rejection
node --env-file=backend/.env.hosting-checks backend/src/scripts/checkMail.js
```

The scanner probe sends two synthetic test files and uses provider quota. Payment
registration checks create no order/capture/refund, but they do not prove signed
webhook delivery. No webhook repair flag is included here. SMTP authentication
does not prove inbox delivery.

Register the selected backend HTTPS origin's `/api/payments/webhooks/stripe` and
`/api/payments/webhooks/paypal` in the matching provider environment. Preserve all
required events reported by `payments:check`; Stripe recurring settlement also
requires invoice-paid, invoice-failed and subscription-updated/deleted events.
The PayPal policy now contains **19 events**, retaining the Orders/capture/dispute
events and adding subscription lifecycle events plus `PAYMENT.SALE.COMPLETED`,
`PAYMENT.SALE.REFUNDED` and `PAYMENT.SALE.REVERSED`. Register those actual required
events and confirm signed delivery; Orders-v2 events alone do not cover PayPal
subscription collections.
An endpoint listing cannot validate its signing secret. Confirm an actual signed
test delivery and the saved invoice/access result before enabling checkout.

The optional owner-operated live-registration wizard is `npm.cmd run payments:live`
in an interactive Windows terminal (`npm run payments:live` on Linux). After
accounts are configured, it asks for the **actual HTTPS webhook origin**, or uses
an already exported `PAYMENT_WEBHOOK_BASE_URL`. For the one-origin VPS topology
that origin is `https://singhacademy.com`; for managed split hosting use the
confirmed backend origin. The wizard does not invent `api.singhacademy.com`.
Private values are entered without echo in the owner's terminal, not in chat.
It audits with checkout disabled in its own process; it does not change a running
site's settings, deploy, rewrite `.env` or create a transaction. An optional
provider webhook-event update requires its separate
explicit confirmation; a registration pass still does not prove signed delivery.

For an eligible active one-time course/section purchase, R6's **Set up automatic
renewal** flow takes **$0 today** and asks for consent to a Stripe or PayPal agreement whose
first charge is scheduled at the existing contiguous paid-coverage end. That end
must be 48 hours to 730 days ahead; a separate prepaid future term after a gap
blocks setup. Provider-confirmed setup does not create a paid local invoice,
revenue or a new access term. Accept the later signed paid invoice, failure
handling and provider-confirmed Enable/Disable actions in the test environment
before live operation. Stripe recurring terms support 1–36 months; PayPal
Subscriptions supports 1–12 months. Unsupported selected terms display a reason.
An expired purchase uses an ordinary new checkout with its displayed amount due.

PayPal Disable immediately requests **SUSPEND** and preserves already-paid
access. Enable requests **ACTIVATE** only after fresh consent, an unchanged
future billing date, zero arrears/failed payments and provider read-back. Stripe
uses confirmed period-end cancellation/resume for eligible agreements. Test both
semantics rather than assuming the providers use the same cancellation model.
For an already-disabled PayPal agreement, test **End this disabled agreement**
and its retry path. Provider-confirmed cancellation must retain paid access and
free the agreement for a new consented checkout, including after the old billing
date has elapsed.
An unapproved/uncertain PayPal subscription cannot be replaced until the provider
confirms closure, preventing an additional mandate while the first remains open.

R6's **Cancel subscription now** is a separate, provider-confirmed irreversible
cancellation action from Disable.
It ends only the selected agreement's rights and access granted by its canonical
linked original paid invoice. A one-time purchase cancellation ends only that
owned invoice's rights. Neither action issues a refund or revokes independent
course, section or legacy global coverage. Test these boundaries before hosted
acceptance; do not describe renewal-off as immediate access cancellation.

Student removal blocks access and revokes sessions first. Provider agreement
cancellation and safe pending-checkout closure must complete before the retained
financial/audit tombstone is finalized. Uncertain work stays pending for retry;
do not manually delete billing records to bypass it. Review current-revision text
moderation, filtered Excel-readable lead/data exports, published testimonial
previews/full playback and valid published Zoom webinar links in both admin roles.
Test R6's accessible acknowledgement/review/final-confirmation card before any
immediate cancellation request; closing the card must not mutate billing.

Publish a dated webinar to an isolated acceptance audience. Verify active
course/section and verified active paid legacy-member recipient selection,
the configured Singh Academy sender, explicit
timezone and Zoom details, durable retry and duplicate suppression, plus actual
SMTP inbox delivery. Worker fixtures are not actual delivered email. Exercise
optional gallery image slots and each available layout/position on desktop and
mobile, including replacing/cropping an existing image without shifting the theme.

After deployment and HTTPS routing are approved, run anonymous reads from the
full project root, substituting the actual origins:

```sh
npm run deploy:check -- --front https://singhacademy.com --api https://YOUR_BACKEND_HOSTNAME
npm run smoke -- --url=https://singhacademy.com
```

For the one-origin VPS topology, pass `https://singhacademy.com` to both
`deploy:check` arguments. Backend readiness must return HTTP 200 with `ready:true`;
an open HTTP port or `/api/health` alone is insufficient. Health version remains
`60.16.0`, so use the reviewed R6 artifact/source manifest to distinguish R6 from
earlier review rounds.

Complete signed-in student and both-admin acceptance, original-image/media
loading, upload clean/rejection/size tests, real test-recipient email delivery,
and provider sandbox purchase/failure/refund/duplicate-event tests. Where
recurring billing is supported, verify explicit consent, renewal invoices,
failed-payment behavior and Disable/eligible Enable actions. Rehearse restore
and rollback against the actual database/storage. Only those recorded outcomes
can approve a later live switch to `DEPLOYMENT_STAGE=production` and live keys.
