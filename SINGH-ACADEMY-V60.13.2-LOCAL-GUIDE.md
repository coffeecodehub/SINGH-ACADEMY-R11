# Singh Academy V60.13.2 — lesson origin gate and public team preview

## Only this requested scope

The supplied log points to LessonMedia.tsx sending to player.vimeo.com while the
iframe recipient is still localhost:3000. This update stops initial/early Play
messages until the correct iframe document has loaded or sent a verified player
message. A known origin is never replaced by `*`. Instagram embeds do not use
this Vimeo/YouTube command channel.

On the public `/` landing page, click a team-member card to open the existing
preview without signing in. Close/Escape stay on the landing page. The existing
Full faculty profile / Explore link opens `/team` through login when signed out.
Navbar links/direct `/team` remain protected. Other UI, images/header sizing,
footer, session behavior, payments and certificate theme remain unchanged.

## Non-destructive installation

Stop old frontend, backend and test terminals with Ctrl+C. Back up your working
folder/database. Extract the complete ZIP and open
`SINGH-ACADEMY-V60.13.2-COMPLETE` in VS Code (backend/frontend/scripts/package.json
must be directly inside the selected directory).

Preserve working backend/.env, frontend/.env.local (or your working frontend env
file), exact database name, stable AUTH_SECRET and tested backend/frontend
package-lock.json files. Do not copy node_modules or old build folders.
No migration, seed, reset, secret rotation, Node reinstall or NVM setup is needed.
The existing runtime policy accepts Node 22.x and 24.x; dependencies are unchanged.

## The same one-command verification

Run from the project root:

```powershell
node -p "require('./package.json').version"
npm run verify:release
```

Version must be `60.13.2`. This includes installation, preflight, controlled tests,
TypeScript/Next production build, audits, full browser suite, payment CONFIGURATION
and SMTP AUTHENTICATION. It stops on failure. The previous 54 browser cases remain,
with 5 new cases: **59 declared cases**. Do not run dev servers or another browser
stack while verification is running. Fixture ports 3108/5109 are not manual-app ports.

A PASS from V60.13.1 does not automatically verify this changed release.

If it fails, keep the first error and this report (do not send private .env):

```powershell
Get-Content .\qa\release-checks.json
```

Focused diagnosis only, after installation:

```powershell
npm --prefix frontend run test:ui -- media-images-v60-13.spec.ts player-preview-v60-13-2.spec.ts
```

This focused run is not a full release-gate pass.

## Run locally after verification passes

Retain these LOCAL frontend settings in the existing environment file:

```env
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=http://127.0.0.1:5000
```

Existing local backend environment, without replacing your other real credentials:

```env
NODE_ENV=development
DEPLOYMENT_STAGE=development
PORT=5000
FRONTEND_URL=http://localhost:3000
FRONTEND_URLS=http://localhost:3000
PUBLIC_API_URL=/api
```

Terminal 1:

```powershell
npm run dev:backend
```

Terminal 2:

```powershell
npm run dev:frontend
```

Terminal 3, while both remain running:

```powershell
npm run deploy:check -- --local --front http://localhost:3000 --api http://127.0.0.1:5000
```

Open `http://localhost:3000`, consistently using that frontend hostname.
Expected frontend/backend version: `60.13.2` and zero failed smoke checks.

## Actual acceptance (not synthetic tests)

1. Signed out: landing → team-member card → existing preview; no login yet.
   Close, Escape and reopening work. Full faculty profile/Explore → login with
   next=/team → successful login → Team. Direct /team must still require login.
2. Open a real Vimeo lesson on normal and slow network, click Play before it
   finishes loading, change lessons, and test Retry. No application-origin
   postMessage mismatch should be emitted. Pause/fullscreen/0-second newly
   opened lesson behavior must remain. Repeat YouTube and any Instagram lesson.
3. Review Console with Preserve log OFF between runs so old errors are not
   mistaken for current ones. Do not suppress warnings or disable protections.

Vimeo's third-party unload policy warning may remain. This update does not edit
Vimeo's vendor JavaScript, re-enable unload or hide browser logs. DevTools/Fast
Refresh messages come from development tooling. The native iframe origin fix is
separate from actual external-provider streaming/network performance.

Keep sandbox payment settings until real course/membership payment, webhook
DELIVERY, owned invoice/access/admin records and intended email INBOX checks pass.
No synthetic test settles real funds. Verify the same commit/lockfiles on the
actual Hostinger runtime; do not deploy localhost or fixture-only env values.
