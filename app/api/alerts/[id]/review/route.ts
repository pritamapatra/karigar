import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId } = await requireRole("finance");
    const { id } = await ctx.params;
    const parsed = z.uuid().safeParse(id);

    if (!parsed.success) {
      throw new HttpError(400, "Invalid alert ID");
    }

    const db = await getPrisma();
    const result = await db.alert.updateMany({
      where: { id: parsed.data, orgId },
      data: { status: "reviewed" },
    });

    if (result.count === 0) {
      throw new HttpError(404, "Alert not found");
    }

    return Response.json(
      { id: parsed.data, status: "reviewed" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
