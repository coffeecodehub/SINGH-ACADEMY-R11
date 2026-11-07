# Singh Academy 60.16.0 — Windows PowerShell quickstart

To create another clean ZIP from this supplied project without GitHub, run
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Package-Clean.ps1`
from the project root. The policy setting applies only to that process. It writes
a timestamped ZIP beside your project folder and preserves your working files.
It packages the release inventory and small final QA summaries, excluding private
environment files, Git metadata, dependencies, build output and old screenshots.
Edits to existing release files are preserved with an integrity warning; newly
added files require a separately reviewed inventory update before packaging.

Use this complete ZIP directly. GitHub, Git, Docker and a local MongoDB installation
are not required when you use your own MongoDB Atlas cluster. Run commands from
the extracted project root, where `package.json`, `backend`, `frontend` and
`scripts` are present. Older version guides describe earlier releases; use this
guide for a fresh local installation and `HANDOVER-V60.16.0.md` for release details.

## 1. Extract and install the supplied dependencies

Keep your old working folder as a backup. Extract the ZIP into a new folder such
as `C:\Projects\SinghAcademy`. Do not copy old source, `node_modules` or `.next`
into it. Keep both supplied `package-lock.json` files.

Open PowerShell in the new project root:

```powershell
Set-Location 'C:\Projects\SinghAcademy'
node --version
npm.cmd --version
node -p "require('./package.json').version"
```

Use **Node.js 22.x or 24.x**. The project version should be **60.16.0**.
The commands below use `npm.cmd` to work even when PowerShell blocks `npm.ps1`;
you do not need to change your execution policy. Run commands individually and
stop if a command fails.

```powershell
npm.cmd --prefix backend ci --include=dev --include=optional
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }

npm.cmd --prefix frontend ci --include=dev --include=optional
if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }

