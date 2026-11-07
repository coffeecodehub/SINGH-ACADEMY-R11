# Review video playback and upload checks

Original review videos remain byte for byte unchanged. Scanning must finish before an upload is committed. A successful upload returns before optional preview processing starts; publishing the review still requires Save.

When the backend host has `ffmpeg` on its executable PATH, one bounded background worker makes a separate 20-second, silent H.264 MP4 preview with faststart metadata and a JPEG poster. It uses existing GridFS storage and metadata. It does not transcode the full original, alter a course video, or require new environment values. Jobs have execution/storage deadlines, a queue limit, and failure cleanup. Legacy published review videos request the same optional preparation when a preview/poster is first requested. Originals remain available during preparation.

Check the deployment machine with `ffmpeg -version`. This capability was available and tested in the development workspace; it is not assumed to be installed on your Windows PC or Hostinger server. Without FFmpeg, playback keeps using the original and a small placeholder poster. Install FFmpeg through the host's supported package manager if optimized review teasers are wanted. No environment values or deployment files were changed by this update.

The existing `/api/media/<original-file-id>?preview=1` and `?poster=1` options check the original video's current publication/administrator permission first. Unpublishing revokes original, preview and poster access. Derivative file IDs cannot be opened directly. HTTP Range requests receive 206, exact Content-Range/Content-Length and the selected media's MIME type. `?download=1` continues to download the untouched full original.

Muted review previews play while visible, pause outside the viewport or in a hidden browser tab, and resume when visible. Opening the full player pauses previews. Browser autoplay settings, reduced-motion preferences and third-party player/privacy restrictions still apply. YouTube/Vimeo/TikTok API messages remain bound to the exact player frame and origin. Instagram controls its own playback.

Upload progress is real network transfer progress. The following scanning/storage stage is indeterminate rather than a fabricated percentage. Active transfers have no duration limit. A connection with no progress for 90 seconds is stopped; after transfer, the client has a finite 6.5–15.5 minute scanner/storage deadline based on file size. Admin GridFS commits have a 1–10 minute storage deadline. An uncertain connection/commit outcome asks the administrator to check the upload list before retrying. A real HTTP 201 confirms a stored original.

The client retries at most twice only when the server explicitly returns HTTP 429 with `UPLOAD_BUSY`, `retryable: true` and `uploadCommitted: false`. Network errors, scanner errors, generic HTTP 429/503 and ambiguous commits are never repeated automatically. Required hosted malware scanning is unchanged. A scanner outage/allowance limit cannot be made safe by suppressing its error; the configured scanner must be available and support the intended file size.

This improves first display and streaming, but transfer time still depends on file size, network throughput, storage and the scanner. Millisecond playback and zero network latency cannot be guaranteed.

Verification: dedicated test database, local HTTP servers and real FFmpeg/ffprobe verified MP4 metadata at the start, H.264/yuv420p teaser, JPEG poster, original SHA preservation, current publication checks, 206/HEAD/range bytes, legacy fallback and failed-job child/chunk cleanup. Component tests cover viewport/tab pause/resume, origin-bound delayed readiness, progress/watchdogs and safe retry limits. Real Stripe/PayPal credentials are not used by these media tests.
