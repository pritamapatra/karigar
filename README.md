# Karigar by Isocode Labs

Gold ledger for karigar issues, receipts, wastage, balances, stock and review alerts.

- Repository: https://github.com/pritamapatra/karigar
- Author: Pritam Patra
- Live app: https://karigar-mocha.vercel.app/
- Setup and deployment: see `deployment.md`.
- Architecture and limitations: see `TDD.md`.
- Test and acceptance evidence: see `verification.md`.

## Stack

Next.js App Router, TypeScript, React, Supabase Auth/Postgres/private Storage,
Prisma, Zod, Vitest, IndexedDB through idb, and a restricted service worker.

## Local commands

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

Installation, unit/component tests and build were exercised in a fresh clone
without `.env.local`. Authenticated runtime use requires configured services.
See deployment.md before running migrations, seed scripts or integration tests.

## Important limitations

This is not certified production financial software.
Cold offline navigation shows a non-sensitive fallback rather than reopening
authenticated entry forms. Offline photos and rejected-entry editing are not
implemented. Browser replay and live photo-backed persistence still need
dedicated demo-data verification.

Do not smoke-test with real financial transactions.

## Public production URL check — 14:00 IST

- Production URL supplied by the user: https://karigar-mocha.vercel.app/
- User-run anonymous curl check: HTTP 200.
- Final response URL: https://karigar-mocha.vercel.app/login
- The request reached the application's login route, not Vercel Authentication.
- Authenticated demo-role checks, exact deployed source commit, live photo-backed
  persistence and browser queue replay remain unverified.
- Earlier deployment-specific URL observations are historical evidence, not the
  current production entry point.
