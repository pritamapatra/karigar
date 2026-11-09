import { beforeEach, describe, expect, test, vi } from "vitest";
import { HttpError } from "@/lib/authz";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getPrisma: vi.fn(),
  createAdminClient: vi.fn(),
  createPhotoUpload: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/prisma", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/scale-photo", () => ({
  createPhotoUpload: mocks.createPhotoUpload,
}));

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";
const db = {};
const admin = {};
const upload = {
  photoId: "photo-1",
  path: `${orgId}/photo-1.jpg`,
  token: "tok",
  signedUrl: "https://example.test/upload",
};

function request(body: unknown) {
  return new Request("http://localhost/api/scale-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ orgId, userId, role: "clerk" });
  mocks.getPrisma.mockReturnValue(db);
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.createPhotoUpload.mockResolvedValue(upload);
});

describe("POST /api/scale-photos", () => {
  test("uses the authenticated identity and ignores a supplied orgId", async () => {
    const response = await POST(
      request({
        contentType: "image/jpeg",
        sizeBytes: 2048,
        orgId: "untrusted",
        userId: "untrusted",
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(upload);
    expect(mocks.requireRole).toHaveBeenCalledExactlyOnceWith(
      "clerk",
      "finance",
    );
    expect(mocks.createPhotoUpload).toHaveBeenCalledExactlyOnceWith(db, admin, {
      contentType: "image/jpeg",
      sizeBytes: 2048,
      orgId,
      userId,
    });
  });

  test.each([401, 403] as const)(
    "returns %i from authorization without touching storage",
    async (status) => {
      mocks.requireRole.mockRejectedValue(new HttpError(status, "No access"));

      const response = await POST(
        request({ contentType: "image/jpeg", sizeBytes: 2048 }),
      );

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "No access" });
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(mocks.createPhotoUpload).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["wrong type", { contentType: "image/gif", sizeBytes: 2048 }],
    ["too large", { contentType: "image/png", sizeBytes: 6 * 1024 * 1024 }],
    ["empty", { contentType: "image/png", sizeBytes: 0 }],
    ["missing fields", {}],
    ["not JSON", "not json"],
  ])("rejects a bad request: %s", async (_name, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createPhotoUpload).not.toHaveBeenCalled();
  });

  test("does not disguise storage failures as client errors", async () => {
    const error = new Error("Storage unavailable");
    mocks.createPhotoUpload.mockRejectedValue(error);

    await expect(
      POST(request({ contentType: "image/jpeg", sizeBytes: 2048 })),
    ).rejects.toBe(error);
  });
});
