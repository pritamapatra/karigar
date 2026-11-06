# T42: As-on ledger query

## Calendar decision

- Business timezone: Asia/Kolkata.
- Input: a valid calendar date in YYYY-MM-DD format.
- Include all history before the midnight immediately after that date.
- Filter: createdAt < next local midnight converted to UTC.
- Do not apply a start-of-day lower bound: earlier entries contribute to balance.
- Example: 2026-11-06 uses createdAt < 2026-11-06T18:30:00.000Z.
- Deployment location and database region do not define the business timezone.

## Query contract

- Query one karigar within the authenticated organization.
- Core read access: clerk, finance and partner.
- Deny the stretch karigar role until own-ledger authorization is implemented.
- Reject invalid dates rather than normalizing impossible calendar dates.
- Return entries in ascending createdAt order, then ascending id for ties.
- Compute each running balance from signed fineMg in that order.
- Compute the final balance from exactly the returned entries.
- A valid karigar with no qualifying entries returns an empty list and zero balance.
- A missing or other-organization karigar returns 404.
- Do not filter by current job status.
- Do not change ledger entries or implement T43 UI.

## Local test mapping

The available project documents reference I15 and I16 but do not define them.
The following mapping is locally assigned for T42, not recovered from test.md.

- I15: Historical ledger returns only qualifying entries, with exact running
  and final balances; later receipts do not alter a past-date result.
- I16: Asia/Kolkata cutoff includes an entry immediately before next midnight
  and excludes an entry exactly at next midnight; organization and karigar
  scoping prevent unrelated entries from affecting the result.

Additional coverage: invalid dates, empty history and unknown karigar.
