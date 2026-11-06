import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { getLedger } from "@/lib/ledger-query";
import { getPrisma } from "@/lib/prisma";

const querySchema = z.object({
  karigarId: z.uuid(),
  asOn: z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  try {
    const { orgId } = await requireRole("clerk", "finance", "partner");
    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      karigarId: params.get("karigarId"),
      asOn: params.get("asOn"),
    });

    if (!parsed.success) {
      throw new HttpError(
        400,
        "Provide a valid karigarId and YYYY-MM-DD asOn date",
      );
    }

    const db = await getPrisma();
    const ledger = await getLedger(db, { orgId, ...parsed.data });
    return Response.json(ledger, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
