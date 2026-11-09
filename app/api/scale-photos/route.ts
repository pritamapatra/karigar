import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { getPrisma } from "@/lib/prisma";
import { createPhotoUpload } from "@/lib/scale-photo";
import { photoUploadSchema } from "@/lib/schemas/scale-photo";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { orgId, userId } = await requireRole("clerk", "finance");

    const parsed = photoUploadSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }

    const upload = await createPhotoUpload(
      await getPrisma(),
      createAdminClient(),
      { ...parsed.data, orgId, userId },
    );

    return Response.json(upload, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
