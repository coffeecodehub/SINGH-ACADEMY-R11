# V60.15.2 — changed files

## Application behavior

- Delete only the old `frontend/app/free-resources/page.tsx` and `frontend/app/resources/page.tsx` notFound page stubs.
- Add `route.ts` handlers in each `[[...retired]]` child folder for real GET/HEAD 404 responses at roots and old deep links.
- Add `frontend/lib/server/retiredNotFound.ts`: script-free, non-reflecting terminal 404 with old status-page copy/styles.
- No edit to middleware, auth policy, actual course/payment/refund logic, public CSS, photos, videos or certificates.

## Tests and launcher

- Add `frontend/e2e/retired-routes.spec.ts`: 8 DB-backed cases; only one additional real registration across read-only cases.
- Add `frontend/ui-tests/retired-routes-v60-15-2.spec.ts`: 4 cases, so ordinary verify:release catches both retired URLs too.
- Add `frontend/test/v60-15-2-retired-routes.test.mjs`: 10 controlled route/transport/scope checks.
- Add `scripts/standalone-files.mjs` and 7 tooling checks in `scripts/test/v60-15-2-standalone.test.mjs`.
- Modify only `scripts/start-browser-stack.mjs` to prepare/start the generated standalone server.
- Original `frontend/e2e/public-portals.spec.ts` and its strict 404 assertion remain unchanged.

## Metadata and reports

- Three package versions; backend health/start labels; visible admin version label: 60.15.2 only.
- README/CURRENT-RELEASE and new versioned guide/QA/source-evidence documents.
- Previous current-named QA files archived; current markers set to not_run (not an audit result).
- No dependency declarations, Node policy, Docker Compose or GitHub workflow changes.

## Exact pre-report changes from original ZIP

- `CURRENT-RELEASE.md`
- `README.md`
- `backend/package.json`
- `backend/src/app.js`
- `backend/src/server.js`
- `frontend/components/business/BusinessPortal.tsx`
- `frontend/package.json`
- `package.json`
- `qa/integration-checks.json`
- `qa/release-checks.json`
- `qa/security-dependencies.json`
- `scripts/start-browser-stack.mjs`

## Deleted

- `frontend/app/free-resources/page.tsx`
- `frontend/app/resources/page.tsx`
