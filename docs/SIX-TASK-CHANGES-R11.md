# R11: only the six requested corrections

## Confirmed findings and resulting behavior

1. **Local uploads:** the reported503 comes from the selected scanner being unavailable, not React DevTools/Fast Refresh/lazy-image notices. Existing setup preserved the selected Cloudmersive or configured ClamAV scanner, so `UPLOAD_SCAN_REQUIRED=false` alone did not stop that provider call. The real remote scanner service/account was not inspected. Normal setup now adds an explicit missing `LOCAL_UPLOADS_UNSCANNED=true` for exact localhost development, preserving scanner keys and existing false. Actual request peer/Host/Origin must also be local; public forwarded identities are refused. Review/production ignore the flag and retain mandatory scanning. File signature/image checks remain. Existing error/finally handling returns explicit failures, preserves review draft text and releases upload state/slots.
2. **Autoplay:** an OS `prefers-reduced-motion: reduce` setting permanently blocked native playback and YouTube frame startup. Both failures were reproduced before the fix. Requested review media no longer uses that decorative-motion veto; viewport, hidden-tab and open-full-player pauses remain. Inline previews are muted/inline and loop the existing15–20-second cutoff. Explicit full playback preserves original duration, sound and controls. New reviews inherit the shared player automatically.
3. **Carousel:** R10 introduced `flex-basis:100%`, zero gap and no image-height cap. The original R9 values are restored: `clamp(240px,70%,700px)`,20px gap,720px image cap, original responsive sizing/crop behavior. Auto motion advances one image/card plus gap, retaining original partial-next-image visibility. Desktop/mobile actual Chromium measurements match R9; other gallery modes/styles are unchanged.
4. **Public preview labels:** removed the public “Short muted previews…” paragraph and per-card duration/external-source technical label. Titles, descriptions, Watch full video and playback behavior remain. Admin duration controls remain because they set the actual preview length.
5. **Full section suggestion:** ordinary course checkout already returned its owning section, but the Complete section option previously depended on a section parameter in the incoming URL. One optional scoped box now reads the real section and regional offers, shows title/published child count/price, and opens existing section checkout as a fresh same-origin document so its original initial-mode logic selects section access. It hides for active section access, unpublished/missing/unavailable sections and deferred renewal setup, and disables while the existing course attempt is busy/pending. No new checkout/order is created by showing or navigating the suggestion.
6. **Payments:** no new payment defect was reproduced in the code audit and isolated checks; payment handlers/configuration logic remain byte-identical to R10. Stripe and PayPal modes remain environment-driven. Explicit refund deliveries remain signature-checked, acknowledged/deduplicated and ignored with no refund/access/accounting mutation. Verified involuntary reversals/disputes remain payment-failure protections. No real provider operation, credential change, deployment, payment-record or user-subscription mutation occurred.

## Preservation

R10 is preserved separately. No application route, database model, dependency/lock, existing original image/media asset, authentication flow or unrelated design was changed. The sole existing CSS edit restores Carousel geometry; the extra suggestion uses its own CSS module. Runtime `.env` files are private local settings copied after clean ZIP verification; no secret belongs in the ZIP. Normal local setup performs the requested flag opt-in, rather than rewriting scanner secrets/provider configuration.

## File-by-file changes

