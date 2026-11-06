import type { createDb } from "@/lib/db";
import { HttpError } from "@/lib/authz";
import { allowedWastageMg, unexplainedMg } from "@/lib/gold";

type Db = ReturnType<typeof createDb>;

export async function closeJob(
  db: Db,
  input: { orgId: string; jobId: string },
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.orgId}))`;

      const job = await tx.job.findFirst({
        where: { id: input.jobId, orgId: input.orgId },
      });
      if (!job) throw new HttpError(404, "Job not found");
      if (job.status !== "open")
        throw new HttpError(409, "Job is already closed");

      const rule = await tx.karigarWastage.findUnique({
        where: {
          karigarId_categoryId: {
            karigarId: job.karigarId,
            categoryId: job.categoryId,
          },
        },
      });
      if (!rule) {
        throw new HttpError(
          409,
          "Set the category wastage allowance before closing",
        );
      }

      const sum = await tx.ledgerEntry.aggregate({
        where: { orgId: input.orgId, jobId: job.id },
        _sum: { fineMg: true },
      });
      const actualMg = sum._sum.fineMg ?? 0;
      if (actualMg < 0) throw new HttpError(409, "Job balance needs review");

      const allowedMg = allowedWastageMg(rule.wastageBp, job.issuedFineMg);
      const unexplained = unexplainedMg(actualMg, allowedMg);
      const closed = await tx.job.update({
        where: { id: job.id },
        data: { status: "closed", closedAt: new Date() },
      });

      return {
        job: closed,
        wastage: {
          issuedFineMg: job.issuedFineMg,
          wastageBp: rule.wastageBp,
          allowedMg,
          actualMg,
          unexplainedMg: unexplained,
          overAllowance: actualMg > allowedMg,
        },
      };
    },
    { timeout: 20000 },
  );
}
