# V60.15.3 — complete local test sequence

Only upload-scanner support/configuration and related tests/documentation changed.
Start with UPLOADS-SETUP-V60.15.3.md for the required external account, privacy, limits
and Hostinger environment values. Do not buy a server or change Node for this update.

## Fresh folder

Extract SINGH-ACADEMY-V60.15.3-COMPLETE into a new directory. Preserve the working V60.15.2
folder/repo as a backup. Copy private backend/frontend env files and BOTH tested
package-lock.json files to the corresponding new locations. Do not copy old package.json,
source, .next, node_modules or generated reports. No credentials/lockfiles were invented
for the ZIP. All dependency declarations are unchanged; preserve the reviewed resolution.
Keep AUTH_SECRET and the exact database name unchanged. No reseed/reset/migration.

Configure the scanner in the private backend .env as described in the upload guide.
The default remains ClamAV for backward compatibility; select cloudmersive explicitly.
No public API key or frontend scanner configuration is needed.

## Checks, one command at a time

Stop manually started app/test servers. Leave Docker Desktop running.
From the project root:

```powershell
node -p "require('./package.json').version"
```

Required: 60.15.3. Keep the already-supported installed Node 22.x or 24.x.

```powershell
npm run verify:release
```

Only after PASS:

```powershell
Get-Content .\qa\release-checks.json
Get-Content .\qa\security-audit.json
```

The complete audit must report current-version success and zero known vulnerabilities
in all four scans. A failed network request or stale report is not a clean audit.
Full local release does NOT automatically contact the actual external upload scanner.

```powershell
npm run scan:check
npm run scan:check -- --remote --test-rejection
Get-Content .\qa\upload-scan-checks.json
```

Remote probes require a real configured key/private scanner, use only synthetic content
and may consume two metered calls. A pass from your PC is not Hostinger verification.

```powershell
npm run verify:integration
Get-Content .\qa\integration-checks.json
```

Expected declared test scope (not pre-claimed PASS): 12 model contracts, 88 counted real
MongoDB backend tests (77 prior + 11 scanner parent/subtests), 46 separate browser tests.
The local fixture UI suite remains 75 cases. Scanner integration uses local controlled
transport; no production database or actual scanner-account key is used by fixtures.
The original financial, ownership, resource-404, auth and certificate cases stay intact.

## Run the application manually after BOTH gates pass

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

Open http://localhost:3000 and test new uploads with small benign fixtures. Do not publish
real personal data to an external scanner before client privacy/processor approval.
A free scanner key cannot accept files beyond its actual free-plan limit.

## Deployment

Use existing Git history and the tested lockfiles. Never commit private .env files,
API credentials, node_modules, database backups or deployment-sensitive reports.
Run both GitHub Node jobs on the intended commit. Then follow the upload guide for
matching Hostinger versions, unchanged backend/frontend build settings, backend-only
scanner key, real uploaded-file acceptance, and final live-handover requirements.

Do not use npm audit fix --force, remove scanner tests, disable certificate verification,
or replace production code to force a passing report. Share the first actual error and
non-secret report if a gate fails. Earlier release reports are history, not current proof.
