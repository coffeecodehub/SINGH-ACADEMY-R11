# Start the complete R10 project on Windows

Use Node.js 22 or 24. Keep the existing R9 folder and database. R10 changes do not require a new database, a seed, a data migration, or new environment-variable names.

## Create a separate local R10 from R9

Save the **complete single** `Update-R10.ps1` in the existing R9 project folder. It contains the full update payload; do not assemble the earlier R9 multipart snippets. Run this in PowerShell:

```powershell
Set-Location -LiteralPath "$env:USERPROFILE\SinghAcademyBuilds\SINGH-ACADEMY-R9"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-R10.ps1 -OutputDirectory "$env:USERPROFILE\SinghAcademyBuilds" -BuildName "SINGH-ACADEMY-R10"
```

The updater checks the complete original R9 release, creates a new complete folder and ZIP, and leaves R9 untouched. Generated Next declarations and additional local settings/caches do not enter the release. Existing `backend/.env` and `frontend/.env.local` are copied only to the new **local folder after ZIP verification**. The clean ZIP contains no private settings.

If `SINGH-ACADEMY-R10` or its ZIP already exists, use a fresh `-BuildName`; the updater will not overwrite it. A changed/missing original R9 release file is an error: use the complete original R9 folder, rather than deleting files to bypass its checks.

Alternatively, extract the complete clean R10 ZIP into a new folder. Transfer your existing private settings locally yourself; never publish them with the project.

## Install and run the checks first

```powershell
Set-Location -LiteralPath "$env:USERPROFILE\SinghAcademyBuilds\SINGH-ACADEMY-R10"
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
npm.cmd run setup
npm.cmd run db:check
npm.cmd run test:reliability
npm.cmd --prefix backend test
npm.cmd run test:contracts
npm.cmd --prefix frontend run typecheck
npm.cmd run build
```

`db:check` is read-only. Do not seed or automatically migrate your existing database. The integration/browser suites that create test data require a separate `TEST_MONGODB_URI`; follow `START-HERE-WINDOWS.md` before running them. Do not point a destructive test suite at customer data.

## Start both processes from R10

Stop your old local backend/frontend processes, then open two PowerShell terminals:

```powershell
# Terminal 1
Set-Location -LiteralPath "$env:USERPROFILE\SinghAcademyBuilds\SINGH-ACADEMY-R10"
npm.cmd run dev:backend
```

```powershell
# Terminal 2
Set-Location -LiteralPath "$env:USERPROFILE\SinghAcademyBuilds\SINGH-ACADEMY-R10"
npm.cmd run dev:frontend
```

Open `http://localhost:3000`. Verify that your frontend's existing `API_PROXY_TARGET` points to the backend you intend to test. A local R10 frontend pointed at the old deployed R9 backend cannot exercise the new backend access/date/webhook behavior.

Check a purchased section in Academy Plans, its included courses, My Billing expiry circles, public video previews and an admin Carousel. A full review opens the complete original; the inline preview loops its first 15–20 seconds. Review the exact changed files in `docs/SIX-TASK-CHANGES-R10.md` and measured speed results/hosting requirements in `docs/PERFORMANCE-R10.md`.

## Existing deployed payments

R10 is a local code delivery; it does not update your deployed server automatically. Deploy the matching frontend and backend through your existing reviewed workflow when ready. Keep existing settings and payment records. The final Stripe/PayPal event lists and current destination URLs are in `docs/WEBHOOK-EVENTS-R10.md`.

```powershell
npm.cmd run payments:check -- --allow-disabled --remote --strict-webhooks
```

That command checks configuration and provider registrations. It does not create a payment or prove a real signed webhook delivery. Test a sandbox purchase and its signed delivery against the matching deployed code before treating live payments as verified.
