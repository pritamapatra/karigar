import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { getPrisma } from "@/lib/prisma";
import { getStock } from "@/lib/stock-query";

export async function GET(req: Request) {
  try {
    const { orgId } = await requireRole("finance", "partner");

    const asOn = new URL(req.url).searchParams.get("asOn");
    if (!asOn) {
      throw new HttpError(400, "As-on date is required");
    }

    const prisma = await getPrisma();
    const stock = await getStock(prisma, { orgId, asOn });

    return Response.json(stock);
  } catch (e) {
    return errorResponse(e);
  }
}
