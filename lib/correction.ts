import type { createDb } from "@/lib/db";
import { HttpError } from "@/lib/authz";
import {
  correctionSchema,
  type CorrectionInput,
} from "@/lib/schemas/correction";

type Db = ReturnType<typeof createDb>;
type Input = CorrectionInput & { orgId: string; userId: string };

export async function correctReceipt(db: Db, input: Input) {
  const parsed = correctionSchema.safeParse({
    entryId: input.entryId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  });
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0].message);
  }
  const d = { ...parsed.data, orgId: input.orgId, userId: input.userId };

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${d.orgId}))`;

      const existing = await tx.ledgerEntry.findUnique({
        where: { idempotencyKey: d.idempotencyKey },
      });
      if (
        existing &&
        (existing.orgId !== d.orgId ||
          existing.entryType !== "correction" ||
          existing.reversesEntryId !== d.entryId ||
          existing.reason !== d.reason)
      ) {
        throw new HttpError(
          409,
          "Idempotency key already used for another request",
        );
      }

      const original = await tx.ledgerEntry.findFirst({
        where: { id: d.entryId, orgId: d.orgId },
      });
      if (!original) throw new HttpError(404, "Entry not found");

      const job = await tx.job.findFirst({
        where: {
          id: original.jobId,
          orgId: d.orgId,
          karigarId: original.karigarId,
        },
      });
      if (!job) throw new HttpError(404, "Job not found");

      const jobSum = await tx.ledgerEntry.aggregate({
        where: { orgId: d.orgId, jobId: job.id },
        _sum: { fineMg: true },
      });
      const karigarSum = await tx.ledgerEntry.aggregate({
        where: { orgId: d.orgId, karigarId: original.karigarId },
        _sum: { fineMg: true },
      });
      const jobBalanceMg = jobSum._sum.fineMg ?? 0;
      const balanceMg = karigarSum._sum.fineMg ?? 0;

      if (existing) {
        return { entry: existing, jobBalanceMg, balanceMg, replayed: true };
      }

      if (original.entryType === "issue") {
        throw new HttpError(
          409,
          "Issue reversal requires a job cancellation workflow",
        );
      }
      if (original.entryType === "correction") {
        throw new HttpError(409, "A correction cannot be reversed");
      }
      if (job.status !== "open") throw new HttpError(409, "Job is closed");

      const reversal = await tx.ledgerEntry.findUnique({
        where: { reversesEntryId: original.id },
      });
      if (reversal) throw new HttpError(409, "Entry is already reversed");

      const rows = await tx.$queryRaw<{ n: number }[]>`
        SELECT COALESCE(MAX(CAST(SUBSTRING(slip_no FROM 4) AS INT)), 30410) AS n
        FROM ledger_entries
        WHERE org_id = ${d.orgId}::uuid AND slip_no ~ '^TX-[0-9]+$'`;

      const fineMg = -original.fineMg;
      const entry = await tx.ledgerEntry.create({
        data: {
          orgId: d.orgId,
          karigarId: original.karigarId,
          jobId: job.id,
          entryType: "correction",
          grossMg: original.grossMg,
          purityH: original.purityH,
          fineMg,
          huid: original.huid,
          reversesEntryId: original.id,
          reason: d.reason,
          slipNo: `TX-${Number(rows[0].n) + 1}`,
          idempotencyKey: d.idempotencyKey,
          createdBy: d.userId,
        },
      });

      return {
        entry,
        jobBalanceMg: jobBalanceMg + fineMg,
        balanceMg: balanceMg + fineMg,
        replayed: false,
      };
    },
    { timeout: 20000 },
  );
}
