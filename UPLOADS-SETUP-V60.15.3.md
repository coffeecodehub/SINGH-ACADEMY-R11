# V60.15.3 — managed Hostinger uploads: A to Z

## What the update does

V60.15.2 deliberately rejected new uploads because UPLOADS_ENABLED=false and no
application-accessible ClamAV daemon was configured. This release adds **Cloudmersive
HTTPS Virus Scan** as a second backend scanner. It does not remove antivirus checks.
The existing private-network ClamAV option remains the default for compatibility.

The code is NOT an activated scanner account. An account owner must supply a real
Cloudmersive API key and sufficient plan capacity. No account was created, no plan
was bought, and no production/learner file was sent externally during development.

## 1. Account, cost, size and privacy — before enabling real user uploads

Open https://portal.cloudmersive.com/signup and create the account under the appropriate
client/business ownership. In the account portal open **API Keys** and obtain a key
that has access to the Virus Scan API. Review current terms before using the key.
Never send the key in chat, commit it to Git, or put it in any NEXT_PUBLIC_* variable.

Official small-business pricing reviewed on 7 October 2026 lists:

| Plan | Listed allowance | Suitability here |
|---|---|---|
| Free evaluation | 600 API calls/month; 1 call/second; 3.5 MB/file | Small-photo evaluation only, NOT unrestricted client handover |
| Basic | $19.99/month; 10,000 calls/month; 2 calls/second; 1 GB/file | Potential small-business production fit; confirm account eligibility and Virus Scan-specific limits |

Sources: https://cloudmersive.com/pricing-small-business and https://cloudmersive.com/pricing . The small-business category
is for organizations with fewer than 50 employees. Individual APIs can have their
own size, rate or response-time limits. Prices/terms are provider-controlled; confirm
with the provider before paying. A configured byte limit does NOT upgrade the plan.
Other APIs sharing the same account can also consume capacity. Quota/rate failure
rejects the upload; it does not silently disable scanning.

All newly scanned file BYTES go to Cloudmersive, including private assignments and
receipt screenshots. The adapter uses generic filenames and does not send account
cookies, student IDs/emails or MongoDB credentials, but the file itself can contain
personal information and original image metadata. The provider states its stateless
APIs do not retain payloads after the transaction completes. This is a provider policy,
not an independent guarantee. Have the client approve the processor, terms/DPA, region,
retention and applicable privacy notice before processing real private records.
This release does not silently rewrite the public privacy page.

Privacy references:
- https://cloudmersive.com/security
- https://cloudmersive.com/privacy-policy

## 2. Configure ONLY the backend

Keep the current working database, AUTH_SECRET, SMTP, payment credentials, origins,
Node version and frontend API_PROXY_TARGET. Do not paste/replace your entire environment.

For SMALL-FILE EVALUATION, set these individual backend variables:

```env
UPLOADS_ENABLED=true
UPLOAD_SCAN_REQUIRED=true
UPLOAD_SCAN_PROVIDER=cloudmersive
CLOUDMERSIVE_API_KEY=YOUR_REAL_CLOUDMERSIVE_API_KEY
CLOUDMERSIVE_MAX_FILE_BYTES=3500000
UPLOAD_SCAN_TIMEOUT_MS=120000
```

The placeholder above must be replaced locally/inside Hostinger, not committed.
With cloudmersive selected, CLAMAV_HOST/CLAMAV_PORT are not used; no VPS or clamd host
is required for this option. Do not supply a guessed IP, fake host or API URL in them.

**Free evaluation will reject a photo larger than 3.5 decimal MB.** The existing app
limits remain unchanged: images/receipts 10 MiB, assignments 20 MiB, general admin
uploads controlled by MAX_UPLOAD_MB (normally 250 MiB). The effective limit is the
LOWER of the application/purpose limit and the scanner-plan byte cap.

After confirming a paid plan/API allowance can scan files of the application's size,
this value covers the existing 250 MiB general admin limit:

```env
CLOUDMERSIVE_MAX_FILE_BYTES=262144000
```

Do not use that larger value on a free key. Large-file processing and Hostinger request
limits still need an actual representative upload test. No zero-millisecond promise.

Keep temporary hosted payment testing as it is:

```env
NODE_ENV=production
DEPLOYMENT_STAGE=review
```

Do not switch stage or Stripe/PayPal keys for this upload change. New uploads remain
OFF until the scanner account/configuration is ready. Existing media remains readable.

## 3. Test source and your actual scanner

Use the new full project in a fresh directory. Copy only the existing private env files
and tested backend/frontend package-lock.json files into matching positions. Do not
copy old source, node_modules, .next or .git over it. See LOCAL-GUIDE-V60.15.3.md.

```powershell
node -p "require('./package.json').version"
npm run verify:release
```

Expected version: 60.15.3. Stop on any failure; do not skip audit or weaken a test.

With the scanner variables configured in the PRIVATE backend/.env, run:

```powershell
npm run scan:check
npm run scan:check -- --remote --test-rejection
Get-Content .\qa\upload-scan-checks.json
```

