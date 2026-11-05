import { getPrisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { fineMg } from "@/lib/gold";
import { issueSchema } from "@/lib/schemas/issue";

function isUniqueViolation(e: unknown) {
  return (
    typeof e === "object" && e !== null && "code" in e && e.code === "P2002"
  );
}

export async function POST(req: Request) {
  try {
    const { orgId, userId } = await requireRole("clerk", "finance");
    const parsed = issueSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0].message);
    const d = parsed.data;
    const prisma = await getPrisma();

    const balanceOf = async (karigarId: string) => {
      const sum = await prisma.ledgerEntry.aggregate({
        where: { orgId, karigarId },
        _sum: { fineMg: true },
      });
      return sum._sum.fineMg ?? 0;
    };

    const existing = await prisma.ledgerEntry.findUnique({
      where: { idempotencyKey: d.idempotencyKey },
      include: { job: true },
    });
    if (existing) {
      return Response.json({
        entry: {
          id: existing.id,
          slipNo: existing.slipNo,
          jobNumber: existing.job.jobNumber,
          grossMg: existing.grossMg,
          purityH: existing.purityH,
          fineMg: existing.fineMg,
        },
        balanceMg: await balanceOf(existing.karigarId),
        replayed: true,
      });
    }

    const [karigar, category] = await Promise.all([
      prisma.karigar.findFirst({ where: { id: d.karigarId, orgId } }),
      prisma.itemCategory.findFirst({ where: { id: d.categoryId, orgId } }),
    ]);
    if (!karigar) throw new HttpError(404, "Karigar not found");
    if (!karigar.active) throw new HttpError(400, "Karigar is inactive");
    if (!category) throw new HttpError(404, "Category not found");

    const fine = fineMg(d.grossMg, d.purityH);

    try {
      const entry = await prisma.$transaction(async (tx) => {
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
            createdBy: userId,
          },
        });
      });

      return Response.json(
        {
          entry: {
            id: entry.id,
            slipNo: entry.slipNo,
            jobNumber: d.jobNumber,
            grossMg: entry.grossMg,
            purityH: entry.purityH,
            fineMg: entry.fineMg,
          },
          balanceMg: await balanceOf(d.karigarId),
          replayed: false,
        },
        { status: 201 },
      );
    } catch (e) {
      if (isUniqueViolation(e))
        throw new HttpError(409, "Job number already exists");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
