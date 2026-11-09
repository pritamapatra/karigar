import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/authz";

export async function GET() {
  try {
    const { userId, orgId, role } = await requireRole(
      "clerk",
      "finance",
      "partner",
      "karigar",
    );
    return Response.json(
      { userId, orgId, role },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
