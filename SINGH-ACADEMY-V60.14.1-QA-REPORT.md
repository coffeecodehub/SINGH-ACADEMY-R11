# Singh Academy V60.14.1 — observed QA and security boundary

## 1. What the supplied V60.14 log establishes
Source: `Pasted text(20261006-154035).txt` supplied by the user. It reports 891
backend tests passed, installed Sharp **0.35.4** raster smoke passed, and a
successful TypeScript/Next 15.5.27 build. Verification then stops at the backend
production npm audit: **one high-severity Sharp advisory**, GHSA-wq5f-xc86-pv6w,
affected `<0.35.5`, patched `0.35.5`. The subsequent browser/configuration/inbox
stages are not a successful run merely because earlier V60.13 reports passed.
This log's stopping error is not a Node engine or MFA error.

## 2. Independent maintainer research (2026-10-06)
GitHub's reviewed advisory explicitly lists Sharp 0.35.5 as patched and says its
prebuilt binaries provide librsvg 2.63.2. The maintainer's 0.35.5 package metadata
pins @img/sharp platform packages to 0.35.5 and sharp-libvips packages to 1.3.4;
its libvips minimum is 8.18.7. Both 0.35.4 and 0.35.5 upstream manifests retain the
same three ordinary runtime dependency ranges. No assumption that this update
fixes all possible vulnerabilities is made.

Primary sources:
- https://github.com/advisories/GHSA-wq5f-xc86-pv6w
- https://sharp.pixelplumbing.com/changelog/v0.35.5/
- https://raw.githubusercontent.com/lovell/sharp/v0.35.5/package.json
- https://raw.githubusercontent.com/lovell/sharp/v0.35.4/package.json
- https://sharp.pixelplumbing.com/api-utility/
- https://docs.npmjs.com/cli/v11/commands/npm-ci/
- https://docs.npmjs.com/cli/v11/commands/npm-audit/

## 3. Changes actually made
- `backend/package.json`: exact `dependencies.sharp = 0.35.5`.
- `frontend/package.json`: exact `overrides.sharp = 0.35.5`, covering Next's tree.
- Root/backend/frontend release metadata is 60.14.1; runtime policy unchanged.
- `scripts/install.mjs`: local installation recognizes this security lock
  transition, obtains resolutions/integrities FROM npm, backs up original locks,
  rejects changes to unrelated locked packages, and restores both originals on
  failure. It never rewrites a manifest's dependency ranges to hide conflicts.
  It does not fall back from a failed npm ci to a broad npm install.
- `scripts/check-security-deps.mjs`: checks BOTH installed Sharp trees including
  nested Sharp locks, native library identities and actual raster transforms.
  A custom/global native SVG decoder needs a verifiable patched librsvg. Old or
  unreported unsafe native versions fail rather than claiming protection.
- `scripts/security-audit.mjs`: four fresh scans: backend/full, backend/production,
  frontend/full, frontend/production. Every severity is included, even low/info.
  All count fields + execution status must indicate success before declaring
  zero. Registry failure/malformed data is failed, not silently ignored. The
  JSON reports record time and SHA-256 of each scanned lockfile.
- `scripts/verify.mjs` invokes the strict native and all-severity online gates
  BEFORE the expensive tests/build. All existing tests/build checks remain.
  The previous high-only production-audit threshold is replaced by broader
  production AND full scans at all severities. The release command retains its
  existing nine outer checks, including subsequent full audit commands.
- Added dependency-free regression tests for these tools. Application behavior,
  source of payment-provider reselection/multicategory Team, and UI are unchanged.

No `npm audit fix --force`, audit allowlisting, advisory suppression, MFA return,
Node downgrade, MongoDB migration/reset, UI redesign, payment-provider call,
production env edit, or live checkout was performed.

## 4. Actual authoring-environment execution
Runtime: Node **22.16.0**, npm **10.9.2**, Linux. No actual Node 24 execution here.

