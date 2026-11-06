import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { getPrisma } from "@/lib/prisma";
import { receiveGold } from "@/lib/receipt";
import { receiptSchema } from "@/lib/schemas/receipt";

export async function POST(req: Request) {
  try {
    const { orgId, userId } = await requireRole("clerk", "finance");
    const parsed = receiptSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }

    const result = await receiveGold(await getPrisma(), {
      ...parsed.data,
      orgId,
      userId,
    });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
