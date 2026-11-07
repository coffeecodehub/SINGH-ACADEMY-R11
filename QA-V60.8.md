# Singh Academy V60.8 — actual QA report

## Scope and evidence

Baseline: the supplied V60.7 complete project. Request: durable explicit logout, no purchase action on free courses, non-overlapping tablet navigation, and the attached gold-seal certificate reference reused for real student/course records. No live Hostinger account, real database, payment account or mailbox was accessed or changed while preparing this release.

### Confirmed code-level issues and changes

- Logout previously revoked only the single same-name cookie value selected by cookie-parser. A browser can present current `/api` and older `/` cookies together. The updated controller parses all valid same-name session tokens supplied for the selected portal, awaits database revocation, and expires current and legacy paths. Other admin/student portal sessions are not globally revoked. A database failure is not reported as successful server sign-out.
- The frontend previously had no durable explicit logout boundary for reload/history/tab restoration. A non-secret per-portal marker now persists explicit logout; no session GET may turn it into login. Only an actual successful credentials/registration response clears that boundary. The backend remains the authority for access.
- Late private/session/login responses are fenced by request epoch and account-boundary marker. Older billing/download results cannot enter a newer account's UI. Duplicate sign-out requests share a flight. A new credentials request waits for an in-progress sign-out response before issuing a new cookie in that document.
- The session provider handles browser pageshow/storage/focus and portal changes. An unexpired session is still usable normally if Logout was not requested; existing expiry, password-reset and revocation policies remain. Transient session errors without logout retain a confirmed account and show reconnect feedback. Failed explicit logout clears local identity but warns that SERVER revocation must be retried.
- Free-course detail now has Start Course and directly calls the owned enrollment route. It does not call paid access/checkout first. A manual free-course checkout URL renders a free-course return/start action instead of provider buttons. Backend pricing and paid fulfillment rules were not weakened.
- The existing compact menu is extended to 901–1399 CSS-pixel widths; original mobile and wide-desktop styles remain. Escape/outside click and route changes close the compact menu. The original CSS bytes remain intact and the requested fix is appended.
- Certificates use one blank master artwork derived from the supplied reference, with its cream paper/frame, gold embossed seal and blue signature. The central watermark was reconstructed to remove sample text; it is not claimed to be a pixel-identical editable original. Names/titles/dates/serials and verification links are rendered from the issuance inputs. There are no colored covering rectangles over baked-in names. Dynamic text fits/wraps without silently truncating the student's record. Static artwork is cached once per process, not fetched externally for each certificate.
- Existing certificate issuance, ownership, revocation and immutable stored PDF behavior are unchanged. Newly approved certificates receive the new style; old issued PDFs are not rewritten.
- Dependency requirements are unchanged. No new DB migration, learner reset, payment change or SMTP configuration change was introduced by V60.8.

These are reproduced/source-confirmed gaps, not a claim that a particular live Hostinger cache/cookie combination was remotely diagnosed.

## Executed checks

| Check | Actual result | Scope |
|---|---:|---|
| Backend test suite | **743 passed, 0 failed, 0 skipped** | Includes real utility/PDF tests and source/controller/service tests using explicit database/provider stubs. Not a live MongoDB/provider certification. |
| API/session/free-flow/proxy reliability suite | **51 passed, 0 failed, 0 skipped** | Actual compiled TypeScript callbacks with deterministic hook/browser-state harness; includes Node HTTP proxy tests. Not a full Next.js browser build. |
| Header CSS browser fixtures | **114 passed, 0 failed** | Actual SiteHeader JSX rendered with controlled auth/menu state and the actual stylesheet in Chromium. 19 widths (320–1920), 3 guest/normal/long-name states, menu open/closed. Checked horizontal overflow, brand/nav/account overlap, clipping and compact-menu visibility. |
| Source syntax and relative imports | **102 TS/TSX files, 163 backend JS files, 257 relative imports; 0 errors** | Parse/syntax/local file resolution, not dependency-backed type analysis. |
| Approved UI protection | **278 files + original 59,706-byte CSS prefix checked; 0 unexpected differences** | Includes unchanged public artwork/styles and protected certificate issuance/security surfaces. Requested renderer/tablet additions tracked separately. |
| Certificate generation/structure | **3 actual renderer samples passed** | One-page landscape PDF, sample marker, dynamic fields within page, two matching verification links. Different users, short title and long two-line title. |
| Visual PDF review | **Rendered and inspected** | Actual PDF output, not just the reference image. MuPDF rendering plus a Poppler reference render. No pasted-over label boxes, ghost sample names, clipped seal or signature observed in reviewed fixtures. |

Logs and artifacts are in `qa/v60.8/`. Historical folders such as `qa/v50`, `qa/v51`, `qa/v60.7` are OLD evidence and are not presented as V60.8 results.

The three removed `certificate-theme-background.*` files were unused old screenshot artwork with burned-in sample text. Their removal is explicitly approved-scope metadata, not an ignored unexpected UI difference. Original Academy logo/signature assets and certificate approval/download routes remain preserved.

## What could NOT be completed here

- The container ran Node **22.16.0**. Installed application npm dependencies/lockfiles were unavailable and registry access returned `EAI_AGAIN registry.npmjs.org`. Consequently a fresh install, dependency-backed `tsc`, production `next build`, Sharp native smoke and current `npm audit` were **NOT completed for V60.8**. Do not infer a clean audit from unchanged dependency requirements.
- Chromium could render in-memory document/CSS fixtures, but navigating to the local HTTP application was blocked by the browser environment (`ERR_BLOCKED_BY_ADMINISTRATOR`). The header fixtures used in-memory markup/styles; they do not prove real navigation/login persistence in a running Next app.
- `frontend/ui-tests/logout-free-tablet.spec.ts` supplies 12 full Next.js/mocked-API UI checks via `npm --prefix frontend run test:ui`. These are included for the networked local environment and **were not run here**. Existing isolated-DB integration/browser suites were not run here either.
- Live/Hostinger CDN behavior, database transactions, provider sandbox captures/webhooks, actual SMTP inbox delivery and final domain/email-plan changes were not tested or performed here.
- This report is not a penetration test, performance SLA, pixel-perfect reconstruction guarantee or an assertion that no possible bug remains.

## Release gate before client handover

Follow `START-HERE-V60.8.md`. Run the full `npm run verify` on Node 22.x after installation. Test explicit logout -> Back -> Refresh -> reopen -> explicit login, without pre-clearing the old browser cookies. Check frontend `/api/auth/session` is actually anonymous after successful sign-out. Repeat with two tabs and another student profile. Check free courses, paid/membership billing, actual certificate approval/download and sandbox email/provider delivery. Confirm both Hostinger apps use the new commit, not only the backend version returned through the proxy. Do not deploy while any required check fails.
