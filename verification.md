# Verification Record

Date: 2026-11-09
Author: Pritam Patra

## Confirmed evidence

| Check                                        | Result                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Pushed application baseline                  | 72a53b5                                                                                                      |
| Local/recorded remote alignment              | 0 ahead, 0 behind                                                                                            |
| Baseline tests                               | 339 passing, 35 files                                                                                        |
| Repository lint                              | Passed                                                                                                       |
| Production build                             | Passed                                                                                                       |
| Fresh clone without .env.local: installation | Passed                                                                                                       |
| Fresh clone: tests                           | 339 passing                                                                                                  |
| Fresh clone: lint                            | Passed                                                                                                       |
| Fresh clone: production build                | Passed                                                                                                       |
| Bare pre-build TypeScript in fresh clone     | Failed: generated LayoutProps absent                                                                         |
| Explicit next typegen + tsc command          | Passed locally                                                                                               |
| CI explicit typecheck step                   | Added; remote result unverified                                                                              |
| Production dependency audit                  | Reported 0 vulnerabilities                                                                                   |
| Full dependency audit                        | 13 development-tool findings unresolved                                                                      |
| History scan                                 | Passed with one reviewed exact-fingerprint exception for a UUID idempotency test fixture; 64 commits scanned |

## Previously user-confirmed browser checks

Before the current confirmation/offline batches:
deployed photo upload, result display and attachment removal passed.
Those observations do not validate the new deployment or photo-backed persistence.

## Not yet verified

- Current hosting deployment ready for the intended commit.
- Live URL and all three demo roles.
- Live photo-backed receipt persistence.
- Live photo-backed issue persistence.
- New confirmation-sheet and sign-out behaviour in a browser.
- Service-worker control and offline navigation fallback in a browser.
- Offline queue reconnect creates exactly one entry in a dedicated demo database.
- Rejection stops later queued entries.
- Browser account-switch isolation.
- 390 px and 1024 px layout review.
- Contrast, keyboard, transparency and reduced-motion checks.
- Database integration suite against an isolated test database.
- Playwright E1/E2/E5.
- Final fresh clone with explicit typecheck.
- PDF readability, screenshots and ZIP size/integrity.

## Known implementation limitations

Cold offline form reopening, offline photos and rejected-entry edit/resubmit are
not implemented. Draft writes debounce by 200 ms. Local data is not encrypted.

Do not replace this record with an all-green summary without corresponding evidence.

## Hosting evidence supplied at 13:37 IST

- Deployment URL: https://karigar-ez5htrs3j-pritampatra1141-gmailcoms-projects.vercel.app
- Dashboard status: Ready, reported by the user.
- Source branch: main, reported by the user.
- Exact source commit: not supplied.
- Independent retrieval by the assistant: unsuccessful.
- Authenticated browser checks: not yet reported.
- This URL has not been established as the permanent production alias.

## Public production URL check — 14:00 IST

- Production URL supplied by the user: https://karigar-mocha.vercel.app/
- User-run anonymous curl check: HTTP 200.
- Final response URL: https://karigar-mocha.vercel.app/login
- The request reached the application's login route, not Vercel Authentication.
- Authenticated demo-role checks, exact deployed source commit, live photo-backed
  persistence and browser queue replay remain unverified.
- Earlier deployment-specific URL observations are historical evidence, not the
  current production entry point.
