import { describe, expect, test, vi } from "vitest";
import { ensureScalePhotoBucket } from "./storage-bucket";
import type { createAdminClient } from "./supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const expected = {
  public: false,
  fileSizeLimit: 5 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
};

function fakeClient(exists: boolean, error: { message: string } | null = null) {
  const storage = {
    getBucket: vi
      .fn()
      .mockResolvedValue(
        exists
          ? { data: { id: "scale-photos" }, error: null }
          : { data: null, error: { message: "not found" } },
      ),
    createBucket: vi.fn().mockResolvedValue({ data: {}, error }),
    updateBucket: vi.fn().mockResolvedValue({ data: {}, error }),
  };
  return { storage, client: { storage } as unknown as AdminClient };
}

describe("ensureScalePhotoBucket", () => {
  test("creates a private limited bucket when missing", async () => {
    const { storage, client } = fakeClient(false);
    await ensureScalePhotoBucket(client);
    expect(storage.createBucket).toHaveBeenCalledExactlyOnceWith(
      "scale-photos",
      expected,
    );
    expect(storage.updateBucket).not.toHaveBeenCalled();
  });

  test("re-applies the settings when the bucket already exists", async () => {
    const { storage, client } = fakeClient(true);
    await ensureScalePhotoBucket(client);
    expect(storage.updateBucket).toHaveBeenCalledExactlyOnceWith(
      "scale-photos",
      expected,
    );
    expect(storage.createBucket).not.toHaveBeenCalled();
  });

  test("throws when Supabase rejects the change", async () => {
    const { client } = fakeClient(false, { message: "denied" });
    await expect(ensureScalePhotoBucket(client)).rejects.toThrow(
      "Could not configure the scale-photos bucket: denied",
    );
  });
});
