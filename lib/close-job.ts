import type { createDb } from "@/lib/db";
import { HttpError } from "@/lib/authz";
import { allowedWastageMg, unexplainedMg } from "@/lib/gold";
import { BASELINE_WINDOW, evaluateJobAlerts } from "@/lib/alerts";

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
      const priorJobs = await tx.job.findMany({
        where: {
          orgId: input.orgId,
          karigarId: job.karigarId,
          status: "closed",
          closedAt: { not: null },
          id: { not: job.id },
        },
        orderBy: [{ closedAt: "desc" }, { id: "desc" }],
        take: BASELINE_WINDOW,
        select: {
          id: true,
          issuedFineMg: true,
          closedAllowedMg: true,
          closedActualMg: true,
        },
      });

      const historyComplete = priorJobs.every(
        (prior) =>
          prior.closedAllowedMg !== null && prior.closedActualMg !== null,
      );
      const priorLosses = historyComplete
        ? [...priorJobs].reverse().map((prior) => ({
            jobId: prior.id,
            issuedFineMg: prior.issuedFineMg,
            allowedMg: prior.closedAllowedMg!,
            actualWastageMg: prior.closedActualMg!,
          }))
        : [];

      const candidates = evaluateJobAlerts(
        {
          jobId: job.id,
          issuedFineMg: job.issuedFineMg,
          allowedMg,
          actualWastageMg: actualMg,
        },
        priorLosses,
      );

      const closed = await tx.job.update({
        where: { id: job.id },
        data: {
          status: "closed",
          closedAt: new Date(),
          closedAllowedMg: allowedMg,
          closedActualMg: actualMg,
        },
      });

      if (candidates.length > 0) {
        await tx.alert.createMany({
          data: candidates.map((candidate) => ({
            orgId: input.orgId,
            karigarId: job.karigarId,
            jobId: job.id,
            kind: candidate.kind,
            baselineBp: candidate.baselineBp,
            actualBp: candidate.actualBp,
            message: candidate.message,
          })),
          skipDuplicates: true,
        });
      }

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
