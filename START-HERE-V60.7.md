# Quick start — V60.7

Read `HOSTINGER-V60.7-UPDATE.md`. Use the existing repository and the existing two Hostinger apps; do not start the setup/domain/email-migration wizard again.

1. Preserve your private env files, original MongoDB URI/database name, auth/MFA keys and lockfiles. Back up the real database.
2. Replace project code with this release, keeping the repo root at the level containing `backend` and `frontend`.
3. Node 22.x: `npm run install:all`, `npm --prefix backend run preflight`, `npm run migrate:v60.7`, `npm run verify`.
4. Check frontend `NEXT_PUBLIC_API_URL=/api`, `API_PROXY_TARGET=https://navajowhite-lobster-767933.hostingersite.com`. Check backend frontend URLs match `https://mediumspringgreen-cod-301282.hostingersite.com`.
5. Configure SMTP and allowlist only real tester addresses for sandbox confirmations. Do not put backend secrets into frontend env.
6. Review mode security: use real scanning for uploads or the explicitly upload-disabled review profile described in the guide. No public-development bypass advice.
7. Commit/push and redeploy backend then frontend on the same apps. Purge stale API caches once. Run `npm run deploy:check -- --front https://mediumspringgreen-cod-301282.hostingersite.com --api https://navajowhite-lobster-767933.hostingersite.com`.
8. Confirm login persistence, independent students, content loading, sandbox webhooks and real inbox delivery before sending the client the review link.

No seed/reprice/reset command is needed. Existing certificate generation/assets/approval/download files are unchanged. `QA-V60.7.md` states exactly which checks were executed and which remain to be run on your network.
