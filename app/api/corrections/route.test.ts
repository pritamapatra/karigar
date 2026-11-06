import { beforeEach, describe, expect, test, vi } from "vitest";
import { HttpError } from "@/lib/authz";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getPrisma: vi.fn(),
  correctReceipt: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/prisma", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/correction", () => ({ correctReceipt: mocks.correctReceipt }));

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const valid = {
  entryId: "33333333-3333-4333-8333-333333333333",
  reason: "Wrong receipt weight",
  idempotencyKey: "44444444-4444-4444-8444-444444444444",
};
const db = {};
const result = {
  entry: { id: "correction-id", fineMg: 3023 },
  jobBalanceMg: 109920,
  balanceMg: 109920,
  replayed: false,
};

function request(body: unknown) {
  return new Request("http://localhost/api/corrections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ orgId, userId, role: "finance" });
  mocks.getPrisma.mockReturnValue(db);
  mocks.correctReceipt.mockResolvedValue(result);
});

describe("POST /api/corrections", () => {
  test("returns 201 and passes normalized input with session-derived scope", async () => {
    const response = await POST(
      request({ ...valid, reason: "  Wrong receipt weight  " }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(result);
    expect(mocks.requireRole).toHaveBeenCalledExactlyOnceWith(
      "clerk",
      "finance",
    );
    expect(mocks.correctReceipt).toHaveBeenCalledExactlyOnceWith(db, {
      ...valid,
      orgId,
      userId,
    });
  });

  test("returns 200 for a matching replay", async () => {
    mocks.correctReceipt.mockResolvedValue({ ...result, replayed: true });
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...result, replayed: true });
  });

  test.each([401, 403] as const)(
    "authorization failure %i prevents service access",
    async (status) => {
      mocks.requireRole.mockRejectedValue(new HttpError(status, "No access"));
      const response = await POST(request(valid));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "No access" });
      expect(mocks.correctReceipt).not.toHaveBeenCalled();
    },
  );

  test.each([
    { ...valid, reason: undefined },
    { ...valid, reason: "  " },
    { ...valid, entryId: "invalid" },
    { ...valid, idempotencyKey: "invalid" },
    { ...valid, fineMg: 3023 },
    { ...valid, orgId },
    { ...valid, userId },
  ])("rejects invalid or untrusted body %j", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mocks.correctReceipt).not.toHaveBeenCalled();
  });

  test("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.correctReceipt).not.toHaveBeenCalled();
  });

  test.each([404, 409] as const)(
    "preserves service error %i",
    async (status) => {
      mocks.correctReceipt.mockRejectedValue(new HttpError(status, "Rejected"));
      const response = await POST(request(valid));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "Rejected" });
    },
  );
});
