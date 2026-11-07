# V60.15.0 — START HERE

This complete source release addresses the security audit's course-access/refund, uncertain-checkout, assessment-token, deployment-mode, trusted proxy and index-readiness findings without a public UI redesign. It is a **release candidate pending the documented networked checks**, not a live-approved certificate.

Read `LOCAL-GUIDE-V60.15.md` first. Preserve your private .env and real V60.14.1 lockfiles, not old package/source files. Do not reset/seed data or reinstall Node. Run `npm run verify:release`, then the separate realMongo gate `npm run verify:integration` (Docker) or both GitHub jobs. Before hosted startup, read-only `db:check` and `access:audit` reports must be reviewed. Database index additions require explicit `--apply` and backup/review. New required indexes can intentionally block startup until prepared.

The actual controlled results are in `QA-REPORT-V60.15.md`; full build/audits/Mongo/browser/Hostinger/provider acceptance were NOT completed in the authoring environment because registry DNS and Docker prerequisites were unavailable. No live keys before staging acceptance. The signed client-IP proof also needs verified hosting-edge configuration, never guessed X-Forwarded-For trust.
