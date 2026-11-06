import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { correctReceipt } from "@/lib/correction";
import { getPrisma } from "@/lib/prisma";
import { correctionSchema } from "@/lib/schemas/correction";

export async function POST(request: Request) {
  try {
    const { orgId, userId } = await requireRole("clerk", "finance");
    const parsed = correctionSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }

    const result = await correctReceipt(await getPrisma(), {
      ...parsed.data,
      orgId,
      userId,
    });
    return Response.json(result, {
      status: result.replayed ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
