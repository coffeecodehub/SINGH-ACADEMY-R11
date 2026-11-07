# V60.15.3 — exact changed-file scope

Base: supplied V60.15.2 complete ZIP. No original file deleted. The source ZIP predates
the user-approved Team selector fix, which is retained explicitly below.

## Modified original files

| File | Reason |
|---|---|
| `CURRENT-RELEASE.md` | Current release scope and truthful verification boundary |
| `README.md` | Current release/setup guidance |
| `backend/.env.example` | Backend-only scanner provider, secret placeholder and byte cap |
| `backend/integration/isolation.js` | Strip external scanner key; deterministic local test defaults |
| `backend/package.json` | Version and explicit scan:check command only |
| `backend/src/app.js` | Health version label only |
| `backend/src/scripts/checkHandover.js` | Add external upload scanner/hosted upload acceptance reminder |
| `backend/src/server.js` | Startup version label only |
| `backend/src/services/uploadScan.js` | Scanner selection and preservation of legacy private ClamAV path |
| `backend/src/services/uploads.js` | Pass already-validated MIME to scanner; existing pipeline otherwise unchanged |
| `backend/src/utils/deployment.js` | Validate selected scanner instead of requiring ClamAV for HTTPS option |
| `frontend/components/business/BusinessPortal.tsx` | Existing internal version text only |
| `frontend/e2e/public-portals.spec.ts` | Retain user-approved Main navigation selector from successful CI commit |
| `frontend/package.json` | Version only |
| `package.json` | Version and explicit scan:check command only |
| `scripts/integration-check.mjs` | Remove external scanner key from fixture test environment |
| `scripts/release-check.mjs` | Record external scanner acceptance as not covered by local gate |

## Added source/test files

- `backend/integration/v60-15-3-upload-scanning.test.js`
- `backend/src/scripts/checkUploadScanner.js`
- `backend/src/services/uploadScanCloudmersive.js`
- `backend/src/utils/uploadScanConfig.js`
- `backend/test/v60-15-3-scanner.test.js`
- `backend/test/v60-15-3-upload-pipeline.test.js`
- `scripts/test/v60-15-3-scanner-wiring.test.mjs`

The new guide, current QA report, starter instructions and version-scoped evidence are also included.

## Preserved

- 1,326 of 1,343 original files byte-for-byte unchanged.
- All 13 original CSS files and 268 public/backend asset-directory files unchanged.
- Production payment, refund, entitlements, learner progress, certificates and session/auth implementation unchanged.
- Frontend production code unchanged except release-version text.
- Every dependency/devDependency/override/engine declaration, CI workflow and Docker Compose unchanged.
- Existing user .env/API/payment/mail/database secrets, deployed services and Atlas data not read or modified.

Hashes and exact original-file diff: `qa/v60.15.3/preservation.json` and `source-diff.patch`.
New source is present in the full ZIP, with hashes in `new-source-files.json`.
Historical QA files remain historical; they are not new-release clearance.
