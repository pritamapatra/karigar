import type { createDb } from "@/lib/db";
import { HttpError } from "@/lib/authz";
import { fineMg } from "@/lib/gold";
import type { ReceiptInput } from "@/lib/schemas/receipt";

type Db = ReturnType<typeof createDb>;
type Input = ReceiptInput & { orgId: string; userId: string };

export async function receiveGold(db: Db, d: Input) {
  const weightMg = d.entryType === "receipt_piece" ? d.netMg : d.grossMg;
  const huid = d.entryType === "receipt_piece" ? d.huid : null;
  const returnedFineMg = fineMg(weightMg, d.purityH);

  if (returnedFineMg <= 0) {
    throw new HttpError(
      400,
      "Weight and purity must produce at least 1 mg of fine gold",
    );
  }

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${d.orgId}))`;

      const existing = await tx.ledgerEntry.findUnique({
        where: { idempotencyKey: d.idempotencyKey },
      });

      if (
        existing &&
        (existing.orgId !== d.orgId ||
          existing.jobId !== d.jobId ||
          existing.entryType !== d.entryType ||
          existing.grossMg !== weightMg ||
          existing.purityH !== d.purityH ||
          existing.huid !== huid)
      ) {
        throw new HttpError(
          409,
          "Idempotency key already used for another request",
        );
      }

      const job = await tx.job.findFirst({
        where: { id: d.jobId, orgId: d.orgId },
      });
      if (!job) throw new HttpError(404, "Job not found");

      const jobSum = await tx.ledgerEntry.aggregate({
        where: { orgId: d.orgId, jobId: job.id },
        _sum: { fineMg: true },
      });
      const karigarSum = await tx.ledgerEntry.aggregate({
        where: { orgId: d.orgId, karigarId: job.karigarId },
        _sum: { fineMg: true },
      });
      const jobBalance = jobSum._sum.fineMg ?? 0;
      const karigarBalance = karigarSum._sum.fineMg ?? 0;

      if (existing) {
        return {
          entry: existing,
          jobBalanceMg: jobBalance,
          balanceMg: karigarBalance,
          replayed: true,
        };
      }

      if (job.status !== "open") throw new HttpError(409, "Job is closed");
      if (returnedFineMg > jobBalance || returnedFineMg > karigarBalance) {
        throw new HttpError(409, "Receipt exceeds the available balance");
      }

      const rows = await tx.$queryRaw<{ n: number }[]>`
      SELECT COALESCE(MAX(CAST(SUBSTRING(slip_no FROM 4) AS INT)), 30410) AS n
      FROM ledger_entries
      WHERE org_id = ${d.orgId}::uuid AND slip_no ~ '^TX-[0-9]+$'`;

      const entry = await tx.ledgerEntry.create({
        data: {
          orgId: d.orgId,
          karigarId: job.karigarId,
          jobId: job.id,
          entryType: d.entryType,
          grossMg: weightMg,
          purityH: d.purityH,
          fineMg: -returnedFineMg,
          huid,
          slipNo: `TX-${Number(rows[0].n) + 1}`,
          idempotencyKey: d.idempotencyKey,
          createdBy: d.userId,
        },
      });

      return {
        entry,
        jobBalanceMg: jobBalance - returnedFineMg,
        balanceMg: karigarBalance - returnedFineMg,
        replayed: false,
      };
    },
    { timeout: 20000 },
  );
}
