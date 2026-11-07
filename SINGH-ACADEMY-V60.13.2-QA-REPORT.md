# V60.13.2 QA — executed evidence and limitations

## Basis and finding

Supplied file: Pasted text(20261004-124127).txt, LessonMedia.tsx:18/24/70/71.
The actual error sends targetOrigin=https://player.vimeo.com to an iframe whose
current recipient origin is http://localhost:3000. The old component sends a
handshake immediately in a mount effect and every 500ms before document load.
Its Play button also sends before API readiness. This is application code, not
merely Vimeo's unload diagnostic, and was not exercised by the old instant-load
fixtures/pageerror-only observer.

LandingAuthGate previously intercepted `.teamCard` buttons in the capture phase,
so the existing modal's `setMember` callback never ran for guests. The public
landing DTO already includes name/role/image/bio; no new public API exposure was
needed. Only destination anchors remain gated.

## Executed here (Node 22.16.0)

| Check | Result | Evidence in qa/v60.13.2 |
|---|---|---|
| Backend unit/fixture tests | 853 passed; 0 failed | backend-tests.log |
| Controlled frontend tests | 450 passed; 0 failed | frontend-tests.log |
| Runtime/release-tool tests | 51 passed; 0 failed | runtime-tests.log |
| New frame-gate standalone strict TypeScript | exit 0 | gate-typecheck.log |
| Source syntax/import resolution | 0 errors | source-check.log |
| Preserved assets + original CSS-prefix check | 284 files; 0 unexpected differences | protected-files.log |
| Native Chromium inherited-document experiment | 4 comparisons passed | native-frame-gate-results.json |

The Chromium diagnostic uses the shipped gate in a real iframe on about:blank.
For Vimeo and YouTube, the old unguarded postMessage logs the target-origin
mismatch; the new gate emits NO command and NO such error before document
commit. Its parent origin is null, rather than the user's localhost origin.
This is a mechanism reproduction, NOT an actual Vimeo stream or a Next/React run.
No browser administrator policy was disabled. The exact script is included.

Controlled component tests additionally exercise load callbacks, verified ready
messages, early Play queued once, timer cleanup, retry, changed lessons and the
existing preview modal. These are hook/DOM fixtures, not installed React.

## Not executed / not claimed

The release command was attempted, and failed while installing backend packages:
`EAI_AGAIN registry.npmjs.org` (bcryptjs). The current attempt and statuses are
saved as release-attempt.log and release-attempt.json; later stages are not_run.
No fake successful release report is shipped as qa/release-checks.json.

Therefore this update's full dependency-backed application TypeScript check,
Next production build, **59-case full Next/Playwright suite**, and fresh npm audit
were NOT executed here. They must pass with npm run verify:release locally.
The 54 browser cases passed by the user on V60.13.1 are previous-version evidence,
not a pass for the new code. No assertion was skipped or timeout increased.

Actual Vimeo/YouTube/Instagram delivery, mobile behavior, external-host latency,
Stripe/PayPal sandbox settlement, webhook delivery, Atlas transaction behavior,
SMTP inbox delivery and deployed Hostinger behavior remain separate acceptance.
The vendor unload warning may persist. No console filtering, wildcard messaging,
CSP relaxation, or enabling unload is part of this patch.

## Preservation

See source-scope.json and the changed-files document. Entire public CSS and all
public assets match the input archive byte-for-byte, not just screenshots.
Production payment/authentication/session/database/certificate/image-optimization
code is unchanged except the six existing release-version labels. Only lesson
messaging, the landing CTA guard and existing modal behavior are amended.
No dependencies, private credentials, student data or fabricated lockfiles added.

## Packaged-file recheck

The complete ZIP was extracted into a separate directory. Its unchanged source
was used to rerun 853 backend tests, 450 controlled frontend tests and 51 runtime
tests, all passing, plus the 284-file preservation check. Fresh-run logs are
included here as fresh-backend.log, fresh-frontend.log, fresh-runtime.log and
fresh-preserved.log. These reruns do not change the full-build/browser limitations
above. ZIP CRC/integrity and every archived file byte were checked against the
packaged working directory. No secrets, installed dependencies or font files are
included.
