# Start Here — Singh Academy V60.4

## Local / Atlas setup
1. Use Node.js 22.x.
2. Copy your existing working secrets into `backend/.env`. Never commit the real `.env`.
3. The Atlas URI must include the database name, for example `/singh_academy?...`; otherwise MongoDB defaults to `test`.
4. Install dependencies on a working network: `npm run install:all`.
5. Run `npm --prefix backend run preflight`.
6. Run the safe database repair once: `npm run migrate:v60.4`.
7. On a brand-new empty database only, run the required seed scripts once if you want the supplied initial content/admin accounts: `npm --prefix backend run seed:data`, `seed:courses`, `seed:admins`.
8. Run `npm run verify` after the backend/frontend lockfiles exist.
9. Start the backend: `npm run dev:backend` and confirm `/api/health` reports `60.4`.
10. Start the frontend in another terminal: `npm run dev:frontend`.

## Required enrollment checks
- Student A can enroll in a course.
- Student B can enroll in the same course independently.
- The same student/course pair remains one enrollment record.
- A free course grants that student free access.
- An individual paid course grants only that student that course for the purchased term.
- An active Academy membership exposes the whole published library, including courses published later during that membership term.
- Each learner keeps separate progress, assessment answers/attempts, billing/payment history, notifications and certificate/completion records.

## Client payment review before live keys
For a public review deployment use `NODE_ENV=production` and `DEPLOYMENT_STAGE=review` with a separate review database, Stripe test keys and PayPal sandbox credentials. V60.4 deliberately blocks live credentials in review mode. Sandbox records remain labelled/test-mode and do not count as real collections.

For the real launch change `DEPLOYMENT_STAGE=production`, replace BOTH providers with live credentials/webhooks, run the remote payment check, and test one controlled real payment before opening sales.
