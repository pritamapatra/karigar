import { beforeEach, describe, expect, test, vi } from "vitest";
import { HttpError } from "@/lib/authz";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getPrisma: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/prisma", () => ({ getPrisma: mocks.getPrisma }));

const orgId = "11111111-1111-4111-8111-111111111111";
const alertId = "33333333-3333-4333-8333-333333333333";
const db = { alert: { updateMany: mocks.updateMany } };

function context(id = alertId) {
  return { params: Promise.resolve({ id }) };
}

function request(body?: Record<string, unknown>) {
  return new Request(`http://localhost/api/alerts/${alertId}/review`, {
    method: "POST",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ orgId, role: "finance" });
  mocks.getPrisma.mockReturnValue(db);
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/alerts/[id]/review", () => {
  test("requires finance and updates only the authenticated organization", async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledExactlyOnceWith("finance");
    expect(mocks.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: alertId, orgId },
      data: { status: "reviewed" },
    });
    expect(await response.json()).toEqual({
      id: alertId,
      status: "reviewed",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("does not allow request data to override scope or update fields", async () => {
    const response = await POST(
      request({
        orgId: "untrusted",
        status: "new",
        message: "Changed",
        actualBp: 0,
        baselineBp: 0,
      }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: alertId, orgId },
      data: { status: "reviewed" },
    });
  });

  test.each([
    ["unauthenticated", 401],
    ["clerk", 403],
    ["partner", 403],
    ["karigar", 403],
  ] as const)(
    "preserves guard rejection for %s before database access",
    async (_role, status) => {
      mocks.requireRole.mockRejectedValue(new HttpError(status, "No access"));

      const response = await POST(request(), context("invalid"));

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "No access" });
      expect(mocks.requireRole).toHaveBeenCalledExactlyOnceWith("finance");
      expect(mocks.getPrisma).not.toHaveBeenCalled();
      expect(mocks.updateMany).not.toHaveBeenCalled();
    },
  );

  test.each(["invalid", "", "123"])(
    "rejects malformed alert ID %j before database access",
    async (id) => {
      const response = await POST(request(), context(id));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid alert ID" });
      expect(mocks.getPrisma).not.toHaveBeenCalled();
      expect(mocks.updateMany).not.toHaveBeenCalled();
    },
  );

  test("returns 404 when the organization-scoped update finds no alert", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Alert not found" });
    expect(mocks.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: alertId, orgId },
      data: { status: "reviewed" },
    });
  });

  test("allows repeated review without requiring the alert to be new", async () => {
    const first = await POST(request(), context());
    const second = await POST(request(), context());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);

    for (const [args] of mocks.updateMany.mock.calls) {
      expect(args).toEqual({
        where: { id: alertId, orgId },
        data: { status: "reviewed" },
      });
    }
  });

  test("does not disguise unexpected database failures as success", async () => {
    const error = new Error("Database unavailable");
    mocks.updateMany.mockRejectedValue(error);

    await expect(POST(request(), context())).rejects.toBe(error);
  });
});
