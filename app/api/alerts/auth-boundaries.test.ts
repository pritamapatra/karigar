import { beforeEach, describe, expect, test, vi } from "vitest";
import { authorize, type Role } from "@/lib/authz";
import { GET } from "./route";
import { POST } from "./[id]/review/route";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getPrisma: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/prisma", () => ({ getPrisma: mocks.getPrisma }));

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const alertId = "33333333-3333-4333-8333-333333333333";

function setSession(role: Role | null) {
  mocks.requireRole.mockImplementation((...allowed: Role[]) =>
    authorize(
      role === null ? null : userId,
      role === null
        ? null
        : {
            id: userId,
            orgId,
            role,
            karigarId: null,
            displayName: "Test User",
          },
      allowed,
    ),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getPrisma.mockReturnValue({
    alert: {
      findMany: mocks.findMany,
      count: mocks.count,
      updateMany: mocks.updateMany,
    },
  });
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("alerts API authorization boundaries", () => {
  test.each([
    ["finance", 200],
    ["partner", 200],
    ["clerk", 403],
    ["karigar", 403],
    [null, 401],
  ] as const)("GET with session %s returns %i", async (role, status) => {
    setSession(role);

    const response = await GET(new Request("http://localhost/api/alerts"));
    expect(response.status).toBe(status);

    if (status !== 200) {
      expect(mocks.getPrisma).not.toHaveBeenCalled();
      expect(mocks.findMany).not.toHaveBeenCalled();
      expect(mocks.count).not.toHaveBeenCalled();
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  test.each([
    ["finance", 200],
    ["partner", 403],
    ["clerk", 403],
    ["karigar", 403],
    [null, 401],
  ] as const)("review with session %s returns %i", async (role, status) => {
    setSession(role);

    const response = await POST(
      new Request(`http://localhost/api/alerts/${alertId}/review`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: alertId }) },
    );
    expect(response.status).toBe(status);

    if (status !== 200) {
      expect(mocks.getPrisma).not.toHaveBeenCalled();
      expect(mocks.updateMany).not.toHaveBeenCalled();
    } else {
      expect(mocks.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: { id: alertId, orgId },
        data: { status: "reviewed" },
      });
    }
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });
});
