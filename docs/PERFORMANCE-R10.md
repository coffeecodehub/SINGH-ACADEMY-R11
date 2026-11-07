# Performance follow-up: measured changes and limits

**Scope: both the six functional tasks and measured performance improvements are authorized.** The six functional changes and their verification are documented in [SIX-TASK-CHANGES-R10.md](SIX-TASK-CHANGES-R10.md). This report describes the performance work and its practical limits; literal zero loading and universal millisecond video starts are not guaranteed. No deployment or real provider payment operation was performed.

## Findings and fixes

- Five existing supplied photographs had no responsive manifest entries, so original 1.65–2.09MB JPEGs were downloaded. Added 25 WebP display copies; original files and photo placement/alt/crop identities remain intact.
- Public CMS settings and landing/review/page-section data arrived only after hydration. Fixed-path anonymous SSR prefetch supplies request-local initial data; the existing account cache, invalidation and background refresh remain active. Requests run in parallel and fall back after 800ms.
- Every offscreen review poster could make a request. Posters now use the existing near-viewport gate, with just the first review-page poster available before JavaScript.
- A preview URL could switch from original to transcoded bytes between Range requests. Each updated player now pins one representation; no redirect or extra startup request is added. Original downloads and publication/private-media checks are preserved.
- Team queries retrieved crop-editor metadata immediately discarded by the public mapper and repeatedly sorted warm results. Excluding those fields and sorting inside the existing cache reduces Mongo/cache payload without changing the public DTO.
- A late first client mount could skip an available SSR public snapshot because the general hydration flag was already true. Passive React commit evidence reproduced this with an unchanged scope and no hydration error; the following 503 left the page empty. Document-scoped eligibility now retains that first snapshot and retires it on navigation, account change or CMS save. The before diagnostic failed on run 11; all 20 repeated runs after the correction retained the cards during the intended failed refresh.

## Controlled measurements

API measurements use real Express/Mongoose and generated, guarded disposable local test databases: 20 cache-cleared and 60 warm responses per endpoint, two synthetic catalog sizes, 1,120 measured responses before and 1,120 after. Database/OS caches remain warm. These are loopback measurements of the performance-phase public handlers, which remain unchanged in the final integrated build; private coverage/billing latency is not measured here. They are not deployed latency.

| Expanded team fixture | Before | After |
| --- | ---: | ---: |
| Cache-cleared p50 / p95 | 9.81 / 14.31ms | 7.57 / 8.45ms |
| Warm p50 / p95 | 5.59 / 8.32ms | 5.18 / 7.81ms |
| Mongo/cache JSON | 119,191 bytes | 50,251 bytes |
| Public HTTP JSON | 50,275 bytes | 50,275 bytes |

The deterministic team improvement is **57.8% less Mongo/cache payload** and no repeated warm sort. Unchanged endpoints also vary between runs; do not attribute all timing differences to the patch. Existing warm APIs were already below 50 ms locally. Existing indexes/pooling/lean/parallel reads and compression were retained; no speculative schema, pagination, rate-limit or review-consistency changes were added.

Browser comparison uses unchanged R9 built in a separate verified source folder and the final production Next UI, both against the same synthetic API. The After column below is a fresh measurement of the final integrated R10 build. Each mode has three cold-cache samples; values below are medians. Mobile is 390×844, 150ms latency, 1.6Mbps down, 0.75Mbps up and 4× CPU slowdown. Browser cache is cleared again before the review-page navigation. The synthetic CMS hero override is Brazil-1; the real default Landing/Home photographs are unchanged.

### desktop

