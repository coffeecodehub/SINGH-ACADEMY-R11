# Singh Academy V60.15.0 — local, CI, staging and handover guide

This is a complete **source release candidate**, not a declaration that live payments/hosting are already verified. Original public UI/CSS, images, team multi-categories, video-player implementation and certificate artwork are preserved. MFA and email-verification gates remain retired.

## 1. Preserve your tested configuration and lockfiles

Extract `Singh-Academy-V60.15.zip`. Open `SINGH-ACADEMY-V60.15-COMPLETE` in VS Code: `backend`, `frontend`, `scripts`, and `package.json` must be directly inside the opened folder.

Copy only your private `backend/.env`, frontend `.env`/`.env.local` used by your working installation, and **both real `package-lock.json` files** from V60.14.1 into the same relative locations. Preserve the existing stable AUTH_SECRET and exact selected database name. Do not copy old package.json, old source/workflow files, node_modules or .next. Do not seed/reset/delete existing data. No Node reinstall or NVM is required: the declared Node22/24 policy is unchanged.

The input ZIP did not include real lockfiles. They have NOT been invented here. Locally the existing installer can resolve a fresh or specifically outdated Sharp tree using npm, but the actual reviewed lockfiles must be committed before CI. Existing patched 0.35.5 lockfiles should not need an unrelated dependency upgrade. Do not run `npm audit fix --force`, disable audit/TLS, or switch to an untrusted registry.

```powershell
node -v
node -p "require('./package.json').version"
```

The project version must be `60.15.0`.

## 2. Check the network that blocked your previous run

Your attached run stopped at `ENOTFOUND registry.npmjs.org`, after its tests/build/Sharp smoke. That is NOT a zero-vulnerability result. From PowerShell:

```powershell
Resolve-DnsName registry.npmjs.org
npm ping --fetch-retries=0
```

If either fails, fix the actual network/DNS/proxy/VPN connection (or use another trusted network) before retrying. The code cannot repair an unavailable external DNS resolver. Do not disable security checks to print a PASS.

## 3. Main local verification

Stop old app/test terminals. Use your local-development settings and sandbox credentials, not live keys.

```powershell
npm run verify:release
```

This installs from the actual locks, checks configuration/native Sharp, performs FOUR full/production audits at all severities, runs source/controlled tests, TypeScript/build, the fixture UI suite, payment configuration and SMTP authentication. An audit transport failure is retried at most twice; it still fails if no complete report arrives. A vulnerability finding is not treated as a transient transport error.

```powershell
Get-Content .\qa\release-checks.json
Get-Content .\qa\security-audit.json
```

Both must describe the current run and pass. The four audit reports must have valid zero totals. `handoverReady:false` in a local report is intentional: this command does not certify real database/provider/hosting acceptance.

## 4. Real MongoDB transactions + DB-backed browser checks

This closes the earlier local-versus-CI coverage gap. It is a SEPARATE command and must not be represented as included in the default local gate.

With Docker Desktop/Linux containers running, enough memory for the 2GiB-limited test tmpfs, and ports3000/5000/27018 unused:

```powershell
npm run verify:integration
Get-Content .\qa\integration-checks.json
```

The runner owns a unique temporary Compose project, initializes its local replica set, checks the actual `/data/db` filesystem, executes real backend HTTP/transaction tests and DB-backed browser tests, then removes only its own test containers/volumes. It never falls back to production MONGODB_URI. Payment evidence remains explicitly synthetic; no real Stripe/PayPal/SMTP calls are made by these cases.

If Docker is unavailable locally, do not pretend this gate passed: run the same real integration and browser steps in the included GitHub Node22/24 matrix instead. Both CI jobs must pass on the exact intended commit and committed lockfiles. Never point TEST_MONGODB_URI to your live Atlas database.

## 5. Inspect actual staging data and indexes BEFORE starting the updated hosted backend

Use a backed-up **staging/test database or deliberate test clone**, not guessed database names. The following commands use the database explicitly selected in backend/.env; inspect that privately before running. They do NOT print its URI/password.

