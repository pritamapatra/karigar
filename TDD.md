# Technical Design Document: Karigar by Isocode Labs

GitHub: https://github.com/pritamapatra/karigar
Live app: https://karigar-mocha.vercel.app/
Deployment: user-reported Ready on main; exact deployed commit and runtime acceptance checks remain unverified.
Author: Pritam Patra
Date: 2026-11-09
Status: implemented MVP with explicitly incomplete acceptance criteria

## 1. Purpose and boundaries

Track gold issued to karigars and returned as pieces, scrap and filings.
Compute balances and wastage, provide append-only corrections, and expose stock
and neutral loss-review alerts according to server-enforced roles.

Single-tenant scope. Real payments and external accounting/message integrations
are not part of this delivery. This document does not certify production readiness.

## 2. Architecture

Browser forms communicate with Next.js route handlers. Supabase supplies Auth,
Postgres and private photo storage. Prisma accesses Postgres. Zod validates
requests. Server services compute authoritative gold values.

IndexedDB stores account-scoped drafts, cached form reference data and immutable
queued request bodies. A restricted service worker stores a non-sensitive offline
fallback and eligible static build assets, not authenticated HTML or API responses.

## 3. Exact gold arithmetic

Weights use integer milligrams; purity uses hundredths of a percent.

- Fine mg = half-up round(gross mg × purity H / 10000).
- Allowed mg = half-up round(issued fine mg × wastage basis points / 10000).
- Balances sum rounded per-entry signed fine weights.
- Unexplained loss = max(remaining balance − allowed wastage, 0).

Sample:
120000 mg at 9160 purity H = 109920 fine mg.
A 112450 mg piece returns 103004 fine mg.
A 3300 mg scrap return contributes 3023 fine mg.
Remaining balance = 3893 mg; allowance = 3298 mg; unexplained = 595 mg.

Client figures are previews. Server calculations and validation remain authoritative.

## 4. Ledger and transactions

Posted ledger entries are append-only by design and database migration.
Corrections append reversing entries rather than updating the original.
Jobs, ledger entries, photos and AI readings retain audit relationships.

Issue creation now checks idempotent replay against organisation, creator,
entry type, karigar, job/category, values and photo/reading references.
Organisation advisory locks serialize the relevant transaction path.
Receipt services similarly validate replay payload and available balances.

The current session's database trigger/integration checks were not rerun;
unit/component tests must not be represented as a live database proof.

## 5. Roles and data boundaries

Server role guards protect API operations. Clerk and finance can create entry
writes. Partner access is read-only. Stock and alert visibility follows dedicated
server guards. Offline issue/receipt replay sends account headers that are
checked against the authenticated session, not treated as authentication.

## 6. Photo confirmation

1. Allocate a signed upload through POST /api/scale-photos.
2. Upload from the browser to private Supabase storage using the signed token.
3. Request reading through POST /api/scale-photos/[id]/read.
4. Show evidence and suggested/typed values in the confirmation sheet.
5. Copy readable high-confidence values only after explicit Use reading.
6. Block high-confidence mismatches until corrected or supplied an override reason.
7. Persist photo/reading references with the ledger entry.

Low/unreadable results support manual entry. Provider failures do not prevent
manual work. A successfully uploaded photo remains attached after a read failure.
Rejected reading-attempt references are retained where returned by the server.

Photo ownership is checked through the organisation-scoped storage path;
readings must belong to the attached photo and cannot be reused across entries.

Mocked tests cover these paths. Latest live photo-backed persistence remains
unverified.

## 7. Offline implementation

- Drafts restore from account-scoped IndexedDB.
- Draft writes debounce by 200 ms; abrupt power loss can lose recent keystrokes.
- Account-scoped reference fallback covers karigars, categories and open jobs.
- HTTP authentication/authorization failures do not silently return cached data.
- Offline saves preserve exact serialized bodies and idempotency keys.
- Unknown online outcomes retain a frozen request for identical retry.
- Replay checks session identity and uses a browser-wide account lock.
- Rejections enter Needs review and stop later replay.
- Sync review supports inspection and confirmed discard of rejected entries.
- Connectivity strip shows unsynced count and replay state.
- Sign-out is coordinated with replay and warns that local work remains.
- Local storage is not encrypted; account scoping is not protection from someone
  inspecting device/browser storage.
- A cold offline navigation displays a generic, non-sensitive fallback.

No provisional balance is authoritative. The server revalidates writes.
Browser installation, real reconnect replay and sign-out behaviour need manual
verification in the deployed application.

## 8. Tests and security evidence

At pushed baseline 72a53b5:
339 tests passed across 35 files, TypeScript passed after route generation,
repository lint and production build passed.

A fresh clone without `.env.local` passed installation, lint, all 339 tests and
production build. Standalone pre-build TypeScript initially failed due to
generated LayoutProps; an explicit typecheck script and CI step were added and
passed locally, pending final fresh-clone verification.

Production-only dependency audit reported zero findings. The full audit reported
13 development-tool findings. These are unresolved, not waived by classification.

Gitleaks 8.30.1 scanned 64 commits. One historical finding was locally verified as a canonical UUID assigned to a receipt-test idempotencyKey, not an authentication credential. Its exact commit/file/rule/line fingerprint is recorded in .gitleaksignore. The subsequent history scan reported no leaks. This is a scoped scanner result, not a guarantee that no secret can exist.

## 9. What was cut or remains incomplete

- Full cold-offline authenticated form reopening.
- Offline photo capture/upload queue.
- Rejected-entry editing and resubmission (discard exists).
- Verified Playwright E1/E2/E5 journeys.
- Full phone/tablet, accessibility and per-screen state audit.
- Latest demo-role deployment verification.
- Live photo-backed issue and receipt persistence.
- Browser proof of exactly-once reconnect replay.

Stretch exclusions: Tamil karigar view, Tally export, old-gold desk, refiner stock.

The original checklist is not blanket-marked complete. Earlier tasks require
their own evidence where this session did not audit them.

## 10. Delivery

Required artifacts: this TDD, deployment.md, a readable PDF, final screenshots and
a ZIP under 25 MB. PDF, screenshots and archive verification are pending.

## Public production URL check — 14:00 IST

- Production URL supplied by the user: https://karigar-mocha.vercel.app/
- User-run anonymous curl check: HTTP 200.
- Final response URL: https://karigar-mocha.vercel.app/login
- The request reached the application's login route, not Vercel Authentication.
- Authenticated demo-role checks, exact deployed source commit, live photo-backed
  persistence and browser queue replay remain unverified.
- Earlier deployment-specific URL observations are historical evidence, not the
  current production entry point.
