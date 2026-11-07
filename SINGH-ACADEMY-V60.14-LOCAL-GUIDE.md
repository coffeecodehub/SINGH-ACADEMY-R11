# Singh Academy V60.14.0 — local test and staged-release guide

## 1. What is and is not changed
Requested scope: payment-provider reselection, eager landing marquee photos,
multiple Team categories, and the demonstrated CI configuration/test-contract
failures. Public CSS, original image assets, video player, session/authentication
implementation, footer, certificates, lesson progress and learner ownership are
not redesigned. Release labels now say 60.14.0.

These are Team profile categories, NOT account permissions. Selecting Founder,
Faculty, Board of Advisors and Core Team never creates an administrator account.

## 2. Apply the complete ZIP
Extract `Singh-Academy-V60.14.zip`. The root is
`SINGH-ACADEMY-V60.14-COMPLETE`, directly containing `backend`, `frontend`,
`scripts`, `.github`, `dev` and `package.json`.

Keep a backup of your existing working directory. Copy/preserve:
- `backend/.env`: existing database name, AUTH_SECRET, credentials and local settings.
- Your existing frontend environment file (`frontend/.env.local` or `.env`).
- `backend/package-lock.json` and `frontend/package-lock.json` from your tested installation.

No private credentials or fabricated lockfiles are supplied. Dependency
declarations are unchanged. Do not copy old source files back over the new source.
Do not delete the current database, reset learner records, seed production, rotate
working secrets or reinstall Node. Existing Node 22.x / 24.x remain accepted.
If a real lockfile mismatch occurs, keep its error rather than deleting the lock.

For an existing Git checkout, preserve its `.git` folder. Do not create a new
GitHub repository just because the ZIP's version changed. Review the changed-file
list before committing. All backend/frontend/workflow changes must be included.

## 3. Run the existing local gate
Stop previous dev/test terminals first. From the NEW project root:

```powershell
node -v
node -p "require('./package.json').version"
npm run verify:release
```

Expected version: `60.14.0`.

The gate installs dependencies, checks local configuration, runs the unit/control
checks, TypeScript/build/audits, actual Next UI with synthetic services, payment
CONFIGURATION and SMTP AUTHENTICATION. It still stops on failure.
The synthetic UI suite currently declares 71 browser cases (old cases retained,
payment reselection plus Team photo/category regressions added).

It does NOT run `backend test:integration` or the separate `frontend test:browser`
real-replica-set stack. Those remain additional required CI jobs. This distinction
explains why a previous local PASS was not a GitHub-integration PASS.

To read the saved result (does not rerun tests):

```powershell
Get-Content .\qa\release-checks.json
```

Do not run development servers concurrently with the browser fixture stack.
Ordinary website ports: frontend 3000 / backend 5000.
Synthetic UI ports 3108/5109 are test-only; never copy them into Hostinger settings.

## 4. Run the website after local PASS
Terminal 1:

```powershell
npm run dev:backend
```

Terminal 2:

```powershell
npm run dev:frontend
```

Open `http://localhost:3000`. Keep both terminals running.

Terminal 3:

```powershell
npm run deploy:check -- --local --front http://localhost:3000 --api http://127.0.0.1:5000
```

Expected identity: both frontend and backend 60.14.0; zero failed smoke checks.
Anonymous catalog 401 responses remain intentional, not authenticated success.
The smoke command does not purchase a course or authenticate a real student.

## 5. Payment switching acceptance — TEST/SANDBOX only
Use a fresh eligible test student/course/plan. Do not repeatedly buy a course with
an already active membership and mistake the existing-access refusal for a switch error.

Test BOTH directions for BOTH an individual course and membership:
1. Open checkout and choose Stripe.
2. On Stripe, use Back OR Cancel without paying.
3. Return to checkout (Cancel page also has “Choose payment method”).
4. Choose PayPal. The application first asks the server to release the old checkout.
5. The old unpaid Stripe session must be provider-confirmed expired; then exactly
   one replacement PayPal order opens. Complete it using sandbox credentials.
6. Verify one payment/invoice/receipt, correct access, admin record and intended email.
7. Repeat PayPal → Stripe and a second change back before completing payment.
8. Return to an OLD provider tab after switching: it must not create an additional
   app-initiated capture or grant. Confirm this in provider logs and My Billing.
9. Test rapid double clicks and two tabs: the same predecessor returns the same
   replacement request key. Competing choices cannot create two replacements with
   that same key. The losing tab reconciles the canonical order.
10. An already PAID old order must open its existing receipt, not a second checkout.

Safety boundary:
- Browser Back/Cancel itself is not evidence of payment failure.
- Stripe closure is an authenticated server-side expiration + re-read.
- PayPal CAPTURE Orders v2 has no generic order-cancel API. Before releasing an
  unattempted capture, the application durably prevents its own capture paths,
  verifies provider order status/identity, and marks the local checkout cancelled.
  An old PayPal approval page can still exist; this is not a claim that PayPal
  itself remotely voided it.
- Already processing/captured/unknown money is NOT silently cleared. The user is
  told to check status before a new payment. No automatic refund is introduced.
