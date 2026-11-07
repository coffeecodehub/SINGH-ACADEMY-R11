# R8 — actual original-photo verification

The actual uploaded DOP_269.JPG is directly configured on Landing; DOP_86.JPG is
directly configured on Home. Original JPEG bytes match DOP_269.zip exactly.
Both source images, their four display variants and source configuration are
bundled. No owner photo picker/import command is part of setup.

| Executed check | Passed |
| --- | --- |
| Contracts | 18 |
| Runtime/tool suite | 178 |
| Frontend reliability | 891 |
| Backend regressions | 1,353 |
| Real HTTP/Mongo integration | 240 |
| Controlled actual browsers | 148 |
| Actual database browsers | 70 |
| Personally inspected actual-photo captures | 8 at 1440/390px |
| Portable clean-package helper cases | 6 |

All final listed test runs have zero failures/skips; browsers have zero retries.
Production build, TypeScript, syntax/import checks and all four full/production
dependency audits pass; the audits report zero known vulnerabilities at execution.
Counts overlap. Final archive CRC/hash, offline updater and independent clean
extraction results are in the accompanying post-seal delivery manifest.

## Actual photos and page acceptance

Landing group original: 3308×2205, 3,092,008 bytes. Home whiteboard original:
4864×3648, 3,019,858 bytes. Exact source/archive hashes are recorded in
`docs/direct-hero-images-r8.json`. Four WebPs at quality 92 and 480/960px total
380,144 bytes; the full original remains the largest srcset candidate. Existing
268 protected assets, five older uploaded originals and 72 earlier image-manifest
entries remain unchanged. At 960px the actual transferred image bytes are 93.31%
and 97.34% smaller than their originals; this is not a fixed network-time promise.

Actual Next browser tests verify original and variant HTTP hashes, approved
responsive selection, dimensions/aspect, existing cover crops, stable frames and
no horizontal overflow. Eight captures show untouched initial viewports and
unobstructed photo frames at 1440/390px. Landing shows the supplied group with
Dr. Singh visible; Home shows the supplied whiteboard photograph. Initial mobile
headers are at scrollY0, without the sticky-header overlap of cropped diagnostic
section screenshots. Page layouts, typography and CSS are unchanged. Old saved
hero settings cannot reappear during an unrelated CMS text save.

## Media and workflow corrections

The rejected local photo picker/import scripts and package commands are removed.
The compact updater may use the exact already-owned DOP_269.zip as a verified
binary delivery sidecar; it never selects or configures photos. The canonical
complete ZIP already contains all original/display assets. The prior missing-
input reports and R7 fixture-import runs remain historical.

R8 also fixes the provider-ready pause race: a preview becoming ready after its
full viewer opens or reduced motion activates now receives pause immediately.
Six timing cases fail against former code and pass with the fix. Exact-origin
checks and stable iframe sources remain. Existing high-refresh Carousel motion,
muted preview/full playback, verified admin-save feedback, bounded video storage,
real transfer progress and provider-confirmed billing controls remain covered.

Actual YouTube/Vimeo/TikTok/Instagram policy, browser codecs, OS preferences and
network/scanner/storage capacity cannot be guaranteed by local fixtures. Real
merchant collections/webhooks, SMTP inbox delivery and Hostinger acceptance were
not executed. No GitHub operation, production database write or deployment took
place. Known dependency audits do not prove absence of unknown flaws.
