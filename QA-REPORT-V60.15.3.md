# Singh Academy V60.15.3 — actual QA and verification boundary

Date: 7 October 2026. Source basis: the supplied complete V60.15.2 ZIP plus the exact
Team navigation selector correction previously applied by the user in GitHub.
Runtime used here: Node 22.16.0, Linux x64. No production server, database or payment
provider was modified. No Cloudmersive account was created, purchased or charged.

## Scope

Only upload-scanner selection, the Cloudmersive HTTPS adapter, scanner configuration,
explicit scanner diagnostics, scanner-related isolation/tests and documentation were
added. Private ClamAV INSTREAM remains available. New files still pass the existing
allowlist/signature/size checks and remain in private temporary storage until a clean
scan. Scanner failure never enables unscanned storage. Images are still re-encoded by
the existing Sharp pipeline AFTER scanning; the recorded scan SHA-256 is of the
original uploaded bytes, not the subsequently generated WebP.

Payment, refund, entitlement, learning/progress, certificate and production session
logic is unchanged. Release-version text is updated. The user's known CI Team selector
fix is retained; this is not a new navigation/UI change. See CHANGED-FILES-V60.15.3.md
and qa/v60.15.3/preservation.json for the exact comparison.

## Commands actually executed

| Command / scope | Result |
|---|---|
| `node --test backend/test/*.test.js` | 1,035 passed, 0 failed, 0 skipped |
| `node --test frontend/test/*.test.mjs` (available TypeScript compiler) | 516 passed, 0 failed, 0 skipped |
| `node --test scripts/test/*.test.mjs` | 138 passed, 0 failed, 0 skipped |
| `node scripts/check-release-ui.mjs` | 284 protected checks, zero unexpected differences |
| `node scripts/check-source.cjs` (available TypeScript parser) | 135 frontend / 199 backend sources, 333 relative imports; 0 syntax/import errors |

The backend total includes 68 new scanner/configuration/upload-pipeline cases. These
exercise real filesystem operations and local HTTP transport, plus explicit test
adapters for Sharp/GridFS in the controlled pipeline cases. They test clean/infected,
malformed/oversized/HTML/pending responses, wrong credentials, quotas, file-size caps,
client cancellation, a real five-second timeout, concurrent independent uploads,
request privacy, fixed HTTPS destination configuration, byte hashing, no automatic
retries, no unscanned fallback, rejection-before-storage and temporary-file cleanup.
They do NOT assert detection effectiveness of a real commercial malware engine.

No frontend production feature was modified, and no new npm dependency was added.
The controlled frontend tests are NOT a fresh full Next.js build or full browser run.
The syntax/import checker is NOT a full installed-dependency TypeScript typecheck.

## Attempts which did NOT complete

| Attempt | Actual outcome / evidence |
|---|---|
| `npm run verify:release` with existing environment CI policy | Stopped because reviewed project lockfiles are not supplied in the source archive |
| Explicit local-style release/install attempt with bounded npm fetch | `EAI_AGAIN registry.npmjs.org` while resolving bcryptjs; no usable dependency install |
| `npm run test:contracts` | Cannot import mongoose because dependencies are unavailable; model assertions not executed |
| Docker prerequisite | Docker command unavailable in this environment |
| Actual Cloudmersive account / HTTPS scan | Not run: no account/API key or operator-approved plan supplied |
| Hostinger-to-scanner upload | Not run: deployed hosting configuration not changed here |

Raw attempt logs and the failed release-attempt report are kept in qa/v60.15.3.
No failed audit was re-labelled zero vulnerabilities. The user's V60.15.2 audits/CI
remain evidence for that tested older commit/locks, not automatic approval of V60.15.3.
Historical reports elsewhere in the archive remain historical and are not new results.

## Added but not executed here: real MongoDB scanner integration

`backend/integration/v60-15-3-upload-scanning.test.js` declares one parent and ten
subtests. It uses actual Express/Multer/Sharp/MongoDB when the integration gate is run,
with an explicitly substituted LOCAL scanner response. It checks clean persisted
metadata and ownership, rejected/quota/auth/unavailable/malformed results, size cap,
signature rejection, unauthenticated requests and uploads-disabled behavior.

Full expected counted integration total is 88 (77 prior + 11), not a pre-claimed pass.
The existing 12 payment model contracts, 75 fixture browser cases and 46 DB-backed
browser cases remain. The actual external scanner key is removed from fixture test
environments; no automatic metered cloud scan is made by CI/default release gates.

## Remaining external acceptance

1. Preserve the user's reviewed backend/frontend lockfiles and private env files. Run
   the complete new release gate, four fresh dependency audits and both Node CI jobs.
2. Run `verify:integration` on the user's already-working Docker setup; require all
   backend and browser stages, not only the MongoDB startup, to pass.
3. With a real backend-only scanner key, explicitly run `scan:check -- --remote
   --test-rejection`. It submits two synthetic probes and consumes provider quota.
   A scanner HTTP error/timeout is NOT a successful malware-rejection test.
4. A local probe proves only that machine's path. Verify fresh course-cover/Team/PDF/
   private assignment/receipt uploads through the deployed Hostinger application,
   including appropriate roles and representative sizes on the subscribed plan.
5. Client approval of the external data processor, privacy terms/DPA/region and plan
   capacity is needed before real private files are scanned. Files are not anonymous
   merely because the adapter sends generic filenames.
6. Existing payment sandbox/webhook/inbox, trusted-hosting-IP and final live-mode
   acceptance requirements still apply. This upload change does not certify them.

## Provider contract used

Official pages reviewed on 7 October 2026:
- https://api.cloudmersive.com/docs/virus.asp — POST /virus/scan/file, multipart
  inputFile, Apikey header, explicit CleanResult and FoundViruses response.
- https://cloudmersive.com/pricing-small-business — free evaluation 600 calls/month,
  1 call/sec, 3.5 MB maximum; Basic listed $19.99/month, 10,000 calls/month, 2 calls/sec,
  1 GB maximum. Confirm small-business eligibility and per-API constraints first.
- https://cloudmersive.com/security — provider states stateless payloads are not
  retained after transactions; this report does not independently audit that claim.
- https://cloudmersive.com/privacy-policy — client/operator contractual review.
- https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html —
  defense-in-depth upload controls, not a certification of this application.

The integration uses the standard Virus Scan endpoint, not content-disarm-and-
reconstruction or a promise that all encrypted/active content and unknown malware
will be detected. A clean antivirus result is not a universal safety guarantee.

## Release status

**Targeted implementation and available controlled checks completed.**
**Full new build/audit/real-database/browser and external scanner/hosting acceptance
remain required. `handoverReady` is false. No 100%-bug-free claim is made.**

## Fresh extracted-ZIP verification

The candidate ZIP was CRC-tested, freshly extracted and all 1,369 packaged files were
byte-compared after testing: no unexpected differences. From that extracted root,
backend 1,035/1,035, controlled frontend 516/516 and tooling 138/138 passed again;
protected checks and source syntax/import checks also exited zero. The final archive
adds only this report paragraph and version-scoped extraction evidence/logs. This
repetition does not change the unexecuted full-build/MongoDB/browser/provider limits.
