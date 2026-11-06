# T44: Receipt correction API

Contract confirmed by the builder on 2026-11-06.

## Scope and authorization

- Clerk and finance may create corrections.
- Partner and karigar roles cannot create corrections.
- T44 supports receipt_piece, receipt_scrap and receipt_filings reversals only.
- Issue reversals return 409 until job cancellation/replacement is defined.
- Reversing a correction returns 409.
- New corrections on closed jobs return 409.
- No correction UI in T44; that belongs to T45.

## Input

- entryId: UUID identifying the original receipt.
- reason: trimmed, nonblank string, maximum 500 characters after trimming.
- idempotencyKey: UUID.
- Reject unknown fields, including client-supplied weights or fineMg.
- Derive orgId and userId from the authenticated session.

## Transaction

- Use the existing organization advisory transaction lock.
- Check the globally unique idempotency key inside the lock.
- A matching replay requires the same organization, correction entry type,
  original entryId and normalized reason.
- A mismatched key returns 409 without exposing the existing entry.
- Matching replay succeeds even if the job has since closed.
- Load the original entry and job within the authenticated organization.
- Missing or other-organization original entries return 404.
- An original already reversed under another key returns 409.
- Append one correction with fineMg equal to the negative of original fineMg.
- Copy the original jobId, karigarId, grossMg, purityH and HUID.
- Set reversesEntryId, normalized reason and the current user's createdBy.
- Generate the next TX slip under the same organization lock.
- Keep the correction's new database timestamp; never backdate it.
- Never update or delete the original ledger row.
- Return entry, jobBalanceMg, balanceMg and replayed.
- Return current balances on replay, not historical response balances.
- HTTP status: 201 for a new correction; 200 for a matching replay.

## Local test mapping

The available project documents reference I3/I4 without defining them.
These are locally assigned mappings, not recovered test.md definitions.

- I3: Receipt reversal preserves the original, appends its exact signed
  opposite, and restores job and karigar balances.
- I4: Missing, empty or whitespace-only reasons are rejected.

Additional coverage: input bounds, unknown fields, replay and changed-payload
conflicts, concurrent attempts, duplicate reversal, organization isolation,
unknown entry, issue rejection, correction rejection and closed-job rejection.

## Deferred accounting workflows

Issue reversal requires an explicit job cancellation/replacement design so
issuedFineMg and allowance calculations remain consistent.

Closed-job correction requires a defined reopening/review workflow before
changing the balance underlying closed-job wastage and future alerts.
