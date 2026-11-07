import { beforeEach, describe, expect, test, vi } from "vitest";
import { HttpError } from "@/lib/authz";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getPrisma: vi.fn(),
  getStock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/prisma", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/stock-query", () => ({ getStock: mocks.getStock }));

const orgId = "11111111-1111-4111-8111-111111111111";
const db = {};
const result = {
  asOn: "2026-11-06",
  timezone: "Asia/Kolkata",
  openingVaultMg: 500000,
  inHouseStockMg: 490000,
  karigarStockMg: 0,
  closedWastageMg: 10000,
  totalStockMg: 490000,
  karigars: [],
};

function request(query: string) {
  return new Request(`http://localhost/api/stock?${query}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ orgId, role: "finance" });
  mocks.getPrisma.mockReturnValue(db);
  mocks.getStock.mockResolvedValue(result);
});

describe("GET /api/stock", () => {
  test("uses the authenticated organization and ignores a supplied orgId", async () => {
    const response = await GET(request("asOn=2026-11-06&orgId=untrusted"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(mocks.requireRole).toHaveBeenCalledExactlyOnceWith(
      "finance",
      "partner",
    );
    expect(mocks.getPrisma).toHaveBeenCalledTimes(1);
    expect(mocks.getStock).toHaveBeenCalledExactlyOnceWith(db, {
      orgId,
      asOn: "2026-11-06",
    });
  });

  test.each(["finance", "partner"] as const)(
    "returns stock when authorization succeeds for %s",
    async (role) => {
      mocks.requireRole.mockResolvedValue({ orgId, role });

      const response = await GET(request("asOn=2026-11-06"));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(result);
    },
  );

  test.each([401, 403] as const)(
    "returns authorization error %i without accessing the database",
    async (status) => {
      mocks.requireRole.mockRejectedValue(new HttpError(status, "No access"));

      const response = await GET(request("asOn=2026-11-06"));

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "No access" });
      expect(mocks.getPrisma).not.toHaveBeenCalled();
      expect(mocks.getStock).not.toHaveBeenCalled();
    },
  );

  test.each(["", "asOn="])(
    "rejects a missing or empty date: %s",
    async (query) => {
      const response = await GET(request(query));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "As-on date is required",
      });
      expect(mocks.getPrisma).not.toHaveBeenCalled();
      expect(mocks.getStock).not.toHaveBeenCalled();
    },
  );

  test.each([400, 404] as const)(
    "preserves query service error %i",
    async (status) => {
      mocks.getStock.mockRejectedValue(new HttpError(status, "Query rejected"));

      const response = await GET(request("asOn=2026-11-06"));

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        error: "Query rejected",
      });
    },
  );

  test("passes a nonempty malformed date to the query for validation", async () => {
    mocks.getStock.mockRejectedValue(
      new HttpError(400, "As-on date must be a valid YYYY-MM-DD date"),
    );

    const response = await GET(request("asOn=2026-02-30"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "As-on date must be a valid YYYY-MM-DD date",
    });
    expect(mocks.getStock).toHaveBeenCalledExactlyOnceWith(db, {
      orgId,
      asOn: "2026-02-30",
    });
  });

  test("does not disguise unexpected failures as client errors", async () => {
    const error = new Error("Unexpected database failure");
    mocks.getStock.mockRejectedValue(error);

    await expect(GET(request("asOn=2026-11-06"))).rejects.toBe(error);
  });
});
