# R10: six functional tasks and measured performance fixes

Both requested scopes are implemented together. Existing page layouts, ordinary styling, route names, database model schemas, environment values, dependency manifests/locks and historical customer/payment/subscription records are preserved. Only the requested feedback, Carousel motion, expiry indicator and access presentation change visibly.

## Resulting behavior

1. **Review previews:** shared review/CMS cards automatically request muted inline playback while visible and loop the first 15–20 seconds. Legacy shorter preview settings normalize for display; newly added reviews need no separate autoplay setting. Ready player frames remain stable when previews pause. A provider that never announces API readiness is created only when playable/visible, starts through its muted autoplay URL, and is detached while paused so it cannot keep playing offscreen. Explicit “Watch full video” opens the complete original with audio/controls. Uploaded originals remain byte-identical. YouTube/Vimeo/TikTok playback uses provider messages; Instagram remains provider-controlled because its official embed does not offer mute/seek/pause APIs.
2. **Feedback:** one shared themed notice/dialog family provides success, error, warning, info and confirmation variants, icons, titles, keyboard containment, safe focus restoration, and smooth opening/closing. Decisions and API actions settle immediately; the same closing DOM becomes inert and aria-hidden while its visual exit completes. Account/route changes, reduced motion and unsupported native transitions close immediately. Caller form/upload context and the original ordinary business form chrome are retained; the new theme applies to the requested feedback cards. All former application native confirmations are replaced. Native `beforeunload` protection remains where the browser cannot await a custom modal.
3. **Images:** the existing multi-image Carousel displays one full slide at a time, rests between timed transitions, loops forward seamlessly and pauses for pointer/keyboard/touch inspection. Mobile sizing and admin/public behavior match. Other gallery modes and Team card rows retain their existing behavior.
4. **Expiry circle:** My Billing shows the recreated teal calendar/count ring, UTC expiry date, information control and existing eligible Renew destination. Dates come from confirmed, owner/product/environment-matched invoice grants, including the source invoice for deferred setup. A provider's next charge/trial date never becomes paid expiry evidence. Lifetime, unknown, pending, cancelled and expired grants remain distinct. Exact original screenshot code was not present in Git or the eleven earlier archives checked; this is a recreation, not recovered original source.
5. **Webhook refunds:** explicit Stripe/PayPal refund deliveries are verified and acknowledged/deduplicated without refund-provider lookups, credits or access changes. Historical accounting code/records remain. Verified involuntary reversals and disputes remain payment-failure protections. The final required event lists are **10 Stripe / 17 PayPal**, in [WEBHOOK-EVENTS-R10.md](WEBHOOK-EVENTS-R10.md). No remote destination or subscription was changed by this delivery.
6. **Owned access:** an active direct-course, section or legacy-membership grant hides the relevant sale price/Buy action and opens actual content. A section covers its currently published children, including later additions; one child purchase does not cover the parent or siblings. Exact expiry restores offers. Fresh duplicate checkouts are rejected on the backend before order/coupon/payment writes. Existing checkout replay/recovery, financial environment fences and explicitly consented zero-now deferred renewal setup remain available.

## Performance findings

Five supplied large photos lacked responsive variants; public summaries arrived after hydration; offscreen posters were eager; preview ranges could switch byte representations; and team queries retrieved unused editor fields. Those measured issues are addressed without adding infrastructure or changing schemas.

An additional repeated-browser failure was traced to a late first client mount: the general hydration flag was already true even though the public document snapshot existed. The old consumer skipped its seed, then a failed refresh left no cards. The provider now retains the document seed for late first consumers and permanently retires it after navigation, account scope change or CMS update. It adds no DOM wrapper/shared private cache, and the existing resource/cache/auth logic is unchanged.

Measurements, exact limits and server requirements are in [PERFORMANCE-R10.md](PERFORMANCE-R10.md). No new Redis service, environment-variable name or CDN architecture is introduced. The existing public cache/invalidation, DB indexes/pooling, lean/parallel reads, compression, image fallback/prewarming and optional FFmpeg pipeline remain in use. Literal zero network delay, universal millisecond playback and atomically loaded images are not guaranteed. Real YouTube/CDN and deployed-host latency were not measured.

