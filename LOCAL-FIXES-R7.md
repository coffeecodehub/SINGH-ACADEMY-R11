> Historical R7 document. Its photo-picker/import workflow is retired in R8. Use START-HERE-WINDOWS.md and LOCAL-FIXES-R8.md for current setup.

# Singh Academy 60.16.0 — R7 corrections

The public layout and theme remain. R7 addresses specific problems reported after
the owner's Windows R6 run. Its package version remains 60.16.0. Consult
`QA-REPORT-R7.md` and the accompanying delivery manifest for executed evidence.

## Carousel and review video startup

Integer-rounded scroll offsets could discard every small carousel step on
120/144 Hz displays. The carousel now retains fractional movement between frames.
Hover, keyboard focus, touch inspection and reduced-motion preferences remain.
Automatic movement applies to the selected **Carousel** gallery layout; Grid
remains a grid. There is no global Play/Pause preview button.

YouTube, Vimeo and TikTok preview URLs now request muted autoplay when mounted,
instead of depending only on receiving a provider-ready message. Provider API
readiness still governs commands. A stable iframe URL preserves pause/resume
without reloading. Vimeo previews no longer automatically pause other cards.
Instagram, browser autoplay, codec and embedding policies remain provider/browser
constraints. Full videos remain public and untrimmed.

## Video transfer and storage

Trusted administrator videos use bounded 4 MiB GridFS chunks instead of the
default 255 KiB chunks, reducing database write round trips. Existing files remain
readable, including Range playback. Images, student files and receipts retain
their existing storage policies. Required signature checks and hosted scans stay.

Video Review and Page Section editors show measured browser transfer percentage,
then a separate verifying/saving stage. They do not claim success at 100% transfer
or automatically repeat an upload. Original bytes are retained. Actual connection,
disk, scanner and database capacity determine total time; no fixed duration is
promised. `uploads:local` remains an explicit localhost-development-only setup.

## Requested Home and Landing photographs

The requested Landing certificate-group and Home whiteboard originals are not
available to this executor. The India/Kigali attachment exceeds its 32 MiB
transfer limit. Existing originals are not altered or presented as replacements.

Supply the two originals individually to finish and visually verify the exact
replacements here. Alternatively, `photos:replace` can import those original
JPG/PNG files directly from the owner's local PC, without recompressing them.
On Windows, after dependencies/setup, run `npm.cmd run photos:pick`: choose the
certificate-group original for Landing, then the whiteboard original for Home.
Cancelling either selection imports nothing. The picker passes both chosen paths
to the same byte-preserving CLI. Actual Windows dialog acceptance remains an
owner check; explicit-path portable tests do not establish GUI behavior.

For known paths, read the CLI dry-run output before explicit apply. It updates only the two
hero defaults and their editable CMS slots, records hashes/dimensions, and can
refresh the reviewed snapshot only after confirming the existing source matches.
After import restart BOTH backend/frontend; production requires a frontend
rebuild. Run verification, then package a NEW ZIP with `scripts/Package-Clean.ps1`.
The updater's pre-import ZIP cannot contain files selected later.

An empty photo-import manifest means **the requested originals are not yet
imported**. Fixture imports do not certify the requested real photographs.

The offline builder creates a NEW complete R7 folder and ZIP from R6. It leaves
R6 untouched and copies private settings only into the new local folder after
clean ZIP verification. A later local photo import changes that local source;
rebuild the clean ZIP after import before handing over those photos. No GitHub,
production database, remote provider or hosted deployment operation is performed.

Real SMTP delivery and Stripe/PayPal merchant/webhook acceptance still require
the configured hosted environment. Use `HOSTINGER-R7-READY.md` for that boundary.
