# Singh Academy V60.15.1 — start-to-finish testing guide

## What this release does

This complete project corrects the invalid payment verification-source value in the V60.15 integration
fixture. It does NOT relax the production Payment schema. An early actual-Mongoose schema check and a
real-database rollback regression were added. Approved UI, Node policy and payment behavior are unchanged.
Read `QA-REPORT-V60.15.1.md` for results and limitations. Older version guides/reports are historical.

## 1. Prepare the NEW complete folder

Extract `Singh-Academy-V60.15.1.zip`. Open this root in VS Code:

```text
SINGH-ACADEMY-V60.15.1-COMPLETE
  backend/
  frontend/
  scripts/
  package.json
```

Keep your existing folder as a backup. From the working V60.15 folder copy ONLY:

- `backend/.env` and your existing frontend `.env` / `.env.local` files, retaining their exact locations.
- `backend/package-lock.json` and `frontend/package-lock.json` from the dependency tree you tested.

Do NOT copy the old package.json, source, scripts, workflows, node_modules or .next over the new release.
The archive has no private credentials or installed dependencies. Never upload secrets to chat or GitHub.
Keep AUTH_SECRET and the exact database name stable. No Node/NVM reinstall, Docker reconfiguration,
database reset, reseeding or migration is required **for this fixture fix**. V60.15's staging/index
preparation remains separately applicable before hosted deployment.

Stop manually running frontend/backend/test terminals with Ctrl+C. Leave Docker Desktop running.

## 2. Check the folder and registry

From the new project root, run commands individually:

```powershell
node -v
npm -v
node -p "require('./package.json').version"
```

Expected project version: **60.15.1**. Keep a supported installed Node 22.x or 24.x.

```powershell
Resolve-DnsName registry.npmjs.org
npm ping --fetch-retries=0
```

A successful ping only proves current registry reachability, not a vulnerability scan.
If DNS fails, stop and resolve that connection first. Do not turn off audits or use `npm audit fix --force`.

## 3. Full local release gate

```powershell
npm run verify:release
```

Do not start another frontend/backend while this is running. The command installs the locked dependencies,
checks local configuration, installed security versions, the NEW actual-Mongoose payment/fixture contracts,
four full/production dependency audits, controlled tests, protected assets, image/certificate checks,
TypeScript/build, 71 existing UI/browser fixture cases, payment configuration and SMTP authentication.
It remains fail-fast. It does not create a real charge, prove inbox delivery or run the real Docker DB suite.

The new schema checks run automatically. To rerun only them after dependencies are installed:

```powershell
npm run test:contracts
```

They should report **12 passed**. They validate actual Mongoose documents without opening a DB connection.

After the full local gate succeeds:

```powershell
Get-Content .\qa\release-checks.json
Get-Content .\qa\security-audit.json
```

Check the current version/time, final `status: passed` and all four audit totals. Old reports that were
included in earlier project archives are NOT approval of this release. The commands write fresh reports.

## 4. Real MongoDB + DB-backed browser gate

Docker Desktop should show Engine running. Normal terminal, project root:

```powershell
docker info
```

Do not start your normal backend/frontend during this gate: its browser stage owns localhost:5000/3000.
Port 27018 must be available for the temporary test MongoDB. Do not kill unknown processes automatically.

```powershell
Get-NetTCPConnection -LocalPort 27018 -ErrorAction SilentlyContinue
npm run verify:integration
```

The runner first executes the 12 schema contracts, starts a uniquely named local Compose project,
initializes the test replica set, checks the actual /data/db filesystem, runs all real backend integration
scenarios, then runs the DB-backed frontend browser checks. It cleans up its own temporary test container.
It does not use MONGODB_URI as a production fallback.

The backend integration total is now **77**: the original 76 counted tests plus one added invalid-source
rollback test. A negative test may intentionally log a rejected API response. Read the test result, not
just an isolated HTTP status. Expect the final `qa/integration-checks.json` status to be `passed` only
when ALL stages, including browser checks and cleanup, succeed.

```powershell
Get-Content .\qa\integration-checks.json
```

On any failure, stop there. Send the first error plus that report, without credentials. Do not widen the
Payment enum, skip tests, re-enable MFA or change Node to conceal a failed assertion.

## 5. Run the actual local website after both gates pass

Backend — Terminal 1:

```powershell
npm run dev:backend
```

Frontend — Terminal 2:

```powershell
npm run dev:frontend
```

Smoke — Terminal 3:

```powershell
npm run deploy:check -- --local --front http://localhost:3000 --api http://127.0.0.1:5000
```

Open `http://localhost:3000`. Confirm guest landing/team preview, protected-page redirect, login/logout,
course/lesson progress, videos, photos, Team category selections and certificate update with real data.
A guest catalog 401 is expected; a signed-in user losing access unexpectedly is not.

## 6. GitHub and staging (not live keys yet)

Use your connected repository in a new release branch, not a blind push to auto-deployed main.
Inspect `git status` and `git diff --cached`; stage only the new source/tests/docs and reviewed lockfiles.
Never stage .env files, backups, customer data or installed dependencies. Avoid creating a second
unconnected repository from the extracted ZIP by accident.

Run GitHub Node 22 and Node 24 jobs on the same commit and lockfiles. Both must pass, including actual
integration and DB-backed browser steps. Do not treat a workflow title or Node deprecation warning as
proof of the underlying failure; read the first failed command.

For staging, follow the inherited `LOCAL-GUIDE-V60.15.md` index/access-audit/trusted-proxy sections using a
backed-up staging database. Deploy matching backend then frontend to the temporary Hostinger apps.
Use Stripe TEST and PayPal SANDBOX. Test unpaid Back/Cancel switching both directions, delayed/replayed
callbacks, correct one-invoice/access ownership, overlapping grants/refunds, actual webhook delivery
and inbox receipt. Only then plan the final domain/live credentials and authorized live acceptance.

This correction does not change your existing live environment or automatically certify handover.
