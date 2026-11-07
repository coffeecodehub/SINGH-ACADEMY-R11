# Seven-task update (R9)

This update is limited to the seven requested tasks on top of the complete R8 source. The owner clarified that Carousel/multi-image galleries are the Task 1 target and My Billing is the Task 6 target. Course/team card grids, routes, schema files, environment values, dependency locks and original assets are unchanged.

## Behavior

1. Existing Carousel galleries loop smoothly in the editor preview and public page; hover/focus/touch pause remains available. Other saved gallery layouts are retained.
2. Review teasers autoplay muted in view and pause offscreen or in a hidden tab. Posters cover initialization. Where FFmpeg is installed, a bounded background job creates a short H.264 faststart preview and poster; full originals stay byte-for-byte intact.
3. Bounded caches, batch publication checks and relevant navigation prefetch reduce repeated data and image work while preserving account/country boundaries and CMS invalidation.
4. Image/video uploads show actual transfer versus processing, support cancellation, settle on stalled processing and retry only a confirmed pre-storage admission rejection. Required malware scanning remains enabled.
5. Checkout displays safe provider errors with a request ID, retaining same-order recovery and duplicate-charge protection.
6. My Billing has themed enable/disable/cancel controls and confirmation cards. Existing provider consent, paid-access semantics and two-step immediate cancellation are retained.
7. PayPal accepts the requested secret alias without breaking the original setting. Live configuration and webhook steps are in [PAYMENTS-LIVE-CHECKLIST-R9.md](PAYMENTS-LIVE-CHECKLIST-R9.md).

## Validation and limits

Current-run validation is recorded in [the R9 result file](../qa/v60.16.0-r9/results.json). Local HTTP/payment fixtures do not certify live keys, merchant activation, Hostinger settings, scanner quota or deployed webhook delivery. First-load latency depends on the network and host; zero milliseconds cannot be guaranteed. Social providers retain their own autoplay/privacy rules. See [MEDIA-PERFORMANCE-R9.md](MEDIA-PERFORMANCE-R9.md).

The fresh online npm audit was blocked by automatic approval review because it exports dependency metadata to an external service. It was not bypassed or reported as a new audit pass. Dependency manifests/locks are unchanged; local installed-library/security checks are recorded separately.

## Application, documentation and test-isolation files

