# V60.9 changed files

Baseline: V60.8 Complete. No live hosting/database configuration was edited.

## Change groups

**Page authentication:** server-verified document middleware, safe session bootstrap, client navigation gate, root-scoped HttpOnly login cookies, catalog API authorization. Existing logout revocation/account fences retained.

**Catalog and media:** account-bound browser reuse, small raw-CMS server cache, bounded authenticated warmup, visible-tab refresh, original image retry/fallback, published-only image derivatives. No shared learner-state cache.

**Learning:** reset newly mounted recorded media to 0; stable lesson/block identity; owned batch certificate status with bounded polling; no progress reset or billing rewrite.

**Navbar:** appended responsive correction. Desktop links above 900px; second row on901–1199px; original mobile compact menu below.

**Release:** versions 60.9.0, independent frontend build endpoint, private-catalog-aware deployment diagnostic, updated release-preservation manifest and honest QA/local instructions. Certificate generator/artwork remain unchanged.

**Tests:** new handler/policy/media/cache/polling/image/diagnostic checks. Existing assertions were updated only for explicitly requested login scope/cookie path, media-component extraction and live certificate UI. Security, signature verification, owned downloads and data isolation assertions remain active. Full installed-dependency browser/DB tests require a networked local/CI run.

## Modified baseline files

- `.github/workflows/quality.yml`
- `README.md`
- `backend/integration/v47-checkout-certificates.test.js`
- `backend/integration/v48-learning-review.test.js`
- `backend/integration/v48-role-http.test.js`
- `backend/package.json`
- `backend/src/app.js`
- `backend/src/controllers/authController.js`
- `backend/src/routes/certificateRoutes.js`
- `backend/src/routes/contentRoutes.js`
- `backend/src/routes/courseRoutes.js`
- `backend/src/routes/mediaRoutes.js`
- `backend/src/server.js`
- `backend/src/services/sessions.js`
- `backend/src/utils/security.js`
- `backend/test/security-utils.test.js`
- `backend/test/v55-regressions.test.js`
- `backend/test/v58-regressions.test.js`
- `backend/test/v60-4-regressions.test.js`
- `frontend/app/certificates/page.tsx`
- `frontend/app/courses/page.tsx`
- `frontend/app/home/page.tsx`
- `frontend/app/layout.tsx`
- `frontend/app/learn/[course]/page.tsx`
- `frontend/app/my-course/page.tsx`
- `frontend/app/styles.css`
- `frontend/app/team/page.tsx`
- `frontend/components/AcademyImage.tsx`
- `frontend/components/CertificateStatus.tsx`
- `frontend/components/SiteHeader.tsx`
- `frontend/components/WebsiteContent.tsx`
- `frontend/components/auth/AuthProvider.tsx`
- `frontend/components/business/BusinessPortal.tsx`
- `frontend/components/business/Certificates.tsx`
- `frontend/components/layout/SiteFooter.tsx`
- `frontend/e2e/public-portals.spec.ts`
- `frontend/e2e/reliability.spec.ts`
- `frontend/lib/api.ts`
- `frontend/lib/authBoundary.ts`
- `frontend/lib/publicSiteContent.ts`
- `frontend/lib/server/apiProxy.mjs`
- `frontend/lib/usePublicResource.ts`
- `frontend/lib/video.ts`
- `frontend/middleware.ts`
- `frontend/package.json`
- `frontend/playwright.ui.config.ts`
- `frontend/test/api-client.test.mjs`
- `frontend/test/auth-session.test.mjs`
- `frontend/test/compile.mjs`
- `frontend/test/proxy.test.mjs`
- `frontend/ui-tests/logout-free-tablet.spec.ts`
- `package.json`
- `scripts/check-deployment.mjs`
- `scripts/check-preserved-ui.mjs`
- `scripts/check-release-ui.mjs`

## New implementation/test/document files (excluding QA artifacts)

- `QA-V60.9.md`
- `START-HERE-V60.9.md`
- `backend/src/middleware/catalogInvalidation.js`
- `backend/src/services/catalogCache.js`
- `backend/src/services/imageVariants.js`
- `backend/test/v60-9-reliability.test.js`
- `frontend/app/api/app-build/route.ts`
- `frontend/components/CatalogWarmup.tsx`
- `frontend/components/auth/SiteAccessGate.tsx`
- `frontend/components/learning/LessonMedia.tsx`
- `frontend/e2e/account-fixture.ts`
- `frontend/lib/completionFeed.ts`
- `frontend/lib/imageSources.ts`
- `frontend/lib/pagePolicy.ts`
- `frontend/lib/server/pageSession.ts`
- `frontend/lib/useLiveCompletion.ts`
- `frontend/test/catalog-refresh.test.mjs`
- `frontend/test/completion-feed.test.mjs`
- `frontend/test/deployment-script.test.mjs`
- `frontend/test/hooks.mjs`
- `frontend/test/media-reliability.test.mjs`
- `frontend/test/page-access.test.mjs`
- `scripts/start-ui-stack.mjs`
