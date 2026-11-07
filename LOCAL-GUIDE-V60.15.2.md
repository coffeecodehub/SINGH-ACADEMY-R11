# Singh Academy V60.15.2 — local testing to staging

## What changed

Only the retired `/free-resources` / `/resources` response path, related regression tests,
and the standalone startup of the DB-backed browser test stack were corrected. The
production financial/authentication logic and all existing public CSS/assets are preserved.

The old page files contained `notFound()` already. They are replaced by Route Handlers
outside the React layout/streaming path. Authenticated GET/HEAD requests receive 404;
guest requests still follow the existing login gate. Deep legacy links also end at 404.
The response is script-free, no-store/noindex and uses the existing status-page wording/styles.

## 1. Extract into a NEW directory

Open `SINGH-ACADEMY-V60.15.2-COMPLETE` in VS Code. It must directly contain:

```text
backend
frontend
scripts
package.json
```

Do not copy this on top of V60.15.1: old `page.tsx` files must NOT remain alongside the
replacement handlers. Keep the old working directory as your backup.

Copy from your working V60.15.1 folder into matching locations:

- `backend/.env` and your current frontend local env file(s).
- `backend/package-lock.json` and `frontend/package-lock.json` that passed your audits.

Do NOT copy old `package.json`, `.github`, source directories, `.next`, `.next-ui-tests`,
`node_modules` or generated test reports. This update does not change dependency versions.
Preserve the stable AUTH_SECRET. Do not paste secrets in chat or commit `.env` files.

No Node/Docker/WSL reinstall, new database migration, seed or reset is required for this
60.15.1 -> 60.15.2 correction. Prior V60.15 staging-index/access-history requirements still apply.

## 2. Verify project version

Stop ordinary backend/frontend dev servers. Keep Docker Desktop Engine running.
Run from the new project root:

```powershell
node -p "require('./package.json').version"
```

Required output: `60.15.2`.

## 3. Full LOCAL release gate

```powershell
npm run verify:release
```

This installs from reviewed locks and runs the existing configuration, model contracts,
unit/reliability, protected UI, build/type, native-image, four advisory scans, fixture browser,
payment-configuration and SMTP-connection checks. No real provider purchase is performed.
The fixture Next browser suite now contains 75 declared cases (71 original plus four
retired-route regressions). Do not skip a failing test or change an expected 404 to 200.

Only after final PASS:

```powershell
Get-Content .\qa\release-checks.json
Get-Content .\qa\security-audit.json
```

Both reports must identify `60.15.2`, have a fresh timestamp and `status: passed`.
The four completed advisory scans must each report total zero. A network failure or
an old report is NOT a zero-vulnerability result. `handoverReady: false` is expected:
local checks do not certify the deployed application or real external payment delivery.

## 4. Real isolated MongoDB + separate browser gate

Keep Docker running. Normal application servers on 3000/5000 must still be stopped.
Then run:

```powershell
npm run verify:integration
```

This command creates its own temporary local MongoDB replica set and cleans up that
test service at the end. It uses the explicitly isolated test database, not production Atlas.

Expected checkpoints, not a guarantee of the next run:

| Stage | Expected target |
|---|---:|
| Actual Mongoose fixture contracts | 12 pass |
| Real MongoDB backend HTTP/transaction suite | 77 pass |
| Separate Next/DB-backed browser suite | 46 pass |
| Final integration report | PASSED |

The old `/free-resources` test remains unchanged and still requires HTTP 404. Eight
additional cases cover both retired roots, query/trailing slash, old deep links, HEAD,
guest/invalid cookies and return navigation. The new cases reuse one freshly registered
read-only learner across isolated contexts so the real registration rate limit remains intact.

The launcher now starts the generated `.next/standalone/server.js` and stages required
assets. It never substitutes `next start` or disables the standalone build. A missing build
produces a clear rebuild instruction before the test stack starts.

After PASS:

```powershell
Get-Content .\qa\integration-checks.json
```

A backend `77 passed` message is not enough on its own: the browser stage and final
integration status must pass too. If any check fails, save the first error plus this report;
do not change Node, Atlas or production settings based only on an exit-code summary.

## 5. Manual local check, after BOTH automated gates pass

Terminal 1, project root:

```powershell
npm run dev:backend
```

Terminal 2, same root:

```powershell
npm run dev:frontend
```

Terminal 3:

```powershell
npm run deploy:check -- --local --front http://localhost:3000 --api http://127.0.0.1:5000
```

Check the normal landing/login/logout, public Team preview and selected categories.
While signed in, visit `/free-resources` and `/resources`: existing Page not found content,
real HTTP 404 and a working Return to Singh Academy link. The resource menu stays absent.
Normal course/team/payment/video/certificate pages should remain as before.

## 6. GitHub and temporary Hostinger

After local success, review the exact diff including BOTH deleted page.tsx files and
commit the same source plus reviewed lockfiles on a separate release branch first.
Do not auto-deploy an untested commit to the currently working site. Run both Node 22/24
CI jobs; they must pass using the same commit/locks. Node versions are not changed here.

Before updating a backed-up staging database, retain the read-only checks from V60.15:

```powershell
npm --prefix backend run db:check
npm --prefix backend run access:audit
```

Inspect missing-index/history reports rather than running blind reset/drop/migration commands.
Deploy matching backend then frontend to the temporary Hostinger apps. Verify hosted
version, readiness, login, guest protection, retired-page statuses, provider switching,
owned invoices/access, real signed sandbox webhooks and actual inbox delivery. Test
trusted client-address attribution on the real hosting edge. Only after these steps and
final domain/HTTPS checks should live credentials be configured and authorized live
acceptance performed. This route correction does not claim real payment acceptance.

## Honest scope of the supplied evidence

Available controlled suites, native helper HTTP checks and static Chromium layout
comparison ran in the authoring environment. Fresh Next build/browser/Mongoose/Mongo
and online npm audit did not run there: dependencies/registry and Docker were unavailable.
Your previous V60.15.1 reports are prior-version evidence, not a new candidate's PASS.