npm.cmd run setup
if ($LASTEXITCODE -ne 0) { throw 'Local environment setup failed.' }
```

`ci` installs the exact supplied dependency resolution. Do not delete or regenerate
the lockfiles, use `npm audit fix --force`, or substitute `install:all` or
`verify:release` here: those installation workflows can refresh lockfiles.
Use this guide for the complete installation and database sequence.

`setup` creates `backend/.env` and `frontend/.env.local` if needed, generates
missing authentication/admin secrets, and preserves existing non-placeholder
credentials. Keep these private files and setup backups on your own computer.

## 2. Configure your own Atlas development database

In your Atlas account:

1. Use a development cluster/database, separate from live customer data.
2. Create a **database user** with permission to read/write and create indexes in
   that development database. Your Atlas website login is not the database user.
3. Add your computer's current public IP under Atlas Network Access. Update it
   when your public IP changes.
4. Copy the Node.js/Drivers connection string. Replace its database-user/password
   placeholders and explicitly name your development database, such as
   `sa_local_dev`, before the `?` query string. Preserve Atlas's connection options.
   Percent-encode special characters in the username/password.

Atlas supports the transactions this application needs. If you use your own
non-Atlas MongoDB server instead, it must be a replica set, not a standalone
MongoDB instance.

Open the generated files locally:

```powershell
notepad .\backend\.env
notepad .\frontend\.env.local
```

In `backend/.env`, replace `MONGODB_URI` with your private Atlas URI. Review the
generated admin email/password values; these are the credentials the seed command
will use. Keep these local-development settings:

```dotenv
NODE_ENV=development
DEPLOYMENT_STAGE=development
PORT=5000
FRONTEND_URL=http://localhost:3000
FRONTEND_URLS=http://localhost:3000,http://localhost:3001
PUBLIC_API_URL=/api
ONLINE_PAYMENTS_ENABLED=false
UPLOAD_SCAN_REQUIRED=false
SMTP_HOST=
```

Preserve the generated `AUTH_SECRET`, `CLIENT_ADMIN_PASSWORD` and
`SUPER_ADMIN_PASSWORD`. You may choose your own `CLIENT_ADMIN_EMAIL` and
`SUPER_ADMIN_EMAIL`; use different email addresses for the two roles. Keep secret
values only in the backend environment, never in the frontend or screenshots.

In `frontend/.env.local`, keep:

```dotenv
NEXT_PUBLIC_API_URL=/api
API_PROXY_TARGET=http://localhost:5000
```

Keep optional trusted-proxy variables unset for this local setup. Use a fresh
PowerShell terminal without old exported `MONGODB_URI`, `NODE_ENV` or proxy settings:
existing process environment variables can override values in `.env` files.

With no SMTP host, development emails appear as **local previews in the backend
terminal**; they are not delivered to an inbox. Online payments remain disabled.
Real SMTP, Stripe/PayPal, public webhooks and hosted upload scanning are separate
operator configuration and acceptance steps in the handover guide.

### Current image delivery

The supplied Landing group and Home whiteboard originals are already embedded
and directly configured in the R8 source. There is no photo-picker/import command
in setup. Install, configure and run this project normally. Both original JPEGs
are byte-preserved; responsive display copies and original high-DPR sources are
bundled. Existing CMS editing remains available for later authorized changes.

### R6 local video upload troubleshooting: 503

A 503 from `/api/admin/video-reviews/upload` does not mean the video exceeded
10–20 seconds. That is only preview length. Read the upload error card's returned
reason code/request ID and service-status message. Scanner configuration,
authentication, availability, timeout or an explicit uploads-disabled setting may
cause failure; configuration status alone does not prove scanner reachability.

For your own original files on **localhost development only**, R6 provides an
explicit helper. Use the **new R6 folder**, stop the old backend with Ctrl+C, and
run setup first if `backend/.env` has not been created. Then run:

```powershell
npm.cmd run uploads:local
npm.cmd run uploads:local -- --apply
npm.cmd run dev:backend
```

The first command checks read-only. When changing settings, `--apply` takes a private
`.env.uploads-local-backup-*`, enables local uploads with no administrator byte
cap, selects the existing local `clamav`/blank-host non-required-scanning path,
and preserves database/authentication/SMTP/scanner secrets. Your development
files still receive type/signature checks but are not malware-scanned in that
explicit local mode. The updater/setup does not select this mode automatically.

The helper refuses hosted/test/review/production modes, non-loopback frontend
origins and conflicting exported settings. It does not relabel a deployment or
buy external capacity. If old terminal environment variables override the file,
use a fresh PowerShell terminal. Restart the backend after applying settings.
Before hosting, configure an adequate reachable real scanner; required hosted
scanning cannot use this local bypass. Existing active keys are retained and
never need to be pasted into chat.

### R5 local upload troubleshooting: scanner 413

The old 10–20-second field is only a preview setting; source-video duration is
not capped by it. `ADMIN_MEDIA_MAX_UPLOAD_MB=0` is already the R5 default, even
when this new variable is absent from your preserved R4 `backend/.env`. Do not
raise a Cloudmersive plan number or delete its key to make an upload appear valid.
The old local Cloudmersive byte hint no longer rejects administrator media in
zero-cap mode, but a **real Cloudmersive 413** still means the provider/account
will not accept that file. Changing the application cannot upgrade that plan.

For **local development on localhost only**, the existing unscanned-development
path can be selected to test your own original media without a scanner service.
This is not the hosted review or production upload configuration. Stop the backend
with Ctrl+C, open its private file locally, and change only these settings:

```powershell
notepad .\backend\.env
```

```dotenv
NODE_ENV=development
DEPLOYMENT_STAGE=development
UPLOAD_SCAN_PROVIDER=clamav
CLAMAV_HOST=
UPLOAD_SCAN_REQUIRED=false
```

Save the file and restart the backend from the project root:

```powershell
npm.cmd run dev:backend
```

Keep the existing `CLOUDMERSIVE_API_KEY`, database URI and authentication secrets
unchanged; they are unused by this local ClamAV/no-host development path. If an
older terminal exported environment variables, open a fresh terminal so they do
not override the file. No script changes your private settings automatically.
Before hosting, configure a real reachable ClamAV service or an adequate paid
Cloudmersive plan, and keep required scanning enabled. Hosted stages enforce
scanning; do not reuse this local-only recipe to bypass it.

### Webinar emails need real SMTP

Without `SMTP_HOST`, development webinar messages are backend-console previews,
not emails in a student's inbox. For actual delivery, configure `SMTP_HOST`,
`SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM` privately using
your mail provider's actual settings. `EMAIL_FROM` should identify Singh Academy
and an authorized sender address; each recipient is the student's saved account
email. Do not use the student's email as the sender or paste credentials in chat.
Restart the backend after changing mail settings. You can check connection and
authentication with:

```powershell
npm.cmd --prefix backend run mail:verify
```

That check is not proof of inbox delivery. Test a webinar announcement with
eligible test recipients, confirm the date/time/details/Zoom link in their inbox,
and verify the notification worker is running before hosted acceptance.

## 3. Prepare indexes and optionally seed a brand-new database

From the project root, inspect the database first:

```powershell
npm.cmd run db:check
```

This command does not change the database. On a fresh database it normally prints
`status: failed` with missing indexes and exits **1**. That is different from an
Atlas authentication, IP-access or connection failure. Review the output and
`qa/database-indexes.json` to distinguish them.

For missing indexes in your selected development database:

```powershell
npm.cmd --prefix backend run db:prepare -- --apply
if ($LASTEXITCODE -ne 0) { throw 'Index preparation failed; inspect the report.' }

