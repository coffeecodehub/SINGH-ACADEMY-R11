# V60.7 source changes

Compared with the supplied V60.6.1 archive. No dependency version or override was changed.

## Modified
- `.github/workflows/quality.yml`
- `README.md`
- `backend/.env.example`
- `backend/package.json`
- `backend/src/app.js`
- `backend/src/controllers/authController.js`
- `backend/src/middleware/auth.js`
- `backend/src/middleware/httpSafety.js`
- `backend/src/middleware/rateLimit.js`
- `backend/src/models/StudentNotification.js`
- `backend/src/routes/paymentRoutes.js`
- `backend/src/server.js`
- `backend/src/services/onlineCheckout.js`
- `backend/src/services/studentNotifications.js`
- `backend/src/services/uploads.js`
- `backend/src/utils/deployment.js`
- `backend/src/utils/mailer.js`
- `backend/src/utils/security.js`
- `backend/src/utils/subscriptionNotifications.js`
- `backend/test/auth-handlers.test.js`
- `backend/test/v47-workflows.test.js`
- `backend/test/v50-notifications.test.js`
- `backend/test/v58-regressions.test.js`
- `backend/test/v60-5-regressions.test.js`
- `frontend/.env.example`
- `frontend/app/academy/page.tsx`
- `frontend/app/checkout/page.tsx`
- `frontend/app/checkout/return/page.tsx`
- `frontend/app/courses/[slug]/page.tsx`
- `frontend/app/courses/page.tsx`
- `frontend/app/home/page.tsx`
- `frontend/app/learn/[course]/page.tsx`
- `frontend/app/login/page.tsx`
- `frontend/app/my-course/page.tsx`
- `frontend/app/page.tsx`
- `frontend/app/reviews/page.tsx`
- `frontend/app/team/page.tsx`
- `frontend/components/SiteHeader.tsx`
- `frontend/components/auth/AuthProvider.tsx`
- `frontend/components/business/BusinessPortal.tsx`
- `frontend/lib/api.ts`
- `frontend/lib/publicSiteContent.ts`
- `frontend/next.config.ts`
- `frontend/package.json`
- `package.json`
- `scripts/start-browser-stack.mjs`
- `scripts/verify.mjs`

## Added
- `HOSTINGER-V60.7-UPDATE.md`
- `START-HERE-V60.7.md`
- `backend/src/scripts/diagnoseContent.js`
- `backend/src/scripts/migrateV607.js`
- `backend/test/v60-7-reliability.test.js`
- `frontend/app/api/[...path]/route.ts`
- `frontend/components/ApiLoadError.tsx`
- `frontend/e2e/reliability.spec.ts`
- `frontend/lib/server/apiProxy.d.mts`
- `frontend/lib/server/apiProxy.mjs`
- `frontend/lib/useMembershipAccess.ts`
- `frontend/lib/usePublicResource.ts`
- `frontend/test/api-client.test.mjs`
- `frontend/test/auth-session.test.mjs`
- `frontend/test/compile.mjs`
- `frontend/test/proxy.test.mjs`
- `qa/v60.7/gateway-browser-fixture.mjs`
- `qa/v60.7/gateway-browser-results.json`
- `qa/v60.7/preserved-files.json`
- `qa/v60.7/run-gateway-browser.py`
- `scripts/check-deployment.mjs`
- `scripts/check-release-ui.mjs`

QA reports/manifests added during packaging are also included.
