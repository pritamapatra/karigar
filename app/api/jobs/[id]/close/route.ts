import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { closeJob } from "@/lib/close-job";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId } = await requireRole("clerk", "finance");
    const { id } = await ctx.params;
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) throw new HttpError(400, "Invalid job ID");

    const result = await closeJob(await getPrisma(), {
      orgId,
      jobId: parsed.data,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
