# Start Here — Singh Academy V60.6

## Local setup

Use Node.js 22.x.

```powershell
npm run install:all
npm --prefix backend run preflight
npm run migrate:v60.4
npm --prefix backend test
npm --prefix backend run test:certificate
npm run verify
npm run payments:check
npm run dev:backend
```

Second terminal:

```powershell
npm run dev:frontend
```

Open:
- Frontend: `http://localhost:3000`
- API health: `http://localhost:5000/api/health`

Expected health version: `60.6`.

## Database

V60.6 has no new database schema migration. Continue using the latest migration command:

```powershell
npm run migrate:v60.4
```

Do not reseed an existing database unless you intentionally want seed/demo records.

## Certificate theme

All newly issued certificates use the same Singh Academy certificate master. Student name, course title, completion date, issue date and certificate number are populated dynamically from the learner/course completion record.