The first command checks configuration only. The second explicitly sends two synthetic
probes: a tiny benign image and an inert standard antivirus-test marker. It uses provider
quota, never reads a user's files, never accesses Atlas, and removes its temporary files.
The marker is not executable malware. Only a real malware-rejection response counts;
401/429/timeout are NOT a successful negative test. A short spacing between the two
requests respects the evaluation plan's one-call-per-second limit, but does not reserve
capacity against other consumers of that account.

**Running this on your PC only verifies the PC-to-scanner path.** Hostinger-to-scanner
must still be tested by a fresh upload after deploying/configuring the backend.
There is no new public diagnostic endpoint, background probe or automatic metered scan
on startup or in the default CI/test suites.

Then, with Docker running:

```powershell
npm run verify:integration
Get-Content .\qa\integration-checks.json
```

The integration suite uses only a generated local test MongoDB. The new scanner HTTP
responses in CI/integration are explicitly LOCAL fixtures; external API keys are removed
from the test environment. No real quota is consumed by those fixture suites.

## 4. GitHub and Hostinger deployment

Retain the existing repo/history and reviewed lockfiles. Stage only intended source,
examples and tests; verify .env, installed dependencies, private backups and diagnostic
reports containing deployment details are not being committed. Do not force-push.
Both Node 22/24 quality jobs must pass on the same intended commit.

Backend Hostinger app:

```text
Root directory: backend
Node: existing 22.x
Build command: None
Package manager: npm
Output directory: blank
Entry file: src/server.js
```

Deploy the tested backend with the configured scanner variables. Do not use `npm run build`
for the Express backend: no backend build script was added. No database reset/migration.
The frontend contains only release-label changes plus the already-approved CI selector;
its design and upload controls remain unchanged. Use the matching release for version
checks and retain its existing Next build settings and two connection variables:

```env
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=https://navajowhite-lobster-767933.hostingersite.com
```

Do not put the scanner key in the frontend. Existing frontend/back URL values above are
from the user's current staging setup; substitute only if those actual apps change.

## 5. Hosted acceptance — this is what enables client handover

Check backend and frontend-proxied `/api/health` and `/api/health/ready`, then run:

```powershell
npm run deploy:check -- --front https://mediumspringgreen-cod-301282.hostingersite.com --api https://navajowhite-lobster-767933.hostingersite.com
```

Anonymous smoke success does NOT prove scanning. Log in as Client Admin and upload a
new, small, known-benign course-cover PNG/JPEG. Require `/api/admin/upload` HTTP 201,
then save the course and reopen it. Repeat with Team photo, a supported lesson PDF,
a student assignment attachment and a private payment screenshot using their correct
accounts/workflows. Verify that private files remain inaccessible to another student.
Try appropriate representative sizes on the subscribed plan; free evaluation cannot
validate 20/250 MiB upload promises. Test cancellation without leaving a public file.

Do not upload real malware. Use the explicit synthetic scanner CLI for the antivirus
negative test. Controlled tests already cover timeout, API error and malformed-result
rejection, but external service/account availability is a separate acceptance result.

Typical errors:

| API code | Meaning / action |
|---|---|
| UPLOADS_DISABLED | UPLOADS_ENABLED is still false; do not enable until scanner is ready |
| UPLOAD_SCAN_CONFIGURATION | Missing/invalid provider, key or numeric setting |
| UPLOAD_SCAN_AUTH | API account/key/plan refused; review provider account |
| UPLOAD_SCAN_SIZE | Scanner cap/plan too small; use smaller file or approved larger plan |
| UPLOAD_SCAN_BUSY | Provider rate/quota exhausted; wait/check capacity, not a bypass |
| UPLOAD_SCAN_TIMEOUT / UPLOAD_SCAN_UNAVAILABLE | No trustworthy result; upload is rejected |
| UPLOAD_INFECTED | Provider reported threats; file is not published |

The app never accepts a redirect/HTML page/202/pending result as a clean verdict. It
requires HTTP 200 JSON with CleanResult=true and no virus findings. TLS certificate
verification is enabled. Original bytes are streamed from private temp storage; no
public quarantine URL is created. Temporary files are removed on normal success/error/
client-disconnect paths. This is malware screening, NOT a guarantee that all active
content/unknown malware is safe and NOT content-disarm-and-reconstruction.

Only after actual upload acceptance, remaining trusted-proxy/stability/privacy checks,
sandbox payment/webhook/invoice/access/inbox acceptance and backup/restore review should
final live-payment credentials/domain handover proceed. This scanner update does not
certify those unrelated external steps.

## 6. Rollback

If external scanning becomes unavailable during REVIEW, keep data safe by setting
UPLOADS_ENABLED=false, and redeploy/restart the backend through the existing workflow.
Do not set UPLOAD_SCAN_REQUIRED=false while uploads stay enabled; no unscanned fallback
is provided. Existing images/media remain readable. Resolve account/network/capacity,
repeat positive/negative tests and re-enable only after valid scanning is available.

ClamAV remains available via UPLOAD_SCAN_PROVIDER=clamav with the real private scanner
host/port; it is not a fallback to use without provisioning a reachable private daemon.
