import { getPrisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { updateKarigarSchema } from "@/lib/schemas/karigar";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { orgId } = await requireRole("clerk", "finance");
    const { id } = await ctx.params;
    const parsed = updateKarigarSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const { name, active, wastage } = parsed.data;
    const prisma = await getPrisma();

    const row = await prisma.$transaction(async (tx) => {
      const found = await tx.karigar.findFirst({ where: { id, orgId } });
      if (!found) throw new HttpError(404, "Karigar not found");
      if (wastage) {
        for (const w of wastage) {
          await tx.karigarWastage.upsert({
            where: { karigarId_categoryId: { karigarId: id, categoryId: w.categoryId } },
            update: { wastageBp: w.wastageBp },
            create: { karigarId: id, ...w },
          });
        }
      }
      return tx.karigar.update({
        where: { id },
        data: { name, active },
        include: { wastage: true },
      });
    });
    return Response.json({ karigar: row });
  } catch (e) {
    return errorResponse(e);
  }
}