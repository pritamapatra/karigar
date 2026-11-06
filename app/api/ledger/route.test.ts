import { beforeEach, describe, expect, test, vi } from "vitest";
import { HttpError } from "@/lib/authz";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getPrisma: vi.fn(),
  getLedger: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/prisma", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/ledger-query", () => ({ getLedger: mocks.getLedger }));

const orgId = "11111111-1111-4111-8111-111111111111";
const karigarId = "22222222-2222-4222-8222-222222222222";
const db = {};
const result = {
  karigar: { id: karigarId, name: "Test Karigar", code: "K-TEST" },
  asOn: "2026-11-06",
  timezone: "Asia/Kolkata",
  entries: [],
  balanceMg: 0,
};

function request(query: string) {
  return new Request(`http://localhost/api/ledger?${query}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ orgId, role: "finance" });
  mocks.getPrisma.mockReturnValue(db);
  mocks.getLedger.mockResolvedValue(result);
});

describe("GET /api/ledger", () => {
  test("allows core read roles and uses the authenticated organization", async () => {
    const response = await GET(
      request(`karigarId=${karigarId}&asOn=2026-11-06&orgId=untrusted`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...result, canCorrect: true });
    expect(mocks.requireRole).toHaveBeenCalledWith(
      "clerk",
      "finance",
      "partner",
    );
    expect(mocks.getLedger).toHaveBeenCalledExactlyOnceWith(db, {
      orgId,
      karigarId,
      asOn: "2026-11-06",
    });
  });

  test.each([
    ["clerk", true],
    ["finance", true],
    ["partner", false],
  ] as const)("derives canCorrect for %s", async (role, canCorrect) => {
    mocks.requireRole.mockResolvedValue({ orgId, role });
    const response = await GET(
      request(`karigarId=${karigarId}&asOn=2026-11-06&canCorrect=true`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...result, canCorrect });
  });

  test.each([401, 403] as const)(
    "returns %i from authorization without querying the ledger",
    async (status) => {
      mocks.requireRole.mockRejectedValue(new HttpError(status, "No access"));
      const response = await GET(
        request(`karigarId=${karigarId}&asOn=2026-11-06`),
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "No access" });
      expect(mocks.getLedger).not.toHaveBeenCalled();
    },
  );

  test.each([
    "asOn=2026-11-06",
    "karigarId=not-a-uuid&asOn=2026-11-06",
    `karigarId=${karigarId}`,
    `karigarId=${karigarId}&asOn=`,
    `karigarId=${karigarId}&asOn=2026-11-6`,
  ])("rejects malformed query %s", async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(mocks.getLedger).not.toHaveBeenCalled();
  });

  test.each([400, 404] as const)(
    "preserves query service error %i",
    async (status) => {
      mocks.getLedger.mockRejectedValue(
        new HttpError(status, "Query rejected"),
      );
      const response = await GET(
        request(`karigarId=${karigarId}&asOn=2026-11-06`),
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "Query rejected" });
    },
  );
});
