# Singh Academy 60.16.0 — local review R2

This is the corrected local source package for the 5 November 2026 review. No GitHub push, clone, branch creation, live payment, or deployment was performed for this correction round. Keep existing private database/provider settings on your computer; they are excluded from the ZIP.

## Requested flow and appearance

- The existing cream/brown visual theme, typography and page structure are retained. Faculty rows move in opposite directions. Hover or keyboard focus pauses a lane. When Windows/browser requests reduced motion, the default is static and a small Play/Pause control permits explicit opt-in; normal-motion visitors see the original automatic animation.
- The main menu has **Academy Plans**. `/academy` contains admin-published course sections and standalone courses. A section opens its courses, with whole-section purchase and individual course purchase choices. Old `/courses` and `/sections` listing bookmarks remain aliases of this catalogue.
- Both admin workspaces use **Academy Plans** to manage sections and their regional term totals. Create/edit a course under **Courses** and assign its section. No automatic prices are created.
- The old blanket Academy membership offers and their editor/navigation entry are retired. New student membership catalogue/quote/checkout requests return 410. Existing paid access, receipts, invoices, provider agreements, signed settlement events and owned pending checkout recovery remain supported. Six/twelve-month blanket offers are removed; administrators can still configure course/section terms of those lengths if desired.
- Uploaded event photographs are divided between Landing (2), Home (2) and About (1), with no overlap between those three new galleries. All five original files retain their hashes and resolution. Equal bounded image frames use Contain; images are no longer shown as giant feature/gallery blocks.
- My Billing shows automatic-renewal status, Disable and eligible Enable actions. An active Stripe agreement scheduled to stop can be enabled again before its paid period ends, with explicit consent to the saved undiscounted price. Provider confirmation is required. Disable retains paid access. An ended agreement or one-time purchase requires a new consented checkout; it cannot silently start charging. PayPal remains one-time only.

## USA/default and country prices

The saved account country determines the price. Matching country override wins; otherwise the explicitly configured USA price applies. Legacy rows without a US override use the explicit base as USA/default. An existing US override is normalized into the base when saved. Other countries' price maps are not sent to students.

The admin editor includes all 249 ISO country/territory choices, search, shortcuts for the requested countries and European countries, and blank override amounts for the administrator to complete. No $5/$10 assumptions are seeded. This changes display/checkout pricing for new purchases; existing paid amounts and recurring agreement snapshots are preserved.

## CSP and Windows build correction

Development permits same-origin Next chunks with a nonce and the development evaluator. Production keeps nonce-based `strict-dynamic` and blocks untrusted inline script. Private admin panels load on the client to avoid Next 15's nonce-less server preload hints. Actual admin lazy navigation and ordinary authenticated RSC navigation were exercised in development and production.

`robots.txt` and `sitemap.xml` now use ordinary route handlers. This avoids the Next metadata-loader JavaScript quoting failure shown in the supplied Windows path containing `it's_me_Programmer`. A clean frozen frontend installation and production build were also executed under an apostrophe-containing folder path. Native Windows execution is still an owner acceptance step.

## Upload 503: read the actual configuration status

Super Admin → Page sections → **Upload service status** explains disabled or incomplete scanner configuration. Refresh after restarting the backend. The endpoint is restricted to Super Admin and does not expose keys or private scanner hostnames.

For an intentionally scanner-free **local development computer only**, the private `backend/.env` settings are:

```dotenv
NODE_ENV=development
DEPLOYMENT_STAGE=development
UPLOADS_ENABLED=true
UPLOAD_SCAN_PROVIDER=clamav
UPLOAD_SCAN_REQUIRED=false
CLAMAV_HOST=
```

Restart `npm.cmd run dev:backend` after editing. Keep your actual MongoDB URI and other private settings. File signatures and image limits remain checked, but this local mode does not claim malware scanning. If you intentionally selected a real scanner, configure that provider rather than clearing it. Hosted deployments always require scanning; a missing/unreachable provider, disabled uploads or provider quota cannot be fixed by relaxing CSP. Cloudmersive selection never falls back to an unscanned upload.

## Run and verify locally

Use Node 22 or 24, your own development MongoDB replica set/Atlas database, and the extracted ZIP. Git and Docker are not required for Atlas. Full Windows setup and database isolation instructions are in `START-HERE-WINDOWS.md`.

```powershell
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
npm.cmd run setup
```

Configure private `backend/.env` and `frontend/.env.local`. Check the intended development database with `npm.cmd --prefix backend run db:check`; when additive indexes are needed, use the direct command `npm.cmd --prefix backend run db:prepare -- --apply`. Seed only a fresh development database, as described in the Windows guide.

Run in two terminals:

```powershell
npm.cmd run dev:backend
```

```powershell
npm.cmd run dev:frontend
```

Stop the frontend development server before the production-build gate:

```powershell
npm.cmd run verify
```

For actual fixture-browser checks, install the matching Playwright Chromium and run `npm.cmd run test:ui`. Real-database/browser tests require a dedicated test deployment/account permitted to create/drop the generated test databases; never point them at customer data. Updated executed results are recorded under `qa/v60.16.0-r2/evidence/verification-summary.json`.

Live provider charges, paid Atlas acceptance, SMTP delivery, hosted scanner acceptance and deployment were not performed. The missing oversized India & Kigali upload and exact Shopify product URL remain outstanding supplied content.