| Metric | Before | After |
| --- | ---: | ---: |
| Landing TTFB (ms) | 34.4 | 51.9 |
| Landing FCP (ms) | 232.0 | 144.0 |
| Landing LCP (ms) | 300.0 | 364.0 |
| Section cards present in layout (ms) | 401.2 | 431.8 |
| Selected hero download complete (ms) | 353.2 | 101.6 |
| Document load event (ms) | 282.8 | 218.8 |
| First review poster loaded (ms) | 218.9 | 59.7 |
| First native review playing (ms) | 293.5 | 277.8 |
| Review poster requests | 24.0 | 7.0 |
| Landing CLS | 0.0000 | 0.0000 |
| Review-page CLS | 0.3115 | 0.0005 |

### mobile-fast3g

| Metric | Before | After |
| --- | ---: | ---: |
| Landing TTFB (ms) | 32.2 | 43.4 |
| Landing FCP (ms) | 680.0 | 564.0 |
| Landing LCP (ms) | 1804.0 | 1108.0 |
| Section cards present in layout (ms) | 2805.6 | 1061.1 |
| Selected hero download complete (ms) | 12749.0 | 640.7 |
| Document load event (ms) | 12755.1 | 3552.5 |
| First review poster loaded (ms) | 2463.5 | 574.5 |
| First native review playing (ms) | 3283.1 | 2573.0 |
| Review poster requests | 24.0 | 3.0 |
| Landing CLS | 0.0000 | 0.0000 |
| Review-page CLS | 0.3402 | 0.0025 |

LCP does not necessarily represent a later CMS image replacement; hero download completion is reported separately. A document load event is not proof that every lazy/dynamic image is finished. Native browser playback uses the same small local 22-second fixture in both versions; real FFmpeg/MP4 streaming is verified separately. No real YouTube/CDN speed claim is made.

**Remaining limits:** desktop LCP rose from 300 to 364ms in these three-sample medians; not every metric improves. The earlier performance-stage loader capture showed the existing “Opening your page…” route shell for about 0.31s after first paint; its appearance/duration was not redesigned and that single capture is not a fresh final timing. Cold private pages were not converted to SSR. Universal millisecond video starts, literal zero CLS and all-section atomic image appearance are not guaranteed. Managed network policy excludes the live API domain, so deployed latency, real provider playback and CDN behavior remain unmeasured.

## Actual image sizes

| Original | Original bytes | 480px WebP bytes |
| --- | ---: | ---: |
| /images/global-learning/brazil-1.jpg | 1,732,282 | 18,964 |
| /images/global-learning/brazil-2.jpg | 1,654,385 | 19,200 |
| /images/global-learning/brazil-3.jpg | 2,089,492 | 19,078 |
| /images/global-learning/ukraine-delegation-1.jpg | 1,714,312 | 24,316 |
| /images/global-learning/ukraine-delegation-2.jpg | 1,962,267 | 27,760 |

All five: **9,152,738→109,318 bytes (98.81% less)** at 480 px. Browser width/DPR determines the actual selected copy. Verified 268 protected original assets, 5 earlier original uploads, both unchanged HD hero files and all 74 old manifest entries. No existing source file was deleted.

## Performance-phase file-by-file changes

These are the separately reviewed performance-phase changes against R9. The subsequent explicitly authorized functional changes to galleries, feedback, billing, checkout and access are listed in SIX-TASK-CHANGES-R10.md. Database model schemas, environment values, dependency locks and unrelated design/routes remain unchanged. The only middleware change is the internal overwritten pathname header.