| File | Task | Reason |
| --- | --- | --- |
| `backend/integration/isolation.js` | 7 | Prevent inherited PayPal alias from reaching isolated integration fixtures. |
| `backend/src/app.js` | 5, 7 | Payment-only safe HTTP errors and bounded provider diagnostics. |
| `backend/src/routes/mediaRoutes.js` | 2, 3 | Batch publication checks; authorize originals before poster/preview and preserve Range responses. |
| `backend/src/routes/pageSectionRoutes.js` | 3 | Cache published page blocks with successful-save invalidation. |
| `backend/src/routes/videoReviewRoutes.js` | 2, 3 | Cache published review DTOs and invalidate after review writes. |
| `backend/src/services/pageSectionUploads.js` | 4 | Bound image/video storage processing and clean incomplete uploads. |
| `backend/src/services/paymentProviders.js` | 5, 7 | Resolve PayPal secret alias consistently; retain safe transport context. |
| `backend/src/services/publicImageReferences.js` | 3 | Coalesce cold image publication checks into bounded batches. |
| `backend/src/services/uploads.js` | 4 | Mark known pre-storage busy rejection; bound administrator image storage. |
| `backend/src/services/videoReviewPlayback.js` | 2 | Optional background H.264 faststart teaser and poster, separate from original bytes. |
| `backend/src/services/videoReviewUploads.js` | 2, 4 | Bound original storage and queue optional playback optimization after upload confirmation. |
| `backend/src/utils/commerce.js` | 7 | Support PAYPAL_SECRET while preserving PAYPAL_CLIENT_SECRET; reject conflicting values. |
| `backend/src/utils/paymentProviderErrors.js` | 5, 7 | Map provider failures to safe messages and bounded diagnostic fields. |
| `backend/src/utils/paymentWebhookPolicy.js` | 7 | Include PayPal secret alias in existing secret redaction. |
| `backend/src/utils/uploadStorage.js` | 4 | Shared bounded commit budgets and scoped incomplete-file cleanup. |
| `docs/MEDIA-PERFORMANCE-R9.md` | 2, 4 | Document optional FFmpeg, upload phases and host/browser limitations. |
| `docs/PAYMENTS-LIVE-CHECKLIST-R9.md` | 5, 7 | Exact live settings, webhook URLs and operator acceptance checklist. |
| `frontend/app/billing/billing-v50.css` | 6 | Scoped My Billing action colors, icons, interaction states and animated confirmation cards. |
| `frontend/app/checkout/page.tsx` | 5 | Retain safe provider error and request ID after existing same-order recovery. |
| `frontend/app/events/page.tsx` | 3 | Reuse shared cached event data across navigation and transient failures. |
| `frontend/components/CatalogWarmup.tsx` | 3 | Bound public data and first-row image prefetch to relevant navigation intent. |
| `frontend/components/WebsiteContent.tsx` | 3 | Reuse cached website settings without server/client hydration differences. |
| `frontend/components/billing/AutoRenewals.tsx` | 6 | Replace native confirmations with in-page cards; preserve API payloads and provider checks. |
| `frontend/components/billing/BillingActionConfirmation.tsx` | 6 | Accessible action card with focus, cancel, owner and duplicate-submit safeguards. |
| `frontend/components/billing/BillingCancellationDialog.tsx` | 6 | Destructive-action styling/icon only; preserve the existing two-step cancellation. |
| `frontend/components/billing/CancelPurchaseAccess.tsx` | 6 | Style the existing purchase-access cancellation control without changing requests. |
| `frontend/components/cms/CropMediaField.tsx` | 4 | Show crop upload progress; preserve confirmed original across a failed crop retry. |
| `frontend/components/cms/Fields.tsx` | 4 | Use reliable image/video transfer helper; keep the document branch unchanged. |
| `frontend/components/cms/ImageCropEditor.tsx` | 4 | Show image upload progress in the existing crop dialog footer. |
| `frontend/components/cms/PageSectionsEditor.tsx` | 4 | Display a progress bar beside the existing upload status. |
| `frontend/components/cms/VideoReviewsEditor.tsx` | 4 | Display actual transfer/processing progress and clear upload errors. |
| `frontend/components/content/PageGallery.tsx` | 1, 3 | Seamless Carousel repetitions; accessible originals; first above-fold original prioritized. |
| `frontend/components/content/PageSections.tsx` | 3 | Reuse cached page blocks and prioritize above-fold custom imagery. |
| `frontend/components/content/page-sections.css` | 1 | Carousel-only positioning for smooth repeated track. |
| `frontend/components/video-reviews/ReviewVideo.tsx` | 2 | Autoplay follows viewport/tab visibility; retain posters while the player initializes. |
| `frontend/components/video-reviews/VideoReviews.tsx` | 2, 3 | Reuse the shared cached public review list. |
| `frontend/components/video-reviews/video-reviews.css` | 2 | Scoped poster/player stacking during initialization. |
| `frontend/lib/adminUpload.ts` | 4 | Progress phases, inactivity/processing watchdogs and admission-only retry. |
| `frontend/lib/api.ts` | 3 | Account-bound public cache subscriptions, CMS/video eligibility and shared-event invalidation. |
| `frontend/lib/galleryMotion.ts` | 1 | Continuous wrap with hover/focus/touch/visibility/motion-preference pause. |
| `frontend/lib/imageWarmup.ts` | 3 | Bound image preparation for sections, team, events and page galleries. |
| `frontend/lib/usePublicResource.ts` | 3 | Render prefetched results immediately on navigation and fence account/country scopes. |
| `frontend/lib/videoReviews.ts` | 2 | Resolve supported poster and optimized-preview URLs. |
| `scripts/integration-check.mjs` | 7 | Remove inherited PayPal alias from synthetic test environments. |
| `docs/SEVEN-TASK-CHANGES-R9.md` | 1–7 | Requested file-by-file change summary. |
| `docs/release-baseline-v60.16.0.json` | 1–7 | Refresh exact reviewed source hashes so integrity checks verify this scoped update. |

