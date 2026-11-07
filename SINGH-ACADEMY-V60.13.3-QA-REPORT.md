# Singh Academy V60.13.3 — evidence and verification boundaries

## Source of the reported failures

Input: `Pasted text(20261004-132434).txt`, V60.13.2, user-executed Windows run.
The log reports 853 backend tests passed, successful application TypeScript/Next
production build, zero vulnerabilities in that run, and 57/59 browser cases
passed. Both failures are at `player-preview-v60-13-2.spec.ts:64`, before opening
a modal. Repeated "element is not stable" messages come from scrolling the
continuously animated team card. The existing hover-to-pause action is placed
AFTER the blocking scroll. The trace ZIP itself was not supplied or inspected.
The log does not establish a broken preview callback or a new payment failure.
The three delayed-provider document/player-origin regressions passed in that run.

Playwright documents stability checks for scrollIntoViewIfNeeded and click:
https://playwright.dev/docs/actionability . Touchscreen tap uses trusted touch
input when the context hasTouch option is enabled:
https://playwright.dev/docs/api/class-touchscreen#touchscreen-tap .

## Targeted correction

- Scroll the stationary, visible faculty marquee container first.
- Desktop: existing CSS hover pause, normal actionable click, no `force`.
- Mobile: isMobile/hasTouch enabled; native touchscreen tap into the largest
  currently hittable card interior, not a simulated desktop hover.
- Re-evaluate geometry for every preview opening. Reject hidden, inert,
  disconnected, disabled, clipped-edge and obscured targets. Check actual
  elementFromPoint ownership, then require the matching named dialog.
- Preserve saved biography, close, Escape, no-login/no-private-team-fetch before
  Explore, login destination, successful credential submission and Team-page
  destination assertions.
- Preserve all original cases, all other test files and the first three player
  cases in the edited test file. No timeout/retry increase, skip, CSS injection
  or forced synthetic click in the actual Next browser suite.
- Add 27 focused controlled tests for the new read-only target observer/helper.

## Executed in this environment

Runtime: Node 22.16.0, Linux. Global TypeScript was supplied through the existing
TYPESCRIPT_PATH hook for controlled transpilation, not installed as a fake app
dependency. Native Chromium: 144.0.7559.96.

| Executed check | Result | Scope |
|---|---:|---|
| Backend `node --test backend/test/*.test.js` | 853 passed, 0 failed | Unit/fixture/provider/database stubs, not Atlas settlement |
| Frontend `node --test frontend/test/*.test.mjs` | 477 passed, 0 failed | Controlled component hooks, API and fixture checks |
| Runtime/release-tool tests | 51 passed, 0 failed | Existing runtime/install/report policy tests |
| New team-target regression subset | 27 passed | Included in the 477, not an extra independent total |
| Protected-file check | 284 protected files; zero differences | Original CSS prefix checked too |
| Source syntax/import check | 130 TS/TSX, 173 JS, 325 relative imports; zero errors | NOT the full dependency-backed TypeScript check |
| Old animated-child scroll reproduction | 2/2 reproduced | Native Chromium, actual stylesheet at 390px and 1440px |
| New mouse/touch native DOM scenarios | 18/18 passed, 54 preview opens | Actual JSX/CSS fixture, controlled DOM bridge; not Next |
| Browser declaration inventory | 59 declarations retained | Enumeration only, NOT execution |

### Native browser experiment boundaries

A loopback HTTP navigation attempt was blocked by environment administrator
policy (`ERR_BLOCKED_BY_ADMINISTRATOR`); it is recorded, not represented as a
successful full navigation test. The usable experiment loads generated markup
with `setContent`, embeds the unchanged stylesheet, and dispatches trusted
browser mouse/touch input through the exact new TypeScript interaction helper.
Bounded assertion adapters check real DOM state; they are not a replacement
for @playwright/test or the actual release command.

The generated DOM comes from the current landing component's JSX with controlled
resources and hooks. A clearly marked DOM bridge opens/closes the generated
modal; it does not run the whole Next/React application. Full-profile intent is
recorded as `/login?next=%2Fteam`; actual router/auth/navigation is NOT tested in
this isolated experiment. Existing controlled callback tests exercise the real
component callback separately. Full integration remains in the 59-case suite.

The 18 scenarios cover 390px touch (1 and 17 members), 820px touch, 844px landscape
touch, and 1440px mouse (1 and 17 members), each at three phases of the original
animation. Each opens three previews using real input and verifies biography,
Escape, Close, reopen, and full-profile intent. All recorded input is trusted.
The 36-second CSS animation is not removed, frozen or slowed; the isolated
experiment seeds its currentTime at three phases to cover offscreen clones.
The old negative diagnostic uses a short timeout solely to reproduce the hang
quickly. Actual application test deadlines and retry settings remain unchanged.

## What was NOT verified here

`npm run verify:release` was attempted on this release and stopped during actual
dependency installation with `EAI_AGAIN registry.npmjs.org` fetching bcryptjs.
See `qa/v60.13.3/evidence/release-attempt.log` and the archived report. No private
.env credentials or lockfiles were invented to get past this. The pipeline was
not weakened. No remaining gate is recorded as passed by that attempted run.

Therefore this environment did NOT complete the updated full Next production
build, dependency-backed application TypeScript check, full 59-case Next/browser
suite, fresh npm audit, actual MongoDB/provider transactions, SMTP authentication
or inbox delivery. Earlier user runs are evidence for their recorded version,
not automatic proof for this version. Node 24 and the Hostinger runtime have
not been executed for this patch here. The user must run the unchanged local
release gate on their networked installation before deployment.

## Preservation and packaging

Version labels change from 60.13.2 to 60.13.3 in the three package manifests,
backend health/start labels and existing BusinessPortal label. Other than these
labels, production frontend/backend source, all stylesheet bytes, assets,
lesson player, image optimization, public preview component, auth/session,
payment, invoice, email and certificate code are unchanged from the supplied
V60.13.2 ZIP. Dependency declarations and protected UI baseline are unchanged.

Detailed byte comparison is recorded in `qa/v60.13.3/preservation.json`. Complete
ZIP CRC and fresh-extracted source comparisons are recorded in the external
packaging report. Backend, controlled frontend and runtime tests are rerun from
the extracted finished archive before delivery. Their extracted-run logs are
provided in the external evidence ZIP rather than rewriting the finished ZIP.

No migration, seed, database reset, secret rotation, Node removal or NVM install
is required. Working private env files and tested lockfiles must be preserved.
No deployment, live payment or universal zero-error/zero-latency guarantee is
claimed by this targeted correction.
