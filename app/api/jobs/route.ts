import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/authz";
import { allowedWastageMg } from "@/lib/gold";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { orgId } = await requireRole("clerk", "finance");
    const prisma = await getPrisma();

    const jobs = await prisma.job.findMany({
      where: { orgId, status: "open" },
      orderBy: { openedAt: "desc" },
      include: {
        karigar: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true } },
      },
    });

    if (jobs.length === 0) return Response.json({ jobs: [] });

    const [sums, rules] = await Promise.all([
      prisma.ledgerEntry.groupBy({
        by: ["jobId"],
        where: { orgId, jobId: { in: jobs.map((job) => job.id) } },
        _sum: { fineMg: true },
      }),
      prisma.karigarWastage.findMany({
        where: {
          OR: jobs.map((job) => ({
            karigarId: job.karigarId,
            categoryId: job.categoryId,
          })),
        },
      }),
    ]);

    const balances = new Map(
      sums.map((row) => [row.jobId, row._sum.fineMg ?? 0]),
    );
    const allowances = new Map(
      rules.map((rule) => [
        `${rule.karigarId}:${rule.categoryId}`,
        rule.wastageBp,
      ]),
    );

    return Response.json({
      jobs: jobs.map((job) => {
        const wastageBp = allowances.get(`${job.karigarId}:${job.categoryId}`);
        return {
          id: job.id,
          jobNumber: job.jobNumber,
          karigar: job.karigar,
          category: job.category,
          issuedFineMg: job.issuedFineMg,
          balanceMg: balances.get(job.id) ?? 0,
          wastageBp: wastageBp ?? null,
          allowedMg:
            wastageBp === undefined
              ? null
              : allowedWastageMg(wastageBp, job.issuedFineMg),
        };
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
