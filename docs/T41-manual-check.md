# T41: Manual receipt scenario check

Date: 2026-11-06
Result: PASS
Role: clerk
Karigar: Ramesh T
Job: TEST-T41
Category: Necklace
Agreed wastage: 3.00%

test.md was unavailable. Verification used the sample figures in
PRDKarigar.md and TDDkarigar.md.

| Check                                               | Confirmed result     |
| --------------------------------------------------- | -------------------- |
| Issue 120.000 g at 91.60%                           | 109.920 g fine       |
| Piece receipt: net 112.450 g at 91.60%, HUID ABC124 | 103.004 g returned   |
| Balance after piece                                 | 6.916 g              |
| Scrap receipt: 3.300 g at 91.60%                    | 3.023 g returned     |
| Balance after scrap, including after refresh        | 3.893 g              |
| Allowed wastage                                     | 3.298 g              |
| Actual wastage at closing                           | 3.893 g              |
| Unexplained wastage at closing                      | 0.595 g              |
| Close for review                                    | Successful; HTTP 200 |

The issue and both receipt requests returned HTTP 201.
Murugesan's seeded transactions were not modified.
TEST-T41 remains as permanent test data in the append-only ledger.