npm.cmd run db:check
if ($LASTEXITCODE -ne 0) { throw 'Required database indexes are still missing.' }
```

Preparation adds missing indexes. It stops on conflicting indexes or an index
build failure; it does not drop indexes or delete records. Resolve a reported
conflict before continuing. Use the direct backend command shown above so
`--apply` reaches the database script through npm.

**Only for a brand-new local development database**, create your two admin
accounts and the supplied course curriculum:

```powershell
npm.cmd --prefix backend run seed:admins
if ($LASTEXITCODE -ne 0) { throw 'Admin provisioning failed.' }

npm.cmd --prefix backend run seed:courses
if ($LASTEXITCODE -ne 0) { throw 'Course seeding failed.' }
```

Admin credentials come from `CLIENT_ADMIN_EMAIL` / `CLIENT_ADMIN_PASSWORD` and
`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in `backend/.env`. Existing admin
accounts and courses are preserved by these commands; there is no need to seed
an existing database. Do not add reset/repair flags or run historical migrations
as part of this fresh-install quickstart. Seeding alone does not configure your
new section, membership or country-specific prices; set those in the admin UI.

## 4. Start the actual website in two terminals

Both PowerShell terminals must be in the extracted project root.

Terminal 1 — backend:

```powershell
npm.cmd run dev:backend
```

Wait for startup to finish. The earlier `listening ... database readiness pending`
message only means the HTTP port is open. In another terminal, check:

```powershell
Invoke-RestMethod 'http://localhost:5000/api/health/ready'
```

Continue when this returns HTTP **200** and `ready: True`. A **503** during startup
means retry shortly; a persistent failure requires checking the backend terminal
and your Atlas settings.

Terminal 2 — frontend:

```powershell
npm.cmd run dev:frontend
```

Open **http://localhost:3000**. Keep using `localhost` consistently for sign-in.
The first development page load may compile before rendering.

- Student registration/sign-in: `/register` and `/login`.
- Client Admin: `/admin/login`, using `CLIENT_ADMIN_EMAIL` and its password.
- Super Admin: `/super-admin/login`, using `SUPER_ADMIN_EMAIL` and its password.

The separate admin roles use their corresponding login pages. Passwords are read
from your local environment file; setup does not print them. Student sign-in has
no authenticator or account-email-verification setup gate.

