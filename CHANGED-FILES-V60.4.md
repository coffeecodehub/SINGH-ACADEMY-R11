# Singh Academy V60.4 — Changed Files

V60.4 is based on V60.3. The approved public visual baseline remains protected. Changes are limited to the explicitly requested footer contact presentation, async/busy feedback, broader lesson video-link support, performance/runtime hardening, Atlas fresh-database initialization, payment review-mode safeguards, dependency security resolution, and supporting QA/release documentation.

## Added

- `HOSTINGER-REVIEW-V60.4.md` — sandbox/review deployment guide for Hostinger.
- `START-HERE-V60.4.md` — V60.4 setup and verification sequence.
- `V60.4-FIX-NOTES.md` — release behavior and compatibility notes.
- `V60.4-DEEP-QA-REPORT.md` — final audit evidence and limitations.
- `CHANGED-FILES-V60.4.md` — this file.
- `backend/src/scripts/migrateV604.js` — fresh/existing database migration entry point.
- `backend/test/v60-4-regressions.test.js` — V60.4 regression suite.
- `frontend/lib/publicSiteContent.ts` — short-lived shared public-site-content request cache.

## Removed

- Root `package-lock.json` — root workspace has no runtime dependencies and the lockfile caused Next.js workspace-root ambiguity. Backend/frontend lockfiles are intentionally generated from their own package manifests by the release/CI install step.

## Updated — release / CI

- `.github/workflows/quality.yml`
- `README.md`
- `package.json`
- `backend/package.json`
- `frontend/package.json`

## Updated — backend

- `backend/.env.example`
- `backend/src/app.js`
- `backend/src/routes/contentRoutes.js`
- `backend/src/scripts/checkPayments.js`
- `backend/src/scripts/setupLocal.js`
- `backend/src/server.js`
- `backend/src/utils/commerce.js`
- `backend/src/utils/deployment.js`
- `backend/src/utils/enrollmentIndexes.js`
- `backend/test/v60-3-regressions.test.js`

## Updated — frontend

- `frontend/app/academy/page.tsx`
- `frontend/app/checkout/page.tsx`
- `frontend/app/checkout/return/page.tsx`
- `frontend/app/contact/page.tsx`
- `frontend/app/courses/[slug]/page.tsx`
- `frontend/app/forgot-password/page.tsx`
- `frontend/app/learn/[course]/page.tsx`
- `frontend/app/login/page.tsx`
- `frontend/app/register/page.tsx`
- `frontend/app/reset-password/page.tsx`
- `frontend/app/reviews/page.tsx`
- `frontend/app/styles.css`
- `frontend/app/verify-otp/page.tsx`
- `frontend/components/WebsiteContent.tsx`
- `frontend/components/admin/AdminLogin.tsx`
- `frontend/components/billing/PaymentReceiptCard.tsx`
- `frontend/components/billing/SubscriptionNotifications.tsx`
- `frontend/components/business/BusinessPortal.tsx`
- `frontend/components/cms/AdminConfirm.tsx`
- `frontend/components/cms/LessonEditor.tsx`
- `frontend/components/layout/SiteFooter.tsx`
- `frontend/lib/video.ts`
- `frontend/middleware.ts`

## Explicit preservation

- The approved certificate implementation is unchanged.
- Existing public branding, colors, typography and general layout are not redesigned.
- The existing top/navigation Contact menu remains in place.
- Learner state remains account-owned: enrollment, membership/subscription, progress, attempts/answers, billing/payment, notifications and certificate/completion state are never shared globally by course.