```powershell
npm --prefix backend run db:check
npm --prefix backend run access:audit
```

Reports: `qa/database-indexes.json` and `qa/access-history.json`. These two commands are read-only: no seed, deletion, date repair or automatic index drop.

The new hosted server refuses to listen when critical uniqueness/TTL indexes are missing/conflicting. A health ping by itself is not an index inventory. If the report lists only reviewed missing indexes, after backup and review an authorized operator can explicitly ADD missing indexes:

```powershell
npm --prefix backend run db:prepare -- --apply
npm --prefix backend run db:check
```

The addition path refuses conflicting existing index options, stops on duplicate-key/build errors and never calls syncIndexes/dropIndex/deleteMany. A failed addition may leave earlier safe indexes added; read the report before retrying. Do not bypass this check or delete duplicate customer/payment records to get green.

Existing paid course rights are read from owned, fulfilled invoices rather than merged membership Enrollment dates. Legacy ambiguous invoices/orphan provider enrollments are reported for review, not converted into invented unlimited access. No broad data migration is run automatically. Already-issued certificates/answers are not rewritten. Review any `needs_review` result against the real invoice/provider history before handover.

## 6. Start and manually verify

Terminal1:
```powershell
npm run dev:backend
```
Terminal2:
```powershell
npm run dev:frontend
```
Terminal3:
```powershell
npm run deploy:check -- --local --front http://localhost:3000 --api http://127.0.0.1:5000
```

Expect current frontend/backend identity `60.15.0`; anonymous catalog401 remains expected, not an authenticated-session test. Check public landing/member preview, protected Explore, login/logout/Back/Refresh, team category filters, actual images/videos, free course Start, assessments/progress and existing certificate flow. CSS and original media were not redesigned.

## 7. New sandbox acceptance cases

Use a dedicated sandbox database/account and Stripe TEST/PayPal SANDBOX. Verify actual provider webhooks as well as browser return. Complete course + membership purchases on both providers, unpaid Back/Cancel switches BOTH directions, two-tab replay/duplicate protection, receipt/invoice/access/outbox/inbox ownership.

Access regressions: real-marked fixture course followed by sandbox membership must not extend the real course; overlapping individually paid periods retain separate invoice provenance; a full membership refund must remove only membership rights; refunding latest individual renewal retains valid original term; refunding an old term must not bridge a now-unpaid gap into a future renewal; partial refunds retain access under the existing policy. Exercise these as controlled sandbox scenarios, never by editing production monetary flags.

Unknown payment status is NOT permission to create another charge. Normal known unpaid orders can switch providers. A missing provider ID or uncertain capture keeps a stable checkout reference and explicit reconciliation message. This is intentional safety, not a promise to permit an arbitrary second payment.

### Recovery of a rare old/missing-reference checkout

Operators need the correct account/environment and local order ID. Defaults query provider truth and update local verified records; they are NOT a read-only database operation. No capture or create is performed by default.

```powershell
npm --prefix backend run payments:reconcile -- --order=ACTUAL_LOCAL_ORDER_ID
```

Where a verified existing remote reference is available:
```powershell
npm --prefix backend run payments:reconcile -- --order=ACTUAL_LOCAL_ORDER_ID --provider-order=ACTUAL_REMOTE_ORDER_ID --bind-verified-reference
```

The provider's amount/currency/order/owner identity must match before binding. For explicitly authorized missing-ID creation recovery within proven retention:
```powershell
npm --prefix backend run payments:reconcile -- --order=ACTUAL_LOCAL_ORDER_ID --recover-creation
```

Stripe uses the original persisted body/key/credential fingerprint within a conservative23-hour window. Older Stripe discovery is bounded and unfiltered by the application clock; truncated searches never prove absence. PayPal missing-ID CREATE replay defaults OFF (`PAYPAL_CREATE_REPLAY_SECONDS=0`): do not assume a retention period. Only set an explicit value<=18000 after confirming the actual merchant/API's idempotency contract. Known-order switching and ordinary first checkout do not need this setting. Unresolved identity/capture/retention must be reconciled, not erased from browser storage.

