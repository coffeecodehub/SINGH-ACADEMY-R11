# Singh Academy R7 — local code verification

Executed on Node 22.23.4, 6 November 2026. These results apply to the R7 code
corrections. The two exact requested hero originals are still unavailable to this
executor; local import fixtures are not acceptance of those missing photographs.

| Executed check | Result |
| --- | --- |
| Backend regression suite | 1,353 passed |
| Frontend reliability | 885 passed |
| Runtime/tool suite | 186 passed |
| Contracts | 18 passed |
| Real MongoDB + HTTP integration | 240 passed |
| Controlled actual frontend browsers | 148 passed; no failures/retries/skips |
| Actual database browsers | 70 passed; no failures/retries/skips |
| Full production build, TypeScript, syntax/import checks | Passed |
| Full/production dependency audits | Four completed; zero known vulnerabilities |
| Actual imported-photo desktop/mobile/byte HTTP cases | Three passed on independent imported-photo clone |
| Full independent AFTER-import code/build/database gate | Same counts above passed, including 240 integrations after the final CMS guard |
| Portable clean-package helper | Six cases passed |
| Windows GUI picker, native Windows R7 and requested real-photo crops | Owner acceptance still required |
| Final clean archive, extraction and updater | Results in accompanying post-seal delivery manifest |

Counts overlap. Photo-fixture testing imported two available older originals into
new hashed paths in an isolated clone. Real Next served their unchanged bytes,
updated heroes at 390/1440px, and all five retained originals. These are explicitly
not the requested certificate-group/whiteboard replacements. Canonical null hero
configuration means those two photographs have not been imported yet.

## Concrete defects addressed

- Fractional carousel steps were discarded by integer scroll offsets at high
  refresh rates. A dedicated 144Hz integer-offset regression now covers progress,
  inspection and resumption, alongside actual Carousel browser checks.
- Social previews requested autoplay=0 and depended solely on provider-ready
  messages. They now request muted autoplay immediately. Stable frame sources,
  exact-origin/window API gates, full-viewer controls and reduced motion remain.
  Vimeo preview autopause is disabled so one card does not stop another.
- Administrator videos used default 255KiB GridFS chunks. Bounded 4MiB chunks
  reduce database write round trips without changing original bytes, scans,
  student/receipt/image policies or legacy Range compatibility. Actual browser
  transfer progress is distinguished from verification/storage and confirmed save.
- A measured 64MiB real-GridFS experiment with an explicitly artificial 10ms
  delay per chunk write used 258 versus 16 inserts and 4290ms versus 496ms storage
  time. This does not measure the user's connection, scanner or paid database and
  cannot promise a fixed total upload duration. Three actual Chromium HTTP upload
  helper cases separately checked progress, server rejection and abort behavior.
- After an explicit hero import, stale saved settings for those two replaced
  hero sources are discarded; unrelated text saves cannot rebind the old URLs
  onto the new hero identities. Matching new-source and all other images remain.
- Photo import validates both distinct JPEG/PNG sources before mutation, copies
  bytes unchanged, updates only two hero defaults and matching CMS slots, checks
  the existing reviewed source first, and rolls back owned files on failure.

## Verification corrections and limits

An old scan-disconnect fixture aborted after a fixed 30ms, occasionally before
HTTP started. It now waits for actual complete request bytes before aborting;
its one-call, AbortError and cleanup assertions remain. A deliberate 80ms file-open
reproduction fails the former timer and passes the corrected fixture.

The PayPal integration fixture globally advanced Date.now, making real MongoDB
heartbeats appear stale. Synthetic provider/financial dates now age coherently
without changing the real clock. Exact money, coupon, calendar period, access,
refund and duplicate collection assertions remain. Focused and deliberately
post-heartbeat fixtures both pass 15/15. No payment production code was changed.

Known npm audits do not certify unknown flaws. Actual YouTube/Vimeo/TikTok policy,
Instagram controls, codecs, network/storage/scanner capacity and OS reduced-motion
preferences remain outside universal timing claims. Provider-browser tests use
intercepted loopback fixtures; no real gateway, SMTP, hosted scanner, Hostinger,
DNS or production database operation was executed. Native Windows GUI acceptance
remains separate from portable PowerShell tests. See LOCAL-FIXES-R7.md and
HOSTINGER-R7-READY.md. Final immutable-archive/updater/extraction checksums cannot
be embedded in their own future source ZIP; consult the accompanying manifest.
