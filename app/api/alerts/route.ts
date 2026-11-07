import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/authz";
import { getPrisma } from "@/lib/prisma";

const querySchema = z.object({
  status: z.enum(["new", "reviewed"]).optional(),
  kind: z.enum(["drift", "over_allowance"]).optional(),
  karigarId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(request: Request) {
  try {
    const { orgId, role } = await requireRole("finance", "partner");
    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      status: params.get("status") ?? undefined,
      kind: params.get("kind") ?? undefined,
      karigarId: params.get("karigarId") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });

    if (!parsed.success) {
      throw new HttpError(400, "Provide valid alert filters and pagination");
    }

    const { status, kind, karigarId, page, pageSize } = parsed.data;
    const where = {
      orgId,
      ...(status !== undefined ? { status } : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(karigarId !== undefined ? { karigarId } : {}),
    };

    const db = await getPrisma();
    const [alerts, total] = await Promise.all([
      db.alert.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          kind: true,
          baselineBp: true,
          actualBp: true,
          message: true,
          status: true,
          createdAt: true,
          karigar: {
            select: { id: true, name: true, code: true },
          },
          job: {
            select: { id: true, jobNumber: true, closedAt: true },
          },
        },
      }),
      db.alert.count({ where }),
    ]);

    return Response.json(
      {
        alerts,
        page,
        pageSize,
        total,
        canReview: role === "finance",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
