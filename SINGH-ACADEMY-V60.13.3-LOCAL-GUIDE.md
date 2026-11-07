# Singh Academy V60.13.3 — team-preview interaction correction

## What changed

The supplied V60.13.2 run passed 57 of 59 browser cases. The final two failed
before any preview click: `scrollIntoViewIfNeeded()` waited for an indefinitely
moving team card to become stable. Hover-to-pause happened only after that wait.

V60.13.3 changes that test interaction, not the website design or player code:
the stationary faculty rail is scrolled first. Desktop tests use the existing
hover pause, choose an actually hittable visible card and make a normal click.
The 390px test is now a real touch-enabled mobile context and uses a native tap
on the interior of the currently visible card, without requiring hover.

All 59 original browser cases and their meaningful assertions remain. No test
is skipped; no timeout is increased; no animations are disabled or force-clicks
introduced. User-visible application code is unchanged except release labels.

## Install the COMPLETE ZIP

1. Stop the old app and test terminals with Ctrl+C. Back up the working project.
2. Extract the ZIP. Open `SINGH-ACADEMY-V60.13.3-COMPLETE` in VS Code, where
   `backend`, `frontend`, `scripts`, and `package.json` appear directly.
3. Copy/preserve your existing private `backend/.env`, working frontend env
   file(s), and tested backend/frontend `package-lock.json` files at their same
   relative paths. Do not copy old source files over the new release.
4. Preserve the exact MongoDB database name and existing AUTH_SECRET. No
   migration, seed, database reset, new secret, NVM or Node reinstall is needed.
   The existing policy accepts Node 22.x and 24.x. Dependency declarations are
   unchanged; no new project dependency was added.

This archive does not contain your credentials or invented package locks.
Use a dedicated test database/accounts for real manual purchases/learning;
never replace a live database URI with fake values just to pass a check.

## One complete verification command

From the project root:

```powershell
node -p "require('./package.json').version"
npm run verify:release
```

Version must be `60.13.3`. The release gate installs dependencies, validates
configuration, executes unit/reliability checks, real types/build and audits,
installs Chromium, runs the full Next browser suite, checks payment
configuration, and checks SMTP authentication. It stops on the first failure.
Expect 59 declared browser cases, not a new expanding suite count.

Do not start development servers or a second browser test stack while the
release gate runs. Its fixture owns ports 3108/5109 and `.next-ui-tests`.
The regular app remains 3000/5000. Never deploy fixture environment variables,
fixture-only entry points, or the test ports to Hostinger.

After a completed or failed run, the saved report is:

```powershell
Get-Content .\qa\release-checks.json
```

That command only reads the report; it does not run tests.

If dependencies are already installed and a targeted rerun is needed:

```powershell
npm --prefix frontend run test:ui -- player-preview-v60-13-2.spec.ts
```

This runs the existing three player and two team-preview cases through the
actual Next test stack. It is diagnostic, not a replacement for the release gate.

## Run the normal local application after the gate passes

Keep the working local frontend settings:

```env
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=http://127.0.0.1:5000
```

In the existing backend environment, local connection settings remain:

```env
NODE_ENV=development
DEPLOYMENT_STAGE=development
PORT=5000
FRONTEND_URL=http://localhost:3000
FRONTEND_URLS=http://localhost:3000
PUBLIC_API_URL=/api
```

Do not replace the entire credentials file with those entries, and do not copy
localhost/development values into the public Hostinger deployment.

Terminal 1:

```powershell
npm run dev:backend
```

Terminal 2:

```powershell
npm run dev:frontend
```

Terminal 3, with both servers running:

```powershell
npm run deploy:check -- --local --front http://localhost:3000 --api http://127.0.0.1:5000
```

Open `http://localhost:3000`. The backend health and independent frontend
`/api/app-build` identity should both report 60.13.3.

## Real acceptance and Hostinger boundary

First check as a signed-out guest: landing -> team card -> preview with the
correct member -> Escape/Close -> reopen -> Full faculty profile/Explore ->
login -> requested Team page. Test touch on an actual mobile device too.

Keep the actual Vimeo/YouTube lesson check (early Play, lesson change, fullscreen
and zero start). The player readiness fix from V60.13.2 is unchanged. External
provider warnings and actual stream/network latency are not a promised zero.

Before handover, confirm actual Stripe TEST and PayPal SANDBOX course and
membership purchases, the correct owned invoice/access/admin records, provider
webhook delivery and intended email inbox. Synthetic payment tests and SMTP
login alone do not prove those. Do not repeat a purchase because confirmation
is slow. Preserve two-student separation and logout/Back/Refresh behavior.

Deploy the SAME tested commit and reviewed locks to the existing Hostinger
frontend and backend only after local and real sandbox acceptance. Validate
on the deployed runtime too. Do not delete/recreate websites or email mailboxes.
Do not put live secrets in chat or GitHub. Hostinger deployment and live provider
acceptance were not executed as part of this patch.

## Failure evidence

Keep the first error and report rather than resetting the database or skipping
the failing assertion. Synthetic browser artifacts can be zipped with:

```powershell
Compress-Archive -Path ".\frontend\test-results\*" -DestinationPath ".\V60.13.3-ui-failures.zip" -Force
```

Share fixture artifacts only, not .env, live cookies or real customer details.