## 5. Run verification and the controlled UI suite

Stop the **development frontend** with Ctrl+C before verification: the build must
not share `frontend/.next` with a running development server. From the root:

```powershell
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw 'Verification failed; inspect the first error.' }
```

This runs the current security/contracts/runtime/reliability/backend checks,
source-integrity checks, TypeScript checks and production frontend build. It also
requires registry access for fresh dependency audits and writes new QA reports.
A network/audit or integrity failure is a failed check; do not regenerate the
release baseline or change dependencies to conceal it.

Install the project's browser once, then run the controlled UI suite:

```powershell
Push-Location .\frontend
try {
    npx.cmd --no-install playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed.' }
}
finally {
    Pop-Location
}

npm.cmd run test:ui
if ($LASTEXITCODE -ne 0) { throw 'Controlled UI browser tests failed.' }
```

This UI suite starts its own synthetic API on **5109** and actual Next frontend
on **3108**, building into `.next-ui-tests`. Leave those ports free. It needs no
MongoDB or payment account and does not prove real database/provider behavior.

## 6. Optional real Atlas integration and database-backed browser tests

These tests create and delete synthetic data. Use a **dedicated test Atlas
deployment and test account**, separate from your development/live data. The
account must be allowed to create databases/indexes, read/write and drop the
generated test databases, not just access one database. Have the Atlas owner
configure those permissions on the test-only deployment. Do not give a broad
test account access to a cluster containing customer data.

The private test URI must explicitly name a database ending in **`_test`**, such
as `sa_acceptance_test`. The suites actually create uniquely named
`sa_v46_test_*` and `sa_v46_browser_test_*` databases and remove their own generated
databases afterward. The named `_test` database is a safety requirement, not the
only database the test account needs permission to use. Allow your public IP on
this Atlas deployment too.

Prerequisites: successful production build from step 5, installed Chromium, and
free ports **3000** and **5000**. Stop **both** development terminals with Ctrl+C.
Do not manually start another backend/frontend for these tests.

Run this block from the project root. The URI prompt is hidden so the password
does not enter the PowerShell command history. The block restores your previous
`TEST_MONGODB_URI` even if a test command fails:

```powershell
$hadTestUri = Test-Path Env:TEST_MONGODB_URI
$previousTestUri = $env:TEST_MONGODB_URI
$secureTestUri = $null

try {
    $secureTestUri = Read-Host 'Paste the dedicated Atlas _test URI' -AsSecureString
    $env:TEST_MONGODB_URI = ([System.Net.NetworkCredential]::new('', $secureTestUri)).Password

    npm.cmd --prefix backend run test:integration
    if ($LASTEXITCODE -ne 0) { throw 'Atlas integration tests failed.' }

    npm.cmd --prefix frontend run test:browser
    if ($LASTEXITCODE -ne 0) { throw 'Database-backed browser tests failed.' }
}
finally {
    if ($hadTestUri) {
        $env:TEST_MONGODB_URI = $previousTestUri
    }
    else {
        Remove-Item Env:TEST_MONGODB_URI -ErrorAction SilentlyContinue
    }
    if ($null -ne $secureTestUri) { $secureTestUri.Dispose() }
    Remove-Variable previousTestUri, secureTestUri -ErrorAction SilentlyContinue
}
```

The browser launcher owns an isolated real backend on **5000** and the built
standalone frontend on **3000**. Its readiness check waits for the backend too.
Both suites use synthetic provider/mail fixtures and make no real payment charge.
They do not use `MONGODB_URI` as a fallback when `TEST_MONGODB_URI` is missing.

Use these direct commands for the Atlas-only path. `npm run verify:integration`
is a different runner that provisions a disposable Docker MongoDB; it is not
needed here. Do not rerun application seeds against any test-generated database.

After tests finish, restart your two development terminals from step 4 to browse
the actual application again.
