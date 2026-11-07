# Singh Academy R8 — direct image delivery and code review

The rejected local photo picker and import commands/scripts have been removed.
There is no mandatory owner photo-selection step in setup. Direct source image
placement and the existing authorized CMS image editor remain. The established
page theme/layout is preserved.

The actual uploaded DOP_269.zip originals are now directly embedded:

- Landing: DOP_269.JPG, 3308 × 2205, 3,092,008 bytes.
- Home: DOP_86.JPG, 4864 × 3648, 3,019,858 bytes.

Both JPEGs are copied without resizing or recompression. Source and archive
hashes are in docs/direct-hero-images-r8.json. Four high-quality 480/960px WebP
display copies reduce normal browser transfer; original full-resolution JPEGs
remain available as high-DPR candidates. Existing protected assets are unchanged.
Website CMS slots image-075 and image-077 point to the new source identities;
stale settings cannot silently rebind old photo URLs on an unrelated text save.
The page frames, typography, colors and CSS are unchanged. Actual page crops and
mobile/desktop acceptance are recorded in the QA report after execution.

The canonical complete project ZIP includes all original/display image bytes.
The compact offline updater may reuse the exact already-owned DOP_269.zip as a
verified delivery sidecar to avoid embedding six megabytes in copy-paste text.
That only transports already-configured bytes into the complete new project; it
never asks the owner to select photos or configure their placement. The app has
no picker/import step. Use the final offline instructions for file delivery.

R8 also corrects a video timing race: when the full viewer opened, or reduced
motion became active, before a provider-ready signal, an initial autoplaying
preview could continue behind the viewer. Ready initialization now explicitly
pauses in that state. Stable frames, exact-origin/window checks and public full
playback remain. Existing high-refresh carousel and bounded administrator-video
storage/progress fixes remain; Grid stays a grid and Carousel moves automatically
with inspection/reduced-motion behavior.

Use START-HERE-WINDOWS.md for dependency/setup/run steps and the existing local
upload configuration. No Git, database reset, photo-selection tool or migration
is required merely to run the source. Physical transfer/storage/scanner and
browser/provider behavior still determine media timing. Real hosted SMTP/payment
and scanner acceptance is distinct from local fixtures.
