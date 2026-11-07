import { beforeEach, describe, expect, test, vi } from "vitest";
import { HttpError } from "@/lib/authz";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getPrisma: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/prisma", () => ({ getPrisma: mocks.getPrisma }));

const orgId = "11111111-1111-4111-8111-111111111111";
const karigarId = "22222222-2222-4222-8222-222222222222";
const db = {
  alert: {
    findMany: mocks.findMany,
    count: mocks.count,
  },
};

function request(query = "") {
  return new Request(`http://localhost/api/alerts?${query}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ orgId, role: "finance" });
  mocks.getPrisma.mockReturnValue(db);
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});

describe("GET /api/alerts", () => {
  test("uses finance/partner guard and authenticated organization", async () => {
    const response = await GET(request("orgId=untrusted&canReview=false"));

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledExactlyOnceWith(
      "finance",
      "partner",
    );
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 0,
        take: 25,
      }),
    );
    expect(mocks.count).toHaveBeenCalledExactlyOnceWith({
      where: { orgId },
    });
    expect(await response.json()).toEqual({
      alerts: [],
      page: 1,
      pageSize: 25,
      total: 0,
      canReview: true,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test.each([
    ["finance", true],
    ["partner", false],
  ] as const)("derives canReview for %s", async (role, canReview) => {
    mocks.requireRole.mockResolvedValue({ orgId, role });

    const response = await GET(request("canReview=true"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ canReview });
  });

  test.each([
    [401, "Sign in required"],
    [403, "Your role cannot do this"],
  ] as const)(
    "preserves authorization error %i before querying",
    async (status, message) => {
      mocks.requireRole.mockRejectedValue(new HttpError(status, message));

      const response = await GET(request("status=invalid"));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: message });
      expect(mocks.getPrisma).not.toHaveBeenCalled();
      expect(mocks.findMany).not.toHaveBeenCalled();
      expect(mocks.count).not.toHaveBeenCalled();
    },
  );

  test("applies filters and pagination to the authenticated organization", async () => {
    const response = await GET(
      request(
        `status=reviewed&kind=drift&karigarId=${karigarId}&page=3&pageSize=10`,
      ),
    );
    const where = {
      orgId,
      status: "reviewed",
      kind: "drift",
      karigarId,
    };

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 20, take: 10 }),
    );
    expect(mocks.count).toHaveBeenCalledExactlyOnceWith({ where });
    expect(await response.json()).toMatchObject({
      page: 3,
      pageSize: 10,
    });
  });

  test.each(["status=new", "kind=over_allowance"])(
    "accepts supported filter %s",
    async (query) => {
      expect((await GET(request(query))).status).toBe(200);
    },
  );

  test.each([
    "status=invalid",
    "status=",
    "kind=invalid",
    "kind=",
    "karigarId=invalid",
    "karigarId=",
    "page=0",
    "page=-1",
    "page=1.5",
    "page=10001",
    "page=abc",
    "page=",
    "pageSize=0",
    "pageSize=101",
    "pageSize=1.5",
    "pageSize=abc",
    "pageSize=",
  ])("rejects malformed query %s without database access", async (query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Provide valid alert filters and pagination",
    });
    expect(mocks.getPrisma).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  test("returns alert records and total from the database", async () => {
    const alerts = [
      {
        id: "33333333-3333-4333-8333-333333333333",
        kind: "drift",
        baselineBp: 100,
        actualBp: 150,
        message: "Review: loss is above this karigar's usual range",
        status: "new",
        createdAt: "2026-11-07T03:00:00.000Z",
        karigar: { id: karigarId, name: "Test Karigar", code: "K-TEST" },
        job: {
          id: "44444444-4444-4444-8444-444444444444",
          jobNumber: "TEST-1",
          closedAt: "2026-11-07T03:00:00.000Z",
        },
      },
    ];
    mocks.findMany.mockResolvedValue(alerts);
    mocks.count.mockResolvedValue(7);

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ alerts, total: 7 });
  });

  test("does not disguise unexpected database failures as success", async () => {
    const error = new Error("Database unavailable");
    mocks.findMany.mockRejectedValue(error);

    await expect(GET(request())).rejects.toBe(error);
  });
});