## Verification

The final matched source passed:

| Check | Result |
| --- | ---: |
| Frontend unit/regression checks | 1,047/1,047 |
| Backend + runtime + signed-webhook contracts | 1,611/1,611 |
| Guarded isolated MongoDB/media integration | 78/78 |
| Actual production UI browser suite | 171/171 |
| Actual Express/MongoDB admin moderation + original upload browser checks | 2/2 |
| Repeated SSR snapshot retention during simulated failed refresh | 20/20 |
| Production UI + normal standalone builds | Passed |

The actual admin browser test checks the original ordinary form's width, fonts, colors, sticky header and spacing at desktop/mobile, then cancels without an extra write. Media checks verify original bytes, H.264/yuv420p faststart, JPEG posters, exact HTTP 206/HEAD/416, stable byte ranges and publication revocation. Queue/dialog tests and actual browsers verify focus, same-node inert exits, single immediate writes and stale account/route cancellation.

Exact evidence is in `qa/v60.16.0-r10/functional-results.json`. Automated provider tests use synthetic responses; actual signed provider delivery/live payments remain separate deployed checks. No real provider request, deployment, customer-record migration or private setting rewrite was performed.

For local commands and the single-file updater, see [START-R10-WINDOWS.md](START-R10-WINDOWS.md). R10 does not deploy automatically or rewrite existing private settings.

## Exact changed files

Task numbers below correspond to the six results above; P denotes the measured performance correction. The final reviewed file-by-file table follows below. The separate performance-phase file list remains in PERFORMANCE-R10.md; original file hashes and protected-asset verification are included with the QA evidence.

