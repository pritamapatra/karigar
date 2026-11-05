import { getPrisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/authz";

export async function GET() {
  try {
    const { orgId } = await requireRole("clerk", "finance", "partner");
    const prisma = await getPrisma();
    const categories = await prisma.itemCategory.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return Response.json({ categories });
  } catch (e) {
    return errorResponse(e);
  }
}
