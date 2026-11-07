# V60.14.1 — targeted change list

Baseline: the supplied complete V60.14 ZIP. Application feature logic and UI
are intentionally unchanged. This is the dependency/security-gate correction.

## Modified existing files

| File | Change |
| --- | --- |
| `backend/package.json` | Sharp exact 0.35.4 -> 0.35.5; release version 60.14.1 |
| `frontend/package.json` | Sharp override exact 0.35.4 -> 0.35.5; release version |
| `package.json` | Release version; deps:security/check:security/audit:security commands |
| `scripts/install.mjs` | Scoped local lock update + locked ci + actual installed native checks |
| `scripts/verify.mjs` | Native checks + production/full all-severity online audit before tests/build |
| `backend/src/app.js` | Health version label only |
| `backend/src/server.js` | Startup version label only |
| `frontend/components/business/BusinessPortal.tsx` | Existing version label only; no layout/permissions change |

## New source/test files
- `scripts/security-dependency-policy.mjs`
- `scripts/refresh-security-locks.mjs`
- `scripts/check-security-deps.mjs`
- `scripts/security-audit.mjs`
- `scripts/test/security-dependencies.test.mjs`

## Reports/documentation
Current guide, QA report, this file and `qa/v60.14.1/*`.
Historical QA material is retained as history, not current approval.

## Verified unchanged
All 13 original CSS files, all 253 compared frontend public/backend assets,
all original 71-case UI suite files, production auth/payment/Team/video/certificate
code except the listed version labels. See `qa/v60.14.1/change-manifest.json`
for the before/after hashes. No data migration, account role, secret or env edit.

## Lockfiles
No genuine application lockfiles were included in the input ZIP. The author's
registry access was blocked; none are fabricated in the output. Preserve the
user's real locks, let the local security updater obtain the patched metadata
from npm, review the resulting diff and commit both actual lockfiles.
