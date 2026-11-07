# V60.13.2 — exact source scope

Base: supplied complete V60.13.1 ZIP. No CSS, public artwork, certificate, image
optimization, payment logic, database schema or authentication/session security
is redesigned. No runtime dependencies were added or upgraded.

## Production behavior changes

- `frontend/components/learning/LessonMedia.tsx`: no handshakes on initial mount;
  wait for the provider document load or a verified message before communicating.
  Start the finite handshake budget after document load. Queue early Play until
  API readiness. Retain single-frame playback, zero-second source URLs, retries,
  provider error reporting, native video and external/Instagram behavior.
- `frontend/lib/playerFrameGate.ts` (new): connected-current-frame, configured
  source-origin, document-commit and exact message source/origin checks. Reject
  readable about:blank/srcdoc documents and disconnected/replaced frames. Never
  use a wildcard target origin or hide console errors.
- `frontend/components/auth/LandingAuthGate.tsx`: do not intercept team-card
  button clicks. Anchor destination checks and server/API guards stay intact.
- `frontend/app/page.tsx`: reuse the existing team modal, original CSS/CMS text,
  images and bio. Add explicit non-submit button types, dialog labelling,
  keyboard Close/Escape/focus handling. Full faculty profile goes to canonical
  protected `/team`; guests retain `/team` as the post-login destination.

## Metadata-only changes

- `package.json`: release label 60.13.1 → 60.13.2 only.
- `frontend/package.json`: release label 60.13.1 → 60.13.2 only.
- `backend/package.json`: release label 60.13.1 → 60.13.2 only.
- `backend/src/app.js`: release label 60.13.1 → 60.13.2 only.
- `backend/src/server.js`: release label 60.13.1 → 60.13.2 only.
- `frontend/components/business/BusinessPortal.tsx`: release label 60.13.1 → 60.13.2 only.

## Test changes

Existing player tests now check the corrected early-Play contract (zero commands
before readiness, one after), rather than requiring the previous premature send.
The old landing test is updated for the user's explicit public-preview exception;
its full `/team` login assertion remains. Existing media browser tests also
capture postMessage console errors, not just thrown page exceptions.

New controlled checks cover inherited documents, wrong origins/windows,
disconnection, replacement, delayed loading, retry and the existing team modal.
Five new Next/Playwright cases cover Vimeo/YouTube delayed document commit,
leaving before load, and mobile/desktop public preview → login → full team.
No test is skipped; no expectation timeout is increased.

## Exact existing files changed

- `backend/package.json`
- `backend/src/app.js`
- `backend/src/server.js`
- `frontend/app/page.tsx`
- `frontend/components/auth/LandingAuthGate.tsx`
- `frontend/components/business/BusinessPortal.tsx`
- `frontend/components/learning/LessonMedia.tsx`
- `frontend/package.json`
- `frontend/test/media-reliability.test.mjs`
- `frontend/test/v60-10-reliability.test.mjs`
- `frontend/test/v60-13-media-images.test.mjs`
- `frontend/ui-tests/media-images-v60-13.spec.ts`
- `package.json`

## New source/test files

- `frontend/lib/playerFrameGate.ts`
- `frontend/test/v60-13-2-player-gate.test.mjs`
- `frontend/ui-tests/player-preview-v60-13-2.spec.ts`