| Executed check | Observed result | Evidence/scope |
| --- | --- | --- |
| Backend suite | 891 passed, zero failed/skipped | `backend-tests.log`; unit and controlled dependencies, NOT real MongoDB |
| Frontend reliability suite | 494 passed, zero failed/skipped | `frontend-tests.log`; controlled hooks/source/API fixtures, NOT full Next browser stack |
| Runtime/security tooling suite | 117 passed, zero failed/skipped | `tooling-tests.log`; original 51 plus 66 new tool-policy tests |
| Actual npm CLI lock migration experiment | 5 checks passed | `npm-cli-experiment.json`; isolated loopback registry with SYNTHETIC packages. Checks override refresh, unchanged other resolutions, npm ci and idempotence. NOT real Sharp or an online audit |
| Protected-source checker | 284 protected files; zero unexpected differences | `preserved-ui.log` |
| Complete stylesheet byte comparison | All 13 existing CSS files identical | `change-manifest.json` |
| Public/backend asset byte comparison | 253 files identical | `change-manifest.json` |
| Source/import syntax | 132 TS/TSX files, 176 backend JS, 330 local imports, zero syntax/import errors | `source-check.log`; no dependency typecheck substitute |
| Workflow/Compose/Bash parsing | Passed; 9 shell steps parse | `workflow-check.json`; NOT GitHub execution |
| Security manifest pins | Match patched versions | `manifest-check.log`; manifest-only, not installed validation |
| Full release command | BLOCKED/FAILED at dependency resolution | `release-attempt.log` + `.json`: EAI_AGAIN registry.npmjs.org |

Tool logs are under `qa/v60.14.1/`. The npm experiment uses genuine npm-generated
lockfiles FOR SYNTHETIC packages to exercise migration behavior. Those package
artifacts/locks are not included as application dependencies. No official registry
integrities or application lockfiles were fabricated.

The authoring environment exports CI=true. The first full-gate attempt correctly
refused absent committed lockfiles (`ci-lock-refusal.log`). A separate explicit
LOCAL-install attempt with CI=false then reached the public registry and failed
on DNS. This did not bypass any tests, audits or database-security check; it only
selected the documented local first-install path. Both reports are retained.

## 5. NOT executed / cannot honestly claim passed
- Download/install and native execution of actual patched Sharp 0.35.5.
- A fresh official npm audit of the complete resolved application trees.
- Full dependency-backed application typecheck and Next build for THIS release.
- The actual Next/Playwright 71-case UI suite or replica-backed e2e browser suite.
- Real MongoDB integration, current GitHub Node 22/24 workflow jobs.
- Hostinger deployment/runtime/caching, real video streaming, actual sandbox/live
  settlement, public webhook delivery, or inbox receipt.

The globally installed container Sharp is older (0.34.1) and was NOT copied into
this project or used to impersonate the patched native dependency. No system
fonts or native binaries were added to the source package.

There is therefore NO fresh “0 vulnerabilities found” claim in this report.
The reported vulnerable PIN is corrected to the maintainer's patched version;
actual security clearance must come from the complete fresh registry scan and
installed native checks. A green dependency audit only covers known reported
advisories at that time; it is not a 100% absence-of-all-bugs guarantee or a
penetration-test certificate.

## 6. Release procedure and preserved scope
Use the accompanying current local guide. Preserve actual existing lockfiles and
private .env files, but do not overwrite the corrected manifests with old ones.
`npm run verify:release` automatically runs the scoped local lock transition and
then npm ci plus installed/native/full online audit gates. Review and commit both
real npm-generated locks; both GitHub jobs must pass before deployment. Both
frontend and backend need the update, even though the first recorded advisory was
from the backend audit.

The 2g test MongoDB configuration, corrected no-MFA integration tests, provider
switching logic, eager marquee photos, multiple Team categories, public Team
preview and existing certificate/ownership logic all remain exactly as V60.14.
All 71 previously declared UI cases are retained unchanged. There is no new test
skip or loosened assertion to turn a red result green.

## 7. Packaging validation
See `fresh-extract-check.json` for CRC/file equality and rerun logs from a fresh
extraction of the output ZIP. The final package is rebuilt only to include those
reports; no functional code changes after those checks.

Fresh-extraction result recorded: 1,269 candidate entries byte-compared with zero
differences. From that extracted root: 117/117 tooling tests, 891/891 backend
unit/controlled tests, 494/494 controlled frontend tests and the 284-file
protected-source check passed again. Final ZIP adds this evidence only. These
reruns do not change the explicit native/online/full-browser limitations.

During lock-only metadata resolution `--ignore-scripts --no-audit` prevents
side-effectful installation and redundant interim scans. This does NOT disable
security verification: real npm ci, native checks and the mandatory four-scope
online audit run afterward and must all pass.
