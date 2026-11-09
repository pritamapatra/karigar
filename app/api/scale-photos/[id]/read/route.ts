import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { getPrisma } from "@/lib/prisma";
import { readPhoto } from "@/lib/read-photo";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireRole("clerk", "finance");
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      throw new HttpError(400, "Invalid photo id");
    }
    const result = await readPhoto(getPrisma(), createAdminClient(), {
      orgId,
      userId,
      photoId: id,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
