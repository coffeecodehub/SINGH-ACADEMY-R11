# Singh Academy V60.14.1 — security update aur local testing

## Is release mein kya hai
V60.14 ke payment-provider switching, eager Team photos aur multi-category Team
features retained hain. Yeh targeted dependency-security update hai: backend
`dependencies.sharp` aur frontend `overrides.sharp` ab exact `0.35.5` hain.
Node engines ab bhi `22.x || 24.x`; Hostinger configuration, MFA retirement,
public UI, certificate, payment implementation aur database records unchanged.

**Status: candidate for complete local/CI/sandbox verification.** Authoring
container mein public npm registry DNS unavailable thi. Full patched build,
native Sharp 0.35.5 execution aur a fresh zero-vulnerability audit ka claim nahi.
Actual executed test evidence QA report mein hai.

## 1. Fresh folder open karo
ZIP extract karo; VS Code mein woh root kholo jahan `backend`, `frontend`,
`scripts` aur `package.json` directly hon:

```text
SINGH-ACADEMY-V60.14.1-COMPLETE
```
Purane development/test terminals `Ctrl+C` se stop karo.

Apne working V60.14 se sirf private configuration aur actual lockfiles same
relative locations par preserve/copy karo:

```text
backend/.env
frontend/.env.local   (ya aapki already-working frontend .env)
backend/package-lock.json
frontend/package-lock.json
```
Purane `package.json`, source files, workflow, `node_modules` ya `.next` is new
folder par copy MAT karo. Existing AUTH_SECRET, exact MongoDB database name,
SMTP credentials aur provider sandbox credentials preserve rakho.

Lockfiles delete karna, `npm audit fix --force`, Node reinstall, NVM, database
seed/reset ya migration required nahi hai. Source ZIP mein genuine registry
lockfiles fabricate nahi ki gayi hain; aapki actual locks npm se update hongi.

## 2. Ek complete verification command

```powershell
node -p "require('./package.json').version"
```
Expected: `60.14.1`.

```powershell
npm run verify:release
```

Iske waqt dev backend/frontend alag se start mat karo. Main command mein:
- Known Sharp security pins check.
- LOCAL copied old lockfiles ka backup, phir reviewed Sharp-only npm resolution.
  Non-Sharp locked versions/resolved artifacts mein unexpected change aaye to
  original lockfiles restore hongi aur command rukegi. Secrets edit nahi hote.
- Validated lockfiles se `npm ci`; failing `ci` par random install fallback nahi.
- Dono workspaces mein installed Sharp/libvips/librsvg identity aur actual raster
  resize/decoding smoke (PNG, JPEG, WebP, GIF) checks.
- Backend production/full + frontend production/full: fresh registry audit at
  EVERY severity. Network error ya incomplete JSON kabhi zero nahi count hota.
- Existing unit/reliability, original UI protection, TypeScript, Next production
  build, full 71-case synthetic UI browser suite, payment configuration aur SMTP
  authentication checks. Provider charge ya inbox delivery simulate nahi hoti.

Dedicated lock-update command bhi hai, lekin normal local `verify:release`
automatically yeh step karta hai:

```powershell
npm run deps:security
```

CI mein existing lockfile silently rewrite nahi hoti. Local approved locks ko
review karke Git mein commit karo; old `.35.4` locks wapas copy mat karo.

## 3. Reports ka matlab

```powershell
Get-Content .\qa\release-checks.json
Get-Content .\qa\security-dependencies.json
Get-Content .\qa\security-audit.json
```

Required results:
- `release-checks.json`: current `version: 60.14.1`, `status: passed`.
- `security-dependencies.json`: `status: passed`, both actual workspace Sharp
  instances `0.35.5`, compatible patched native libraries and transform results.
- `security-audit.json`: `status: passed`; ALL FOUR scans passed; every recorded
  vulnerability total is 0. Hashes identify the scanned lockfiles.

`manifest_only`, `not_run`, `failed` ya missing report ka matlab full verified
PASS nahi. A raw older report in historical `qa/v60.*` current result nahi hai.

Npm logs mein another advisory aaye to usay bypass mat karo. Pehla actual error
aur current non-secret report save karo. Report/trace share karte waqt `.env`,
live session cookies, secret keys ya customer payment data include mat karo.

**Zero means known advisories in a completed scan at that time. Unknown future
vulnerabilities, live checkout/webhooks and every browser condition ka absolute
guarantee nahi.**

## 4. PASS ke baad actual website run
Terminal 1, project root:

```powershell
npm run dev:backend
```

Terminal 2, same root:

```powershell
npm run dev:frontend
```

Open `http://localhost:3000`.

Terminal 3, dono servers running hon:

```powershell
npm run deploy:check -- --local --front http://localhost:3000 --api http://127.0.0.1:5000
```

Expected identities `60.14.1`; target `0 failed checks`.

## 5. GitHub aur temporary Hostinger acceptance
Existing Git clone mein reviewed source + both real updated lockfiles use karo.
Pehle separate `release/v60.14.1` branch/PR par verify karo, auto-deployed `main`
par unchecked push nahi. `.env` aur `backups/` Git mein add mat karo.

Both existing GitHub Node 22/24 jobs must pass. Local `verify:release` ka fixture
PASS replica-backed HTTP integration tests ka substitute nahi. GitHub workflow
already runs isolated `dev/test-mongo-compose.yml` with 2g temporary test storage,
real database tests, then both browser stacks. Production Atlas URI ko test URI
mein kabhi mat lagao.

Manual acceptance: guest member preview then Explore/login; Team filters and
multicategory add/edit; incoming photos without hover; Vimeo/YouTube lessons;
logout/back/refresh; actual sandbox course + membership purchase; Stripe to PayPal
and PayPal to Stripe after Back/Cancel; uncertain/processing payment protection;
one owned invoice/access/notification; two-student separation; certificate and
actual email inbox. Public webhook delivery needs the temporary deployed HTTPS
backend and provider delivery logs (local browser return alone is not proof).

**Hostinger par BOTH backend aur frontend update karni hain**, kyunki Sharp pin
both trees mein change hai. First matching backend, then matching frontend on
existing temporary apps. Keep existing working origins/secrets and sandbox keys.
Do not add live keys to debugging builds. Finish final-domain/HTTPS + provider
webhook/inbox acceptance before the separately approved live-key switch.

## Maintainer/registry references
- https://github.com/advisories/GHSA-wq5f-xc86-pv6w
- https://sharp.pixelplumbing.com/changelog/v0.35.5/
- https://docs.npmjs.com/cli/v11/commands/npm-ci/
- https://docs.npmjs.com/cli/v11/commands/npm-audit/