| File | Why |
| --- | --- |
| backend/integration/video-playback-r9.test.js | Extend actual FFmpeg/GridFS/HTTP tests for stable ranges, batched metadata and publication revocation. |
| backend/src/routes/contentRoutes.js | Exclude already-discarded team editor fields in Mongo; sort once inside the existing cache. Public response and category/order behavior remain identical. |
| backend/src/routes/mediaRoutes.js | Keep original/derived preview ranges on one pinned byte representation, after current original-media authorization. |
| backend/src/routes/videoReviewRoutes.js | Select ready preview IDs in one bounded metadata lookup; keep existing list TTL and admin writes. |
| backend/src/services/videoReviewPlayback.js | Add a batched preview-ID projection; retain optional FFmpeg processing and immutable full originals. |
| backend/src/utils/videoReviews.js | Include an optional preview rendition ID in the existing review DTO. |
| backend/test/team-content-payload.test.js | Verify exact cold/warm DTO equivalence, ordering, media URLs, cache invalidation and unchanged stored fields. |
| frontend/app/layout.tsx | Prefetch site settings and the fixed public-page bundle in parallel before rendering; no new layout element. |
| frontend/components/PublicInitialData.tsx | Hold the request-local public document snapshot for late first mounts; retire it permanently on navigation, account boundaries or CMS changes. |
| frontend/components/WebsiteContent.tsx | Render saved public copy/images from a deterministic SSR snapshot while retaining live refresh and owner fences. |
| frontend/components/video-reviews/ReviewVideo.tsx | Defer offscreen posters, prioritize the first review-page poster, pin native sources and clear stale source errors. |
| frontend/components/video-reviews/VideoReviews.tsx | Pass existing media rendition metadata and first-poster priority to the unchanged card/player layout. |
| frontend/lib/image-manifest.json | Add exactly five responsive-photo entries; retain all 74 prior entries. |
| frontend/lib/server/publicWebsiteContent.ts | Fixed anonymous public reads through the existing proxy, with an 800ms deadline, no account credentials and safe fallback. |
| frontend/lib/usePublicResource.ts | Capture the public hydration seed while preserving the original two-argument API, account cache, invalidation and refresh behavior. |
| frontend/lib/videoReviews.ts | Build a stable native-preview URL from an original or prepared rendition ID; preserve provider/full-player behavior. |
| frontend/middleware.ts | Add only an overwritten internal pathname header used to select the public prefetch bundle; auth/CSP/redirect logic unchanged. |
| frontend/public/optimized/3dfec2db35cfffcd-1280.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/3dfec2db35cfffcd-1920.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/3dfec2db35cfffcd-240.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/3dfec2db35cfffcd-480.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/3dfec2db35cfffcd-800.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/75c89fdb67e8610c-1280.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/75c89fdb67e8610c-1920.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/75c89fdb67e8610c-240.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/75c89fdb67e8610c-480.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/75c89fdb67e8610c-800.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/7b21fe6340064384-1280.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/7b21fe6340064384-1920.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/7b21fe6340064384-240.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/7b21fe6340064384-480.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/7b21fe6340064384-800.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/9c34a34e240a7dc2-1280.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/9c34a34e240a7dc2-1920.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/9c34a34e240a7dc2-240.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/9c34a34e240a7dc2-480.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/9c34a34e240a7dc2-800.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/b961632700d6bd9a-1280.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/b961632700d6bd9a-1920.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/b961632700d6bd9a-240.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/b961632700d6bd9a-480.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/public/optimized/b961632700d6bd9a-800.webp | New content-derived responsive copy of one fixed-allowlist photograph; no existing image replaced. |
| frontend/test/compile.mjs | Add a narrow no-provider test double for the new hydration-context dependency; explicit context tests use the real implementation. |
| frontend/test/global-learning-variants-r10.test.mjs | Verify original hashes, WebP dimensions/orientation, actual image selection/fallback and generator safety. |
| frontend/test/page-access.test.mjs | Verify a spoofed prefetch pathname is overwritten without changing session/CSP/privacy behavior. |
| frontend/test/public-summary-ssr-r10.test.mjs | Test fixed anonymous paths, parallel deadlines, late first mounts, confirmed-empty retention, navigation/account/CMS retirement and unchanged owner/cache boundaries. |
| frontend/test/public-website-ssr-r10.test.mjs | Test deterministic saved CMS SSR, refresh/owner behavior, credential exclusion and real HTTP/body timeouts. |
| frontend/test/v60-11-auth-hydration.test.mjs | Make the existing context double distinguish the immutable hydration snapshot from refreshed content. |
| frontend/test/video-review-visible-r9.test.mjs | Verify poster deferral/priority, pinned sources, source-error reset, visibility and provider message behavior. |
| frontend/ui-tests/page-gallery-r5.spec.ts | Verify the selected responsive photograph actually decodes with the correct bitmap dimensions and selection state. |
| frontend/ui-tests/page-section-catalog.spec.ts | Verify confirmed SSR sections survive a failed browser refresh while successful empty replies remain honest. |
| frontend/ui-tests/video-reviews.spec.ts | Wait for the controlled one-review refresh before provider assertions when an SSR list already exists. |
| scripts/optimize-global-learning-assets.cjs | Additive, five-source-only WebP generator with original-provenance and existing-file collision guards. |
| docs/PERFORMANCE-R10.md | Requested findings, changes, measured results, validation and hosting notes. |
| docs/release-baseline-v60.16.0.json | Reviewed source snapshot updated only after exact diff/original-asset validation; existing integrity checks remain active. |