| File | Change | Task | Purpose |
| --- | --- | --- | --- |
| `backend/integration/active-catalog-access.test.js` | Add | 6 | Exercise real canonical grants, scoped catalog coverage, expiry and duplicate-purchase boundaries. |
| `backend/integration/deferred-renewal-setup.test.js` | Modify | 6 | Replace the superseded early ordinary-extension expectation; retain no-charge deferred-renewal coverage. |
| `backend/integration/paid-access-display-r10.test.js` | Add | 4 | Verify date/owner/product/environment/source boundaries and unchanged stored records during reads. |
| `backend/integration/paypal-recurring-payments.test.js` | Modify | 5 | Verify signed ignored refund events, retained reversal protections and the revised event contract. |
| `backend/src/routes/paymentRoutes.js` | Modify | 4, 6 | Add read-only paid-access billing DTOs and private active catalog coverage; use canonical course/section access. |
| `backend/src/services/billingAccessDisplay.js` | Add | 4 | Batch owner-scoped invoice evidence for agreement circles; no provider calls or writes. |
| `backend/src/services/catalogEntitlements.js` | Add | 6 | Read owner-scoped direct, section and membership access through existing grant readers. |
| `backend/src/services/gatewayWebhooks.js` | Modify | 5 | Disable explicit refund webhook processing/required subscriptions while retaining verified reversal and dispute protections. |
| `backend/src/services/onlineCheckout.js` | Modify | 6 | Reject fresh ordinary purchases during active coverage; preserve original checkout replay and consented deferred setup. |
| `backend/src/services/pendingBillingCheckout.js` | Modify | 4 | Attach paid-access snapshots to normal owned agreement reads without changing pending actions. |
| `backend/src/services/renewalSetup.js` | Modify | 4 | Attach the selected invoice-backed snapshot; retain all existing setup eligibility and timing rules. |
| `backend/src/utils/paidAccessDisplay.js` | Add | 4 | Derive truthful paid-grant display dates, UTC counters, lifetime and cancellation states. |
| `backend/src/utils/paymentWebhookPolicy.js` | Modify | 5 | Disable explicit refund webhook processing/required subscriptions while retaining verified reversal and dispute protections. |
| `backend/test/catalogAccessHarness.js` | Add | 6 | Exercise real canonical grants, scoped catalog coverage, expiry and duplicate-purchase boundaries. |
| `backend/test/no-refund-webhooks-r10.test.js` | Add | 5 | Verify signed ignored refund events, retained reversal protections and the revised event contract. |
| `backend/test/paid-access-display-r10.test.js` | Add | 4 | Verify date/owner/product/environment/source boundaries and unchanged stored records during reads. |
| `backend/test/payments-live-readiness.test.js` | Modify | 5 | Verify signed ignored refund events, retained reversal protections and the revised event contract. |
| `backend/test/payments-live-safety.test.js` | Modify | 5 | Verify signed ignored refund events, retained reversal protections and the revised event contract. |
| `backend/test/v47-workflows.test.js` | Modify | 6 | Use the actual canonical access harness for purchase eligibility assertions. |
| `backend/test/v60-5-regressions.test.js` | Modify | 6 | Replace stale membership-only source expectations with verified owned course/section/membership coverage assertions. |
| `docs/ALERT-FEEDBACK-R10.md` | Add | 2 | Document shared feedback, queued decisions, scope fences, accessibility and retained beforeunload protection. |
| `docs/PAYMENTS-LIVE-CHECKLIST-R9.md` | Modify | 5 | Document current destinations/event selections and deployment validation limits; no real provider settings changed. |
| `docs/PERFORMANCE-R10.md` | Modify | P | Clarify both scopes and the narrow late-first-mount SSR correction; keep earlier measurements separate from current acceptance. |
| `docs/SIX-TASK-CHANGES-R10.md` | Add | Release summary | Summarize authorized feature behavior, file scope and final acceptance status; documentation only with no application effect. |
| `docs/START-R10-WINDOWS.md` | Add | Delivery | Document the separate complete R10 folder/ZIP updater, retained local settings, existing-database startup and deployment limits. |
| `docs/WEBHOOK-EVENTS-R10.md` | Add | 5 | Document current destinations/event selections and deployment validation limits; no real provider settings changed. |
| `frontend/app/about/page.tsx` | Modify | 2, 6 | Use shared feedback and suppress purchase offers only for verified owner-specific coverage on existing cards. |
| `frontend/app/academy/page.tsx` | Modify | 2, 6 | Use shared feedback and suppress purchase offers only for verified owner-specific coverage on existing cards. |
| `frontend/app/billing/page.tsx` | Modify | 2, 4 | Use shared action feedback and add circles to legacy terms and confirmed paid invoice cards. |
| `frontend/app/certificates/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/certificates/verify/[token]/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/checkout/page.tsx` | Modify | 2, 6 | Replace a fresh duplicate purchase with actual content entry; retain consented setup, replay/recovery and shared feedback. |
| `frontend/app/checkout/return/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/contact/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/courses/[slug]/page.tsx` | Modify | 2, 6 | Use verified Continue/Open actions for direct/parent-section/membership coverage; retain unrelated offers and feedback. |
| `frontend/app/events/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/forgot-password/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/home/page.tsx` | Modify | 2, 6 | Use shared feedback and suppress purchase offers only for verified owner-specific coverage on existing cards. |
| `frontend/app/layout.tsx` | Modify | 2 | Mount the shared scoped feedback host while retaining the earlier public SSR prefetch/hydration work. |
| `frontend/app/learn/[course]/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/login/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/register/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/reset-password/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/reviews/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/app/sections/[slug]/page.tsx` | Modify | 2, 6 | Use verified Continue/Open actions for direct/parent-section/membership coverage; retain unrelated offers and feedback. |
| `frontend/app/verify-otp/page.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/components/ApiLoadError.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/components/PublicInitialData.tsx` | Modify | P | Keep the frozen document SSR seed for late first mounts; permanently retire it after navigation, account/public-scope or CMS changes. |
| `frontend/components/SiteHeader.tsx` | Modify | 2 | Await the leave guard before Back/logout/navigation; preserve existing destinations and action owners. |
| `frontend/components/admin/AdminLogin.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/components/auth/AuthProvider.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/components/billing/AutoRenewals.tsx` | Modify | 2, 4 | Add modern agreement/purchase circles and shared feedback; preserve paid snapshots across renewal toggles. |
| `frontend/components/billing/BillingActionConfirmation.tsx` | Modify | 2 | Delegate presentation to the shared dialog; retain billing-specific consent and two-step cancellation. |
| `frontend/components/billing/BillingCancellationDialog.tsx` | Modify | 2 | Delegate presentation to the shared dialog; retain billing-specific consent and two-step cancellation. |
| `frontend/components/billing/CancelPurchaseAccess.tsx` | Modify | 2 | Use shared notices/decisions without changing financial action payloads or owner/in-flight checks. |
| `frontend/components/billing/PaidAccessIndicator.tsx` | Add | 4 | Render the recreated teal calendar/count ring, UTC expiry, information control and existing eligible Renew target. |
| `frontend/components/billing/PaymentReceiptCard.tsx` | Modify | 2 | Use shared notices/decisions without changing financial action payloads or owner/in-flight checks. |
| `frontend/components/billing/SubscriptionNotifications.tsx` | Modify | 2 | Use shared notices/decisions without changing financial action payloads or owner/in-flight checks. |
| `frontend/components/billing/paid-access-indicator.css` | Add | 4 | Scope styling to the circle region, including compact legacy placement and reduced motion. |
| `frontend/components/business/ActionDialog.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/business/AdminExportButton.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/business/AdminReviews.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/business/AdminSaveFeedback.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/business/AdminStudents.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/business/BusinessPortal.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/business/Certificates.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/business/Requests.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/business/SecurityPanel.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/business/StudentExportButton.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/business/ui.tsx` | Modify | 2 | Reuse shared notices/modal decisions; retain existing action owners, passwords, save acknowledgements and payloads. |
| `frontend/components/catalog/CatalogCard.tsx` | Modify | 6 | Hide prices for scoped active coverage and link Continue/Open to existing content. |
| `frontend/components/cms/AdminConfirm.tsx` | Modify | 2 | Delegate save confirmation to the shared modal; retain single-submission/busy guards. |
| `frontend/components/cms/ContentCollection.tsx` | Modify | 2 | Await themed dirty-close/delete decisions and reject stale drafts, busy uploads or unmounted editors. |
| `frontend/components/cms/CouponManager.tsx` | Modify | 2 | Migrate existing editor action feedback to the shared themed family without changing saved media/content identities. |
| `frontend/components/cms/CourseEditor.tsx` | Modify | 2 | Await themed dirty-close/delete decisions and reject stale drafts, busy uploads or unmounted editors. |
| `frontend/components/cms/CropMediaField.tsx` | Modify | 2 | Migrate existing editor action feedback to the shared themed family without changing saved media/content identities. |
| `frontend/components/cms/Fields.tsx` | Modify | 2 | Use shared upload errors and asynchronous dirty-close confirmation with fresh-draft/upload checks. |
| `frontend/components/cms/ImageCropEditor.tsx` | Modify | 2 | Migrate existing editor action feedback to the shared themed family without changing saved media/content identities. |
| `frontend/components/cms/LessonEditor.tsx` | Modify | 2 | Await themed dirty-close/delete decisions and reject stale drafts, busy uploads or unmounted editors. |
| `frontend/components/cms/PageSectionsEditor.tsx` | Modify | 2 | Await themed dirty-close/delete decisions and reject stale drafts, busy uploads or unmounted editors. |
| `frontend/components/cms/RegionalPricingEditor.tsx` | Modify | 2 | Migrate existing editor action feedback to the shared themed family without changing saved media/content identities. |
| `frontend/components/cms/SectionManager.tsx` | Modify | 2 | Await themed dirty-close/delete decisions and reject stale drafts, busy uploads or unmounted editors. |
| `frontend/components/cms/SiteEditor.tsx` | Modify | 2 | Migrate existing editor action feedback to the shared themed family without changing saved media/content identities. |
| `frontend/components/cms/VideoReviewsEditor.tsx` | Modify | 2 | Migrate existing editor action feedback to the shared themed family without changing saved media/content identities. |
| `frontend/components/cms/WebsiteContentEditor.tsx` | Modify | 2 | Migrate existing editor action feedback to the shared themed family without changing saved media/content identities. |
| `frontend/components/content/PageGallery.tsx` | Modify | 3 | Keep all gallery modes; size carousel slides to one viewport and retain responsive image identities. |
| `frontend/components/content/PageSectionVideo.tsx` | Modify | 1 | Use the common bounded preview/autoplay policy for CMS page video and preserve full-video opening. |
| `frontend/components/content/page-sections.css` | Modify | 3 | Scope full-width slides/no strip to carousel mode; retain other gallery and page layout rules. |
| `frontend/components/feedback/AccountFeedback.tsx` | Add | 2 | Bind queued decisions to the current portal, account epoch and route. |
| `frontend/components/feedback/FeedbackDialog.tsx` | Add | 2 | Release modality/focus/scroll immediately; retain only the same inert hidden presentation for a supported 180ms exit. |
| `frontend/components/feedback/FeedbackNotice.tsx` | Add | 2 | Provide consistent success/error/warning/info notices with icons and accessible announcements. |
| `frontend/components/feedback/FeedbackPresence.tsx` | Add | 2 | Retain the caller-owned fiber/context only during exit; hide/inert outgoing forms and drop them on scope change. |
| `frontend/components/feedback/FeedbackProvider.tsx` | Add | 2 | Host scoped decisions and same-context exit presence; account/route changes synchronously discard outgoing content. |
| `frontend/components/feedback/feedback.css` | Add | 2 | Scope the notice/modal theme and 180ms discrete exit; reduced motion or unsupported transitions close immediately. |
| `frontend/components/layout/BackButton.tsx` | Modify | 2 | Await the leave guard before Back/logout/navigation; preserve existing destinations and action owners. |
| `frontend/components/learning/AnswerSheet.tsx` | Modify | 2 | Present existing validation/action results through shared notices; retain loading, auth and business behavior. |
| `frontend/components/video-reviews/ReviewVideo.tsx` | Modify | 1, 2 | Autoplay muted bounded previews and controlled full playback; preserve viewport/policy handling and use shared warnings. |
| `frontend/components/video-reviews/VideoReviews.tsx` | Modify | 1, 2 | Reuse the common preview player and themed retry notices without changing saved review media. |
| `frontend/e2e/reliability.spec.ts` | Modify | 6 | Add complete empty access arrays to successful-response fixtures; preserve original browser assertions. |
| `frontend/e2e/review-moderation.spec.ts` | Modify | 2 | Adapt shared feedback/queued-decision fixtures while retaining action, consent, acknowledgement and error assertions. |
| `frontend/e2e/video-upload-local-r6.spec.ts` | Modify | 2 | Adapt shared feedback/queued-decision fixtures while retaining action, consent, acknowledgement and error assertions. |
| `frontend/lib/courseAccessPresentation.ts` | Modify | 6 | Map proven direct/section/membership coverage to the existing content actions. |
| `frontend/lib/feedback.ts` | Add | 2 | Queue confirm/prompt/alert decisions; fail closed on duplicate, abort, missing host and scope changes. |
| `frontend/lib/feedbackPresence.ts` | Add | 2 | Reconcile keyed same-scope presentation, 180ms exit support and authoritative account/route presentation scope. |
| `frontend/lib/galleryMotion.ts` | Modify | 3 | Hold one image about three seconds, step forward smoothly, loop seamlessly and pause for inspection/reduced motion. |
| `frontend/lib/leaveGuard.ts` | Modify | 2 | Await themed lesson leave decisions; keep browser-native unload protection. |
| `frontend/lib/paidAccessClock.ts` | Add | 4 | Advance already-confirmed snapshots with the existing UTC calendar policy; never consume provider dates. |
| `frontend/lib/useCatalogAccess.ts` | Add | 6 | Read lightweight private coverage with account/country/epoch fences, server-clock expiry and safe refresh. |
| `frontend/lib/videoReviews.ts` | Modify | 1 | Normalize previews to 15–20 seconds and explicitly request Vimeo inline playback; preserve source/full-video identities. |
| `frontend/test/admin-exports.test.mjs` | Modify | 2 | Update explicit shared-feedback test adapters; retain export, regional price, auth and admin catalog assertions. |
| `frontend/test/admin-save-feedback-r6.test.mjs` | Modify | 2 | Adapt shared feedback/queued-decision fixtures while retaining action, consent, acknowledgement and error assertions. |
| `frontend/test/answer-navigation.test.mjs` | Modify | 2 | Adapt shared feedback/queued-decision fixtures while retaining action, consent, acknowledgement and error assertions. |
| `frontend/test/automatic-media-r6.test.mjs` | Modify | 1, 3 | Update actual player/gallery expectations for bounded autoplay and timed single-image motion. |
| `frontend/test/billing-action-confirmation.test.mjs` | Modify | 2 | Adapt shared feedback/queued-decision fixtures while retaining action, consent, acknowledgement and error assertions. |
| `frontend/test/billing-cancellation-dialog.test.mjs` | Modify | 2 | Adapt shared feedback/queued-decision fixtures while retaining action, consent, acknowledgement and error assertions. |
| `frontend/test/checkout-retirement.test.mjs` | Modify | 2, 6 | Supply the new access/feedback adapters and retain existing retirement, owner, recovery and payment assertions. |
| `frontend/test/compile.mjs` | Modify | 2 | Add explicit shared-provider doubles/materialization while retaining SSR and authentication boundary assertions. |
| `frontend/test/events-student-export.test.mjs` | Modify | 2 | Adapt shared feedback/queued-decision fixtures while retaining action, consent, acknowledgement and error assertions. |
| `frontend/test/feedback-presence-r10.test.mjs` | Add | 2 | Verify same presentation identity/context/form names, queued successors, reopen and synchronous privacy invalidation. |
| `frontend/test/gallery-step-motion-r10.test.mjs` | Add | 3 | Verify timed single-image steps, pause/resume, wrapping, resizing and reduced-motion boundaries. |
| `frontend/test/page-section-catalog.test.mjs` | Modify | 2, 6 | Supply the new access/feedback adapters and retain existing retirement, owner, recovery and payment assertions. |
| `frontend/test/paid-access-indicator-r10.test.mjs` | Add | 4 | Test UTC/API parity, honest states, calendar/date/Renew rendering and narrow desktop/mobile placement. |
| `frontend/test/paypal-recurring-ui.test.mjs` | Modify | 2, 6 | Supply the new access/feedback adapters and retain existing retirement, owner, recovery and payment assertions. |
| `frontend/test/public-summary-ssr-r10.test.mjs` | Modify | 2, P | Prove late hydrated first mounts retain known/empty SSR data on failure and never replay it across route/account/CMS boundaries. |
| `frontend/test/renewal-controls.test.mjs` | Modify | 2, 4 | Supply circle/shared-feedback adapters while retaining provider action and owned renewal assertions. |
| `frontend/test/review-moderation.test.mjs` | Modify | 2 | Adapt shared feedback/queued-decision fixtures while retaining action, consent, acknowledgement and error assertions. |
| `frontend/test/review-player-tiktok.test.mjs` | Modify | 1 | Verify visible autoplay startup, ready-frame stability, unready-frame detachment, stale readiness rejection and reduced-motion behavior across all three providers. |
| `frontend/test/section-catalog.test.mjs` | Modify | 2, 6 | Supply the new access/feedback adapters and retain existing retirement, owner, recovery and payment assertions. |
| `frontend/test/simple-regional-pricing.test.mjs` | Modify | 2 | Update explicit shared-feedback test adapters; retain export, regional price, auth and admin catalog assertions. |
| `frontend/test/task6-catalog-access.test.mjs` | Add | 6 | Exercise real coverage hooks/cards/detail/checkout callbacks, exact expiry and stale-owner responses. |
| `frontend/test/themed-cms-guards-r10.test.mjs` | Add | 2 | Test actual queue/modal accessibility and fail-closed stale-scope/draft/busy/abort/duplicate decisions. |
| `frontend/test/themed-feedback-r10.test.mjs` | Add | 2 | Test scoped decisions, safe initial focus, same-node inert exits, immediate cleanup and account/route privacy fences. |
| `frontend/test/upload-recovery-r6.test.mjs` | Modify | 2 | Adapt shared feedback/queued-decision fixtures while retaining action, consent, acknowledgement and error assertions. |
| `frontend/test/v60-10-reliability.test.mjs` | Modify | 2, 6 | Supply the new access/feedback adapters and retain existing retirement, owner, recovery and payment assertions. |
| `frontend/test/v60-11-1-auth-controls.test.mjs` | Modify | 2 | Update explicit shared-feedback test adapters; retain export, regional price, auth and admin catalog assertions. |
| `frontend/test/v60-11-auth-hydration.test.mjs` | Modify | 2 | Add explicit shared-provider doubles/materialization while retaining SSR and authentication boundary assertions. |
| `frontend/test/v60-12-fixture-api.test.mjs` | Modify | 6 | Add HTTP fixture contracts for direct/section/membership/free coverage and unchanged financial reads. |
| `frontend/test/v60-12-workflows.test.mjs` | Modify | 2, 6 | Supply the new access/feedback adapters and retain existing retirement, owner, recovery and payment assertions. |
| `frontend/test/v60-14-team.test.mjs` | Modify | 2 | Adapt shared notice/provider fixture materialization while retaining team/admin behavior assertions. |
| `frontend/test/v60-16-admin-catalog.test.mjs` | Modify | 2 | Update explicit shared-feedback test adapters; retain export, regional price, auth and admin catalog assertions. |
| `frontend/test/video-review-visible-r9.test.mjs` | Modify | 1, 2 | Exercise updated preview/full playback and shared feedback while retaining provider/visibility assertions. |
| `frontend/test/video-reviews.test.mjs` | Modify | 1, 2 | Verify 15–20-second previews, explicit Vimeo playsinline, full-player controls and shared warning adapters. |
| `frontend/ui-tests/cancel-access.spec.ts` | Modify | 2 | Verify themed two-step cancellation, explicit safe initial focus and retained financial/confirmation assertions. |
| `frontend/ui-tests/logout-free-tablet.spec.ts` | Modify | 6 | Add complete empty access arrays to successful-response fixtures; preserve original browser assertions. |
| `frontend/ui-tests/page-gallery-r5.spec.ts` | Modify | 3 | Verify timed gallery behavior and exact responsive photograph decoding while retaining selection/navigation checks. |
| `frontend/ui-tests/page-section-catalog.spec.ts` | Modify | 6 | Add complete empty access arrays to successful-response fixtures; preserve original browser assertions. |
| `frontend/ui-tests/paid-access-indicator-r10.spec.ts` | Add | 4 | Test UTC/API parity, honest states, calendar/date/Renew rendering and narrow desktop/mobile placement. |
| `frontend/ui-tests/payment-errors-r9.spec.ts` | Modify | 2 | Target the shared checkout error notice while retaining support-reference, original-key and single-purchase recovery assertions. |
| `frontend/ui-tests/sections-answer-navigation.spec.ts` | Modify | 2, 6 | Use complete access fixtures and themed leave-dialog keyboard/Cancel/Escape assertions. |
| `frontend/ui-tests/task6-catalog-access-r10.spec.ts` | Add | 6 | Four browser cases cover section children, direct learning/duplicate checkout, expiry restoration and foreign-account isolation. |
| `frontend/ui-tests/themed-feedback-exit-r10.spec.ts` | Add | 2 | Observe real same-node close transitions, immediate single dispatch/focus/scroll release, reduced motion and owner/route changes. |
| `frontend/ui-tests/video-reviews.spec.ts` | Modify | 1, 2 | Exercise updated preview/full playback and shared feedback while retaining provider/visibility assertions. |
| `scripts/release-baseline.mjs` | Modify | 1–6 metadata | Prepend the explicitly authorized R10 scope description only; retain all inventory/hash/original-asset guard code. |
| `scripts/ui-fixture-api.mjs` | Modify | 4, 6 | Extend synthetic owner-scoped access/billing DTOs; keep fixture settlement and financial history assertions. |

All 279 original R9 public/certificate asset files are retained byte-for-byte, including the 268 protected historical assets, five supplied global-learning originals and both HD hero originals. All 74 older image-manifest entries remain unchanged. The 25 additional WebP copies are additive. Source guards found no unrelated schema, environment-example, dependency-lock or deployment-file changes. `scripts/release-baseline.mjs` adds only the current authorization description; its integrity enforcement is unchanged.
