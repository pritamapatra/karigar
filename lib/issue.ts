import type { z } from "zod";
import { HttpError } from "@/lib/authz";
import { fineMg } from "@/lib/gold";
import type { createDb } from "@/lib/db";
import type { issueSchema } from "@/lib/schemas/issue";

type Db = ReturnType<typeof createDb>;
export type IssueInput = z.infer<typeof issueSchema> & {
  orgId: string;
  userId: string;
};

function isUniqueViolation(e: unknown) {
  return (
    typeof e === "object" && e !== null && "code" in e && e.code === "P2002"
  );
}

async function balanceOf(db: Db, orgId: string, karigarId: string) {
  const sum = await db.ledgerEntry.aggregate({
    where: { orgId, karigarId },
    _sum: { fineMg: true },
  });
  return sum._sum.fineMg ?? 0;
}

export async function issueGold(db: Db, d: IssueInput) {
  const { orgId } = d;

  const existing = await db.ledgerEntry.findUnique({
    where: { idempotencyKey: d.idempotencyKey },
    include: { job: true },
  });
  if (existing) {
    return {
      entry: {
        id: existing.id,
        slipNo: existing.slipNo,
        jobNumber: existing.job.jobNumber,
        grossMg: existing.grossMg,
        purityH: existing.purityH,
        fineMg: existing.fineMg,
      },
      balanceMg: await balanceOf(db, orgId, existing.karigarId),
      replayed: true,
    };
  }

  const [karigar, category] = await Promise.all([
    db.karigar.findFirst({ where: { id: d.karigarId, orgId } }),
    db.itemCategory.findFirst({ where: { id: d.categoryId, orgId } }),
  ]);
  if (!karigar) throw new HttpError(404, "Karigar not found");
  if (!karigar.active) throw new HttpError(400, "Karigar is inactive");
  if (!category) throw new HttpError(404, "Category not found");

  const fine = fineMg(d.grossMg, d.purityH);

  try {
    const entry = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;
      const rows = await tx.$queryRaw<{ n: number }[]>`
        SELECT COALESCE(MAX(CAST(SUBSTRING(slip_no FROM 4) AS INT)), 30410) AS n
        FROM ledger_entries
        WHERE org_id = ${orgId}::uuid AND slip_no ~ '^TX-[0-9]+$'`;
      const slipNo = `TX-${Number(rows[0].n) + 1}`;

      const job = await tx.job.create({
        data: {
          orgId,
          jobNumber: d.jobNumber,
          karigarId: d.karigarId,
          categoryId: d.categoryId,
          issuedFineMg: fine,
        },
      });
      return tx.ledgerEntry.create({
        data: {
          orgId,
          karigarId: d.karigarId,
          jobId: job.id,
          entryType: "issue",
          grossMg: d.grossMg,
          purityH: d.purityH,
          fineMg: fine,
          slipNo,
          idempotencyKey: d.idempotencyKey,
          createdBy: d.userId,
        },
      });
    });
    return {
      entry: {
        id: entry.id,
        slipNo: entry.slipNo,
        jobNumber: d.jobNumber,
        grossMg: entry.grossMg,
        purityH: entry.purityH,
        fineMg: entry.fineMg,
      },
      balanceMg: await balanceOf(db, orgId, d.karigarId),
      replayed: false,
    };
  } catch (e) {
    if (isUniqueViolation(e))
      throw new HttpError(409, "Job number already exists");
    throw e;
  }
}