## Test files

Existing assertions are retained; fixture imports and provider/media setup follow the scoped implementation changes. Each file below adds or updates directly related regression coverage.

| File | Coverage |
| --- | --- |
| `backend/integration/payment-checkout-errors.test.js` | Real local HTTP/Mongo/payment or media regression; isolated fixture cleanup. |
| `backend/integration/public-image-references-r9.test.js` | Real local HTTP/Mongo/payment or media regression; isolated fixture cleanup. |
| `backend/integration/upload-local-r6.test.js` | Real local HTTP/Mongo/payment or media regression; isolated fixture cleanup. |
| `backend/integration/v60-15-3-upload-scanning.test.js` | Real local HTTP/Mongo/payment or media regression; isolated fixture cleanup. |
| `backend/integration/video-playback-r9.test.js` | Real local HTTP/Mongo/payment or media regression; isolated fixture cleanup. |
| `backend/integration/video-reviews.test.js` | Real local HTTP/Mongo/payment or media regression; isolated fixture cleanup. |
| `backend/test/page-sections.test.js` | Unit/hook regression and directly affected fixture setup. |
| `backend/test/payment-checkout-errors.test.js` | Unit/hook regression and directly affected fixture setup. |
| `backend/test/payments-live-safety.test.js` | Unit/hook regression and directly affected fixture setup. |
| `backend/test/public-image-references-r9.test.js` | Unit/hook regression and directly affected fixture setup. |
| `backend/test/v60-11-reliability.test.js` | Unit/hook regression and directly affected fixture setup. |
| `backend/test/v60-14-switch-team.test.js` | Unit/hook regression and directly affected fixture setup. |
| `backend/test/v60-9-reliability.test.js` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/admin-upload-r9.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/api-client.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/automatic-media-r6.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/billing-action-confirmation.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/billing-cancellation-dialog.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/cancel-purchase-access.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/catalog-refresh.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/catalog-warmup-r9.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/crop-upload-r9.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/page-gallery-r5.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/renewal-controls.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/v60-11-auth-hydration.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/v60-13-media-images.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/v60-16-admin-catalog.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/video-review-visible-r9.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/test/website-cache-r9.test.mjs` | Unit/hook regression and directly affected fixture setup. |
| `frontend/ui-tests/billing-action-confirmation.spec.ts` | Actual Next/Chromium regression for the changed gallery, video, checkout or billing behavior. |
| `frontend/ui-tests/cancel-access.spec.ts` | Actual Next/Chromium regression for the changed gallery, video, checkout or billing behavior. |
| `frontend/ui-tests/deferred-renewal-setup.spec.ts` | Actual Next/Chromium regression for the changed gallery, video, checkout or billing behavior. |
| `frontend/ui-tests/page-gallery-r5.spec.ts` | Actual Next/Chromium regression for the changed gallery, video, checkout or billing behavior. |
| `frontend/ui-tests/payment-errors-r9.spec.ts` | Actual Next/Chromium regression for the changed gallery, video, checkout or billing behavior. |
| `frontend/ui-tests/payments-v60-12.spec.ts` | Actual Next/Chromium regression for the changed gallery, video, checkout or billing behavior. |
| `frontend/ui-tests/pending-billing-r6.spec.ts` | Actual Next/Chromium regression for the changed gallery, video, checkout or billing behavior. |
| `frontend/ui-tests/player-preview-v60-13-2.spec.ts` | Bound guest public prefetch; retain no-write/protected-API and profile-login assertions. |
| `frontend/ui-tests/video-reviews.spec.ts` | Actual Next/Chromium regression for the changed gallery, video, checkout or billing behavior. |

Compared against the immutable complete R8 release, SHA256 `0bf12cc6761efefaf85eb74b6c0589db33639b098c6889a928d329e7053593da`. No application source files were deleted or renamed. All 268 protected original public/certificate assets and the supplied full-resolution hero photographs remain unchanged.