## Verification and server setup

- Final integrated release: frontend **1,047/1,047**, backend/runtime/contracts **1,611/1,611**, isolated MongoDB/media **78/78**, production UI **171/171**, actual Express/MongoDB admin/upload browser **2/2**, and both production builds passed. The final review-player tests also verify muted URL startup without API readiness and safe offscreen removal of an unready frame; ready frames remain stable.
- The initial performance phase passed frontend 971/971; backend 1,376/1,376; runtime 178/178; contracts 18/18; actual FFmpeg/GridFS/HTTP 7/7; actual browser 51/51. Production UI and normal standalone builds pass. Local native image/dependency-policy checks pass; no package/lock changes were made.
- Native regression tests verify original SHA, H.264/yuv420p faststart, JPEG poster, exact 206/HEAD/416, byte consistency across preparation, one metadata batch, derivative rejection, download-original and unpublish revocation. UI tests cover existing preview/full playback, viewport pause, provider controls, auth hydration, photos, galleries and layouts.
- No new Redis service or env variable is required. Existing memory cache is bounded 128 entries/32MiB/10s with in-flight coalescing and admin invalidation in the receiving process; other workers observe the existing TTL. Private account/financial data is not put in it.
- Existing Caddy already enables zstd/gzip; Next compression and immutable hashed /optimized assets already exist. Hosting/CDN may cache public hashed assets; preserve current private API/media cache and publication rules. No CDN provisioning or live cache behavior was verified.
- For production SSR use the existing frontend runtime PUBLIC_SITE_URL (actual HTTPS frontend origin), NEXT_PUBLIC_API_URL=/api and API_PROXY_TARGET (existing backend origin or approved internal Docker configuration). Existing verified proxy-client-IP settings remain required where configured; no identity fallback bypass was added. No private environment value was changed or printed.
- Check ffmpeg -version on the backend host. Existing optional processing requires FFmpeg on PATH; the current backend Dockerfile does not install it. Without it, native reviews use original bytes and a fallback poster. A host operator must provision FFmpeg through supported hosting/container setup for optimized teasers. Originals/paid lessons are not transcoded by this work.
- No deployment, live provider operation, webhook subscription change or existing customer/payment/subscription-record modification was performed. Deploy the matching frontend and backend code together through the existing reviewed workflow; this local delivery does not update the currently deployed backend.

Evidence: [raw before/after API](../qa/v60.16.0-r10/api-comparison.json), [final integrated browser comparison](../qa/v60.16.0-r10/browser-comparison-release.json), [image verification](../qa/v60.16.0-r10/global-learning-verification.json), [earlier performance-stage loader frames](../qa/v60.16.0-r10/loading-visibility-final.json), [exact changed-file hashes](../qa/v60.16.0-r10/changed-files.json). Test/build logs and raw samples are in the same folder.