- A provider outage can delay switching; it must never authorize duplicate money.
- Actual gateway status and late external capture are still reconciled to the
  owner. Console success or a synthetic test is not proof of provider settlement.

No provider secrets belong in chat, the public frontend, Git or test traces.
Keep live keys out of these manual debug runs.

## 6. Team categories and compatibility
In Client Admin / content-management workspace → Team → Add/Edit:
select any combination of:
`The Founder`, `Faculty`, `Board of Advisors`, `Core Team`.

At least one category must remain selected. “Role / designation” remains the
separate free-text professional title. Save once.

Check:
- The member appears in EACH selected Team tab.
- It appears only once in All.
- Founder membership pins the profile ahead of non-founders.
- A member who is ONLY Core Team stays at the end.
- Remove a category, save, and confirm it no longer appears in that tab.
- Editing an existing legacy single-category member preselects its old category.
- Other profile fields, crop controls, original photos, biography and public
  preview appearance remain intact.
- Guests can open the existing landing preview. Only full Team/Explore requires login.

No destructive data conversion is performed. Old `category` remains readable;
new `categories` holds selections. Saving categories maintains a deterministic
legacy primary category. Team category changes do not change student/admin roles.

## 7. Landing image acceptance
Open the landing page with a cold cache and without hovering over the Team strip.
All marquee photo elements now use eager loading and the existing grid-sized
variants. Both moving tracks are covered; the browser can reuse identical requests.
Cards approaching from outside the viewport must not wait for mouse hover to
BEGIN their photo request.

Compare normal network and throttled network, then repeat with a warm cache.
Network speed, a cold CDN/DB and genuinely missing image files can still delay
pixels. This release does not promise zero-millisecond first download and does
not hide a failed photograph as a successful load. CSS, animation and cropping
remain unchanged. Investigate a specific failed image URL/status separately.

## 8. GitHub CI
Do not “fix” this by enabling MFA, changing project Node versions or skipping tests.
The supplied workflow keeps Node 22 and Node 24; the action helpers use v5 and the
OS is pinned to ubuntu-24.04. The test MongoDB tmpfs is 2g, and the workflow checks
free space INSIDE `/data/db`, not only the runner's root filesystem.

Two stale integration expectations are corrected:
- Administrators sign in normally; `setupRequired` is false. Retired MFA setup,
  enable and disable routes return 410 and never expose a new setup secret.
  Real admin sessions must still respect portal, account and role boundaries.
- Certificate issuance does not require the retired review checkbox. It STILL
  requires the correct current attempt, actual submitted work, authorized admin
  and current password. Stale attempts/passwords must fail without issuing a PDF.

The old root-redirect e2e expectation now tests the approved PUBLIC landing.
A new real-HTTP / replica-set suite checks payment release/locking against
controlled provider adapters; it never calls Stripe/PayPal for real.

Push to a RELEASE BRANCH first when Hostinger auto-deploy watches `main`.
Review the staged files and ensure no `.env`/secrets are included.
Wait for both matrix jobs, including Real HTTP/transaction, real frontend and
synthetic UI stages. A green local log does not waive these jobs.

If CI fails, preserve the FIRST failed step. Do not keep rerunning the same commit
or weakening assertions. Do not point TEST_MONGODB_URI at production Atlas.
The test database helper restricts cleanup to generated reserved test databases.

## 9. Temporary Hostinger deployment, then live
After local checks and BOTH CI jobs pass, deploy the reviewed commit/lockfiles
to the existing temporary backend and frontend apps. Backend first; ensure the
new `/api/payments/checkout/release` route is present before relying on the new UI.
A full-project update must not deploy only the frontend.

Keep the existing approved Hostinger Node 22 setting and working review/sandbox
configuration. No runtime/production secret change is requested by this patch.
Do not blindly import localhost .env into public hosting. Preserve HTTPS,
allowed exact origins and your upload/security policy.

Then run from the current project root:

```powershell
npm run deploy:check -- --front https://mediumspringgreen-cod-301282.hostingersite.com --api https://navajowhite-lobster-767933.hostingersite.com
```

Repeat actual sandbox switch/payment/webhook/inbox, multi-category Team, guest
preview, real photos and login/logout acceptance on those domains. Only then
review final domain/HTTPS and matching LIVE provider credentials/webhooks.

A real live charge is a separately authorized real-money operation, not part of
these command tests. Never substitute test cards in live mode.

## 10. Verification boundary
See the accompanying QA report for what ran in the file-generation environment.
No claim is made here that the updated full build, real replica-set jobs or
external sandbox provider delivery passed before you execute them.

## Deployment coordination
Do not roll out a frontend that calls `/payments/checkout/release` against the
old backend. Deploy the reviewed backend first, verify readiness, then the matching
frontend. Finish/reconcile existing test checkouts before replacing the running
payment services; do not switch versions in the middle of a capture. A legacy
checkout can be reconciled, but old in-flight processes must not run concurrently
with the new capture-exclusion protocol. Keep both providers in TEST/SANDBOX
through acceptance. No provider secret should be committed or sent in chat.
