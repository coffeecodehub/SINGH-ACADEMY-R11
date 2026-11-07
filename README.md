# Singh Academy 60.16.0

Current source: **R8**. The supplied original Landing group photo and Home
whiteboard photo are embedded directly in the project. Original JPEG bytes are
preserved, with responsive display copies. No owner photo-picker or import command
is part of setup. Read [LOCAL-FIXES-R8.md](LOCAL-FIXES-R8.md) and
[QA-REPORT-R8.md](QA-REPORT-R8.md) for this round's executed acceptance.
Existing layout/theme, CMS image editing, learning and billing flows remain.

Singh Academy combines professional learning with negotiation, mediation and
cross-cultural dispute resolution. This release adds course sections and scoped
access, server-authoritative country pricing, admin-managed coupons, consented
recurring billing and editable website page sections.

For an extracted ZIP on Windows with your own MongoDB/Atlas, start with
[START-HERE-WINDOWS.md](START-HERE-WINDOWS.md). Git, GitHub and Docker are not
required for that workflow. Use [HANDOVER-V60.16.0.md](HANDOVER-V60.16.0.md) for
release behavior and later deployment.
[HOSTINGER-R6-READY.md](HOSTINGER-R6-READY.md) distinguishes VPS and managed Node
requirements and the hosting/domain/provider/scanner inputs still needed.
[CURRENT-RELEASE.md](CURRENT-RELEASE.md) identifies the current release; older
versioned documents and QA counts remain historical.

Use supported Node.js 22.x or 24.x and the existing backend/frontend lockfiles.
Private `.env` values belong in local or hosting configuration, never in Git or chat.
Country prices are configured by administrators; the server selects the stored
account country's price. Browser-submitted prices and countries do not authorize
checkout amounts or grant access.

```bash
npm --prefix backend ci
npm --prefix frontend ci
npm run check:runtime
npm run verify
```

Development uses `npm run dev:backend` and `npm run dev:frontend`, with a configured
local MongoDB replica set. `npm run verify:integration` uses a separate disposable
local test database. Real provider/scanner/SMTP acceptance requires the actual
operator-owned configuration and remains distinct from synthetic fixtures.

## Release integrity

The 60.16.0 checks require the reviewed exact file snapshot in
`docs/release-baseline-v60.16.0.json`. They reject changed, missing or unexpected
application files, including new source introduced in this release. Existing
public assets and certificate artwork retain their earlier exact byte hashes.
The supplied new photographs retain their original uploaded-byte hashes.

Only after reviewing the complete authorized change, create the candidate snapshot:

```bash
node scripts/generate-release-baseline.mjs --acknowledge-authorized-v60.16.0
```

If a reviewed snapshot already exists, inspect the new diff and use
`--replace-reviewed` only for an explicitly reviewed update. Installation,
verification and CI never regenerate it. `node scripts/check-release-ui.mjs`,
`node scripts/check-preserved-ui.mjs` and `node scripts/verify-payment-scope.mjs`
then verify the snapshot without changing it. Earlier fixture projects and earlier
release versions retain their historical verification paths.

Generated Next declarations, build/cache output and QA result files are excluded
from source integrity. Executable QA fixture helpers remain covered. Passing
integrity checks is not a security audit or proof of external payment settlement.