## 8. Push to a review branch, not automatic live main

Inside your EXISTING Git working copy, first create a release branch; then copy this release's source contents into it, preserving `.git`, private .env and your actual reviewed lockfiles.

```powershell
git switch -c release/v60.15-security
# Copy updated source into this working copy; complete local checks first.
git status
```

Before staging ensure `.env` files/secrets, private snapshots/backups and node_modules are ignored. Stage/review the intended source plus both actual lockfiles, commit, and push **the release branch**:

```powershell
git add .
git diff --cached --stat
git commit -m "Singh Academy V60.15 security and access corrections"
git push -u origin release/v60.15-security
```

Do not assume Hostinger waits for GitHub CI: auto-deployment of main can be independent. Keep the live main branch unchanged until both CI jobs and staging acceptance pass. This ZIP includes the2g test Compose settings and updated workflow; do not overwrite them with older versions.

## 9. Hostinger staging configuration and trusted client attribution

Hosted sandbox/review is **NODE_ENV=production + DEPLOYMENT_STAGE=review**, not NODE_ENV=development. Keep HTTPS exact frontend origins, same-origin browser `/api`, fixed server API_PROXY_TARGET, actual SMTP and stable AUTH_SECRET. Enable upload scanning with a real reachable scanner before enabling new uploaded files; the existing review-only all-uploads-disabled exception remains explicit. Live mode does not silently bypass the scanner.

The proxy fix needs evidence from YOUR hosting edge. Do not guess a header and do not blindly trust client-supplied X-Forwarded-For. Ask the host/operator which single-IP request header is overwritten by the trusted edge, and verify that direct client access cannot spoof/bypass it. If no trustworthy channel is available, provision a trusted edge/private upstream arrangement before live handover.

Only once verified, create a SEPARATE random proxy secret (not AUTH_SECRET, not a payment key); store it server-side on both apps. Example key generation locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Do not send this secret in chat/GitHub or any NEXT_PUBLIC_* variable.

Backend server:
```env
SA_PROXY_SHARED_SECRET=THE_SAME_PRIVATE_RANDOM_KEY
SA_REQUIRE_PROXY_IDENTITY=true
```
Frontend server:
```env
SA_PROXY_SHARED_SECRET=THE_SAME_PRIVATE_RANDOM_KEY
SA_PROXY_CLIENT_IP_HEADER=THE_ACTUALLY_VERIFIED_EDGE_HEADER
SA_PROXY_CLIENT_IP_VERIFIED=true
SA_REQUIRE_PROXY_IDENTITY=true
```

Set both sides consistently. A partially configured frontend refuses proxying with503, rather than signing spoofed IPs. Provider webhooks are deliberately outside this browser-proof middleware; their provider signatures are still required. Use authenticated Client Admin GET `/api/academy-admin/security/network` through the frontend from two real networks: `proxyVerified:true`, different hashed `networkFingerprint` values. Also verify a forged client edge header cannot change attribution. The response never prints the raw client IP.

On the selected hosted configuration/database:
```powershell
npm --prefix backend run handover:check
```

It checks configuration, required proxy proof, replica-set capability and actual indexes. Its `status:passed` is a readiness prerequisite; `handoverApproved:false` remains until external acceptance is recorded. Run access:audit against the SAME selected DB as well. The diagnostic CLI does not prove the host really sanitizes headers.

## 10. Promotion order

Back up/rehearse restore; review old access data; prepare approved additive indexes; deploy matching backend first, then frontend on temporary/staging apps using the SAME tested commit/locks. Verify health/build identities and deployed smoke, real two-network login, hosted images/videos, sandbox switching/settlement/refund/webhook/inbox and isolation. Only then attach the final frontend/backend HTTPS domains and configure matching live provider credentials/webhook identities. Do not mix test and live modes. An authorized controlled live acceptance must confirm provider event, one receipt/invoice, correct access and inbox before client handover.

A local PASS, an audit zero, or `ready:true` alone is not the final handover certificate. The generated reports explicitly distinguish these scopes.