| File | Why |
| --- | --- |
| `backend/.env.example` | Document the explicit, guarded localhost-only upload flag. |
| `backend/integration/local-uploads-r11.test.js` | Actual multipart image/review/course uploads with isolated Mongo, original-byte hashes, failure/recovery and public/hosted rejection. |
| `backend/src/scripts/setupLocal.js` | Normal setup adds the missing local flag while preserving explicit false, hosted files and credentials. |
| `backend/src/services/pageSectionUploads.js` | Pass actual request context for the shared page-media uploader. |
| `backend/src/services/uploadScan.js` | Allow explicit unscanned localhost development only; keep real hosted scanning and errors. |
| `backend/src/services/uploads.js` | Pass actual request context to the existing scanner for image/course uploads. |
| `backend/src/services/videoReviewUploads.js` | Pass actual request context for original review uploads. |
| `backend/src/utils/localUploadMode.js` | Exact development/loopback configuration and actual-request guard; public/hosted requests cannot use the exception. |
| `backend/src/utils/uploadAvailability.js` | Report configured local uploads ready without requiring the separate manual helper. |
| `backend/src/utils/uploadScanConfig.js` | Expose guarded local mode without requiring unused scanner credentials; retain hosted validation. |
| `backend/test/local-uploads-r11.test.js` | Test local/hosted/request guards, normal setup and preservation of scanner keys/explicit false. |
| `backend/test/v46-setup.test.js` | Keep the existing temporary setup fixture valid with the newly imported pure helper. |
| `docs/SIX-TASK-CHANGES-R11.md` | Requested root causes, file-by-file scope and test/verification explanation. |
| `docs/START-R11-WINDOWS.md` | Complete update, normal local setup, testing and later deployment steps. |
| `docs/WEBHOOK-EVENTS-R11.md` | Sandbox/live environment checklist, exact endpoints/events and honest provider-verification limits. |
| `docs/release-baseline-v60.16.0.json` | Reviewed exact source/config/test/document seal for this authorized update. |
| `frontend/app/checkout/page.tsx` | Insert one eligible full-section suggestion; retain existing course quote, provider, consent and recovery logic. |
| `frontend/components/SectionPurchaseSuggestion.module.css` | Style only the newly requested box with existing checkout theme; no global selector changes. |
| `frontend/components/SectionPurchaseSuggestion.tsx` | Read-only parallel section/offer lookup, count/name/price and fresh-document navigation to existing section checkout (preserves its initial-mode logic); hide active access/failure. |
| `frontend/components/content/PageGallery.tsx` | Restore original R9 responsive image sizing hints. |
| `frontend/components/content/page-sections.css` | Remove only R10 full-width/zero-gap/no-height-cap overrides; restore original card dimensions and spacing. |
| `frontend/components/cms/VideoReviewsEditor.tsx` | Replace the obsolete separate upload-helper instruction with normal setup and explain preserved explicit local choices; hosted errors still require real scanning. |
| `frontend/test/upload-recovery-r6.test.mjs` | Verify the new setup guidance, retained draft and released controls/progress after scanner503. |
| `frontend/components/video-reviews/ReviewVideo.tsx` | Remove the OS decorative-motion veto from requested review playback; explicitly resume after native preview rewind. |
| `frontend/components/video-reviews/VideoReviews.tsx` | Remove public technical preview header and per-card explanatory label only. |
| `frontend/lib/galleryMotion.ts` | Advance exactly one original-sized card plus gap; preserve smooth infinite loop and inspection pauses. |
| `frontend/lib/sectionPurchaseSuggestion.ts` | Validate section identity/publication/ownership/count and actual regional offer without inventing prices. |
| `frontend/test/automatic-media-r6.test.mjs` | Align the pre-existing reduced-motion regression with explicitly requested review autoplay; retain full-player controls assertion. |
| `frontend/test/checkout-retirement.test.mjs` | Update only the existing checkout component test double to import the new isolated suggestion component; preserve existing expectations. |
| `frontend/test/gallery-step-motion-r10.test.mjs` | Test original-sized card step geometry and forward loop. |
| `frontend/test/paypal-recurring-ui.test.mjs` | Update only the existing checkout component test double to import the new isolated suggestion component; preserve existing expectations. |
| `frontend/test/review-player-tiktok.test.mjs` | Update motion-setting expectations to the requested media autoplay while preserving other pause gates. |
| `frontend/test/section-purchase-suggestion-r11.test.mjs` | Test suggestion eligibility, active ownership, price/count validation and matching/fallback terms. |
| `frontend/test/task6-catalog-access.test.mjs` | Update only the existing checkout component test double to import the new isolated suggestion component; preserve existing expectations. |
| `frontend/test/v60-10-reliability.test.mjs` | Update only the existing checkout component test double to import the new isolated suggestion component; preserve existing expectations. |
| `frontend/test/v60-12-workflows.test.mjs` | Update only the existing checkout component test double to import the new isolated suggestion component; preserve existing expectations. |
| `frontend/test/video-review-visible-r9.test.mjs` | Prove native/YouTube autoplay with reduced-motion enabled, retaining visibility/tab/modal pause. |
| `frontend/ui-tests/page-gallery-r5.spec.ts` | Verify original desktop/mobile card width, gap and height cap with working motion. |
| `frontend/ui-tests/section-purchase-suggestion-r11.spec.ts` | Verify course option unchanged, correct full-section navigation, active-access hiding and optional outage. |
| `frontend/ui-tests/video-reviews.spec.ts` | Real Chromium pre-click reduced-motion playback, full playback and removed-label regressions. |
| `scripts/release-baseline.mjs` | Record this explicitly authorized R11 scope only; retain every integrity-enforcement operation. |

## Verification and limits

The release evidence at `qa/v60.16.0-r11/functional-results.json` records final commands, actual totals and limitations. Focused checks cover actual multipart image/review-video/course-video uploads into a generated guarded Mongo/GridFS database; original video SHA equality; local/hosted/public request behavior; actual Stripe raw-body HMAC verification and PayPal signed-postback fixtures; order/capture/failure/access/renewal/replay; native and provider-fixture preview behavior; full playback; desktop/mobile Carousel geometry/motion; new suggestion routing/ownership and no unintended writes. Unit tests, typecheck, production build and the controlled production Chromium suite are part of final acceptance.

Actual original-size Carousel browser comparison:390px viewport card240px/image240x180px/gap20px;1440px viewport card700px/image700x525px/gap20px. These match immutable R9 markup/CSS; auto advance and final-to-first transition were also checked.

Managed executor process isolation can suppress Node test-child execution in its restricted sandbox. Acceptance uses the unchanged project commands with permitted local process/network execution; a file-level wrapper pass alone is not counted as assertion execution. Customer databases and real providers are not used by isolated suites.

Provider fixture playback is not certification that a real YouTube account/video permits autoplay/embedding. Browser autoplay and provider restrictions still apply. Real sandbox create/capture and signed webhook delivery require the owner's keys and matching review deployment; they have not been performed. No live payment readiness or deployment claim is made. See `docs/WEBHOOK-EVENTS-R11.md` for the checklist; `docs/START-R11-WINDOWS.md` for the complete owner process.
