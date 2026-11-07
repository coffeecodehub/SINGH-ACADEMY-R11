# Singh Academy — membership access + password eye release

**Scope:** Existing Stripe/PayPal code, webhook ID, billing, prices, public design, other admin panels and database records have not been changed. This package is a complete project, **not** a patch ZIP. It contains `backend/`, `frontend/`, scripts, docs, deployment configuration, and restored `.env.example` templates. The real `.env` files and `node_modules` are intentionally excluded.

## What changed

- Member can still access every published course with an active **LIVE** membership, including courses published after membership purchase; protected authorization remains on the backend. The old recorded **Sandbox** membership stays `testMode:true` and cannot be treated as LIVE paid access.
- `My Courses` now filters the published course list to explicitly enrolled/started membership courses plus separately valid individual/free course grants; auto-created membership mirror rows do not automatically fill the My Courses list. Clicked membership enrollment has a durable marker in its existing `Enrollment.reason` field. Historical payment/entitlement records are untouched.
- The shared password input now shows a borderless eye icon **inside** the existing input at all student/admin login, registration and password-reset pages. No separate outside border-box button; no redesign of other forms.
- Old tests that demanded the undesired full-library My Courses behavior and outside-eye layout were updated, *and* functional membership/enrollment regression tests were added. Strict file-integrity guard continues rejecting unrelated UI edits.

## Executed verification (this run)

| Check | Result |
|---|---|
| Backend automated tests (including 10 additional enrollment/access contracts) | **1,095 / 1,095 PASS** |
| Frontend reliability/UI logic tests | **561 / 561 PASS** |
| Tooling/manifest policy tests | **166 / 166 PASS** |
| Backend API contract tests | **14 / 14 PASS** |
| Frontend TypeScript / JS parser-import checks | **PASS / 0 syntax errors** |
| Public UI hash guard & approved changes-only hash guard | **PASS** |
| Chromium password-eye geometry (390, 820, 1440px) | **PASS (isolated actual component HTML/CSS)** |
| Dependency policy version pins (manifest-only) | **PASS** |

**Limits (do not call these passes):** The full `npm run verify` could not complete in this Linux runtime because recovered original dependencies contain Windows native artifacts, while the matching Linux Sharp and Next SWC binaries could not be downloaded (`registry.npmjs.org` DNS `EAI_AGAIN`). This is an environmental blocker, not an asserted source-code defect. Actual Next production-build, real logged-in browser integration, actual Atlas DB transactions, LIVE signed webhook deliveries, receipts and LIVE payment authorization were **not** performed here. Nobody can guarantee a zero-error deployment from unit tests alone.

## Before GitHub/Hostinger deploy — Windows VS Code

1. Extract this ZIP to a **new folder**; do not delete the healthy existing project.
2. Open the project root in VS Code (has `package.json`, `backend/`, and `frontend/`). Install from the unchanged lockfiles if dependencies are absent:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
```

3. Run the project's comprehensive release gate:

```powershell
npm run verify
```

Stop if FAIL. After a PASS, run the existing project's `npm run verify:integration` on a dedicated local/Docker test DB and `npm run test:ui` with appropriate browser fixtures, before approving deployment. Never connect those tests to production financial or DB records. Test with **real LIVE membership records** only during client-authorized post-deployment acceptance.

4. Review `git diff` against current GitHub `main`, commit only authorized source/QA files (never `.env`, `node_modules`, `.next`, local log files). Preserve the healthy rollback commit. Hostinger backend root `backend`, frontend root `frontend`, Node 22.x. The live secret keys stay in the backend environment only; keep the **existing** LIVE PayPal Webhook ID.

5. Deploy backend and frontend, require `/api/health/ready` HTTP 200 with `ready:true`, then run:

```powershell
npm run deploy:check -- --front https://singhacademy.com --api https://api.singhacademy.com
```

6. **Before enabling LIVE checkout**, manually verify actual owned LIVE membership status and course access: (a) active member can enroll/open every published course without seeing a purchase prompt, including newer courses; (b) only explicitly enrolled ones appear in My Courses; (c) individually purchased course has no access to unrelated paid courses; (d) after expiry/refund membership-based access ends; (e) old Sandbox membership is not treated as LIVE payment; (f) My Billing unchanged. Check eye button via keyboard and mobile layout. Keep `ONLINE_PAYMENTS_ENABLED=false` until acceptance is completed.

7. Only after production stability and merchant approval, change the existing Hostinger backend `ONLINE_PAYMENTS_ENABLED=true`; a real purchase charges real money. Run an **authorized legitimate Stripe and PayPal transaction** and verify provider-signed delivery, exactly one invoice/receipt, and correct entitlement. Do not retry when payment outcome is uncertain; do not convert old Sandbox payments into LIVE revenue.

Original Stripe/PayPal LIVE credential-registration PASS and PayPal ninth-event repair were reported in previous user-run verification; **not re-run by this source-only release**. No API keys, webhook settings or production services were touched during construction of this ZIP.
