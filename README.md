# Karigar by Isocode Labs

Gold ledger for karigar issues, receipts, wastage, balances, stock and review alerts.

- Repository: https://github.com/pritamapatra/karigar
- Author: Pritam Patra
- Live URL: not supplied in the current verification record.
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
