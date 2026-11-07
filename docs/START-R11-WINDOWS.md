# R11: the six requested corrections

R11 updates an unchanged complete R10 into a separate folder. Keep the original R10 and its database. No seed, reset, migration, or payment-record/subscription edit is part of this update.

## Create the separate R11

Save the entire `Update-R11.ps1` into the existing R10 root. Run in PowerShell:

```powershell
Set-Location -LiteralPath "$env:USERPROFILE\SinghAcademyBuilds\SINGH-ACADEMY-R10"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-R11.ps1 -OutputDirectory "$env:USERPROFILE\SinghAcademyBuilds" -BuildName "SINGH-ACADEMY-R11"
```

The original folder is unchanged. Existing `backend/.env` and `frontend/.env.local` are copied only into the new local folder, after checking the clean ZIP. Private settings never enter the ZIP. If the output name already exists, use a fresh name and use that same folder name in subsequent commands.

## Install and normal local setup

Use Node.js 22 or 24. Stop the old local frontend/backend processes. Run each command separately and stop on any failure:

```powershell
Set-Location -LiteralPath "$env:USERPROFILE\SinghAcademyBuilds\SINGH-ACADEMY-R11"
npm.cmd --prefix backend ci --include=dev --include=optional
npm.cmd --prefix frontend ci --include=dev --include=optional
npm.cmd run setup
npm.cmd run db:check
```

Before setup, ensure the new LOCAL backend settings describe local development: `NODE_ENV=development`, `DEPLOYMENT_STAGE=development`, and loopback-only `FRONTEND_URL`/`FRONTEND_URLS` (normally `http://localhost:3000` and optionally `http://localhost:3001`). Preserve existing database/authentication/scanner secrets. The normal setup explicitly configures the requested local-only upload flag; no separate `uploads:local -- --apply` command is needed. Hosted/review/production uploads still require the real scanner.

The frontend local settings must be `NEXT_PUBLIC_API_URL=/api` and `API_PROXY_TARGET=http://localhost:5000`, so matching R11 code is tested on both sides. Do not accidentally keep the old hosted backend target for local acceptance.

## Tests and build before start

```powershell
npm.cmd run test:reliability
npm.cmd --prefix backend test
npm.cmd run test:runtime
npm.cmd run test:contracts
npm.cmd --prefix frontend run typecheck
npm.cmd run build
```

These commands do not need a customer-data reset. Database-writing integration/browser acceptance uses a separate guarded test database; never point it at customer data.

## Start and manually verify

Terminal 1, in R11:

```powershell
npm.cmd run dev:backend
```

Terminal 2:

```powershell
Invoke-RestMethod 'http://localhost:5000/api/health/ready'
```

Wait for `ready: True`, then in the R11 root:

```powershell
npm.cmd run dev:frontend
```

Open `http://localhost:3000`; Super Admin is `/super-admin/login` and Client Admin is `/admin/login`. Upload one image, one original review video and one course video. Review draft title/description must survive a failed upload, with a completed/error state rather than indefinite uploading. Verify muted inline previews before clicking (also with Windows animations off), viewport pause, 15–20-second restart, and explicit full playback with audio/controls. Verify the restored Carousel width/gap/crop and timed movement on desktop/mobile. Public review cards must not display technical preview labels. In a course checkout with an available section, verify the additional Full Section offer and the existing section checkout, including the owned-section case.

Development compilation is not a production-speed benchmark. Browser autoplay remains subject to browser/provider policy; do not promise playback for a provider that prohibits embedding or media access.

## Payments and deployment later

Use `docs/WEBHOOK-EVENTS-R11.md` for the environment checklist and authoritative webhook event lists. The configuration check is:

```powershell
npm.cmd run payments:check -- --allow-disabled --remote --strict-webhooks
```

No real keys belong in source, chat or the ZIP. This command does not create/capture a payment or prove delivery. Test real sandbox purchases and signed delivery with the matching hosted R11 frontend/backend after the owner configures sandbox keys. Do not switch the existing live site to sandbox as a shortcut. Production deployment remains a separate operator action; no deployment or real provider operation was performed in this update.
