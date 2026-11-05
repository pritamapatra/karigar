import { getPrisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { createKarigarSchema } from "@/lib/schemas/karigar";

export async function GET() {
  try {
    const { orgId, role } = await requireRole("clerk", "finance", "partner");
    const prisma = await getPrisma();
    const rows = await prisma.karigar.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
      include: { wastage: true },
    });
    const sums = await prisma.ledgerEntry.groupBy({
      by: ["karigarId"],
      where: { orgId },
      _sum: { fineMg: true },
    });
    const balances = new Map(
      sums.map((x) => [x.karigarId, x._sum.fineMg ?? 0]),
    );
    const karigars = rows.map((k) => ({
      ...k,
      balanceMg: balances.get(k.id) ?? 0,
    }));
    return Response.json({ karigars, canEdit: role !== "partner" });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { orgId } = await requireRole("clerk", "finance");
    const parsed = createKarigarSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0].message);
    const { name, code, wastage } = parsed.data;
    const prisma = await getPrisma();
    try {
      const row = await prisma.karigar.create({
        data: { orgId, name, code, wastage: { create: wastage } },
        include: { wastage: true },
      });
      return Response.json({ karigar: row }, { status: 201 });
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        e.code === "P2002"
      )
        throw new HttpError(409, "Code already in use");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
