# Singh Academy V60.10 — Changed files vs supplied V60.9

New setup/QA documents supersede older release notes. No certificate renderer/artwork or public stylesheet changes. Dependencies unchanged; own package version bumped to 60.10.0.

| Action | Path |
|---|---|
| Modified | `backend/.env.example` |
| Modified | `backend/package.json` |
| Modified | `backend/src/app.js` |
| Modified | `backend/src/controllers/authController.js` |
| Modified | `backend/src/middleware/auth.js` |
| Added | `backend/src/middleware/catalogAccess.js` |
| Modified | `backend/src/routes/contentRoutes.js` |
| Modified | `backend/src/routes/securityRoutes.js` |
| Modified | `backend/src/scripts/setupLocal.js` |
| Modified | `backend/src/server.js` |
| Modified | `backend/src/services/identity.js` |
| Added | `backend/src/services/landingContent.js` |
| Modified | `backend/src/services/sessions.js` |
| Modified | `backend/src/services/studentNotifications.js` |
| Modified | `backend/src/utils/deployment.js` |
| Modified | `backend/src/utils/security.js` |
| Modified | `backend/src/utils/subscriptionDisplay.js` |
| Modified | `backend/test/auth-handlers.test.js` |
| Modified | `backend/test/v46-hardening.test.js` |
| Modified | `backend/test/v46-setup.test.js` |
| Modified | `backend/test/v50-notifications.test.js` |
| Modified | `backend/test/v58-regressions.test.js` |
| Added | `backend/test/v60-10-policy.test.js` |
| Modified | `backend/test/v60-7-reliability.test.js` |
| Modified | `backend/test/v60-9-reliability.test.js` |
| Modified | `frontend/app/api/app-build/route.ts` |
| Modified | `frontend/app/billing/page.tsx` |
| Modified | `frontend/app/checkout/page.tsx` |
| Modified | `frontend/app/checkout/return/page.tsx` |
| Added | `frontend/app/connection/page.tsx` |
| Modified | `frontend/app/error.tsx` |
| Modified | `frontend/app/login/page.tsx` |
| Modified | `frontend/app/page.tsx` |
| Modified | `frontend/app/register/page.tsx` |
| Modified | `frontend/components/CatalogWarmup.tsx` |
| Modified | `frontend/components/SiteHeader.tsx` |
| Modified | `frontend/components/WebsiteContent.tsx` |
| Modified | `frontend/components/admin/AdminLogin.tsx` |
| Modified | `frontend/components/auth/AuthProvider.tsx` |
| Modified | `frontend/components/auth/LandingAuthGate.tsx` |
| Modified | `frontend/components/billing/SubscriptionProgress.tsx` |
| Modified | `frontend/components/business/BusinessPortal.tsx` |
| Modified | `frontend/components/business/SecurityPanel.tsx` |
| Modified | `frontend/components/layout/SiteFooter.tsx` |
| Modified | `frontend/lib/api.ts` |
| Added | `frontend/lib/checkoutSafety.ts` |
| Added | `frontend/lib/errorRecovery.ts` |
| Modified | `frontend/lib/pagePolicy.ts` |
| Modified | `frontend/lib/server/apiProxy.mjs` |
| Modified | `frontend/lib/server/pageSession.ts` |
| Added | `frontend/lib/subscriptionClock.ts` |
| Added | `frontend/lib/websiteConfig.ts` |
| Modified | `frontend/middleware.ts` |
| Modified | `frontend/package.json` |
| Modified | `frontend/test/api-client.test.mjs` |
| Modified | `frontend/test/deployment-script.test.mjs` |
| Modified | `frontend/test/page-access.test.mjs` |
| Added | `frontend/test/v60-10-reliability.test.mjs` |
| Modified | `package.json` |
| Modified | `scripts/check-deployment.mjs` |
| Modified | `scripts/prepare-production.mjs` |
| Modified | `scripts/render-header-fixtures.mjs` |

Additional release documentation: README.md, START-HERE-V60.10.md, QA-V60.10.md, CHANGED-FILES-V60.10.md and actual evidence in qa/v60.10/.
