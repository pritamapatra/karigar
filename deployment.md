# Deployment and Reproduction

Repository: https://github.com/pritamapatra/karigar
Author: Pritam Patra
Verification date: 2026-11-09
Production URL: https://karigar-mocha.vercel.app/
Dashboard status: user-reported Ready on main, 2026-11-09. Exact deployed commit and browser acceptance checks remain unverified.

## 1. Verified environment

- Node.js: 22.14.0
- npm: 10.9.2
- CI uses Node.js 22.
- Application baseline tested in a fresh clone: 72a53b5.
- The later explicit typecheck script passed locally; its fresh-clone recheck is pending.

## 2. Clone and validate without service credentials

```sh
git clone [https://github.com/pritamapatra/karigar.git](https://github.com/pritamapatra/karigar.git)
cd karigar
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

At baseline 72a53b5, npm ci, lint, all 339 tests and production build passed
without `.env.local`. Bare `tsc --noEmit` before a Next.js build failed because
LayoutProps had not been generated. The new `typecheck` script explicitly runs
`next typegen && tsc --noEmit`.

`npm test` excludes database integration tests. A successful build does not
prove authentication, database connectivity, storage permissions or deployment.

## 3. Runtime environment

Create `.env.local` locally and configure equivalent variables in the hosting
platform. Never commit or paste the values.

| Name                          | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| DATABASE_URL                  | Application database connection used by the Prisma adapter               |
| DIRECT_URL                    | Prisma migration/integration-test database connection                    |
| NEXT_PUBLIC_SUPABASE_URL      | Supabase project URL                                                     |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase browser/public client configuration                             |
| SUPABASE_SERVICE_ROLE_KEY     | Privileged server-side Supabase operations; never expose to browser code |
| DEMO_PASSWORD                 | Demo-user seed input; use fake demo accounts only                        |
| NODE_ENV                      | Set by the runtime/framework; production enables worker registration     |

This inventory came from direct process.env references in tracked source.
It is not proof that all provider-specific configuration has been identified.
AI provider runtime configuration must be checked against the provider module
before claiming a fresh deployment supports live readings.

The Prisma CLI configuration loads `.env.local` and uses DIRECT_URL.

## 4. Database and private storage

For a new, dedicated demo environment only:

1. Create the Supabase project and configure the environment values.
2. Review the checked-in migrations.
3. Apply them with `npx prisma migrate deploy`.
4. Review `scripts/setup-storage.ts`, then run `npm run storage:setup`.
5. Review `prisma/seed/index.ts`, then run `npm run db:seed`.
6. Verify the demo accounts and role profiles.

These provisioning steps were not rerun during the fresh-clone check.
Do not seed or run integration tests against a real financial database.
Do not use `prisma migrate reset` on a shared or production database.

Migrations include initial schema, constraints/append-only enforcement,
job-closure snapshots and pending AI-reading status.

## 5. Local runtime

```sh
npm run dev
```

For the production-mode service-worker check:

```sh
npm run build
npm start
```

The service worker registers in production mode only.
Use a separate test browser profile for offline tests.

## 6. Hosting

Import the GitHub repository into the configured Next.js hosting project.
Set runtime environment variables, deploy the intended commit, and verify that
the hosting platform reports that exact commit ready.

Migration, private storage setup and demo seeding are separate provisioning
operations; do not assume a frontend deployment performs them.

The user supplied a deployment-specific URL and reported Ready on main. The permanent production alias, exact deployed commit and runtime checks still require verification.

## 7. Smoke checks

Use isolated demo data only:

- Sign in as clerk, finance and partner; verify navigation and server boundaries.
- Check photo preview, zoom, explicit Use reading, manual fallback and mismatch blocking.
- Verify photo-backed issue and receipt persistence using designated demo records.
- Restore an unsaved form draft.
- With an already-open form, queue a manual entry offline.
- Reconnect and prove exactly one ledger entry exists for its idempotency key.
- Verify a server rejection appears in Sync review and stops later replay.
- Verify account switching does not replay another account's queue.
- Test sign-out cancellation and retained-local-work warning.
- Verify offline reload reaches the non-sensitive fallback.
- Check phone 390 px and tablet 1024 px layouts.

Do not report these as passed until the observations are recorded.

## 8. Security commands

```sh
gitleaks git --redact=100 --no-banner .
npm audit --omit=dev
npm audit
```

Review `.gitleaksignore`: any exception must identify a verified false positive,
not an actual credential. Redaction and allowlisting are not credential rotation.

## 9. Rollback and local storage

Deploy a previously verified commit through the hosting platform if needed.
A code rollback does not reverse append-only ledger transactions or migrations.

Local drafts/queues are account-scoped, not encrypted. Sign-out retains them
with a warning. Do not clear browser storage while unsynced or uncertain entries
exist. Server-side idempotency remains required for every replay.

## Public production URL check — 14:00 IST

- Production URL supplied by the user: https://karigar-mocha.vercel.app/
- User-run anonymous curl check: HTTP 200.
- Final response URL: https://karigar-mocha.vercel.app/login
- The request reached the application's login route, not Vercel Authentication.
- Authenticated demo-role checks, exact deployed source commit, live photo-backed
  persistence and browser queue replay remain unverified.
- Earlier deployment-specific URL observations are historical evidence, not the
  current production entry point.
