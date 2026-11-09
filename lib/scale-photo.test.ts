import { describe, expect, test, vi } from "vitest";
import type { createDb } from "./db";
import { createPhotoUpload, type StorageClient } from "./scale-photo";

type Db = ReturnType<typeof createDb>;

function setup(error: { message: string } | null = null) {
  const createSignedUploadUrl = vi.fn().mockResolvedValue(
    error
      ? { data: null, error }
      : {
          data: { signedUrl: "https://example.test/upload", token: "tok" },
          error: null,
        },
  );
  const from = vi.fn(() => ({ createSignedUploadUrl }));
  const create = vi.fn().mockResolvedValue({});
  return {
    from,
    create,
    createSignedUploadUrl,
    storage: { storage: { from } } as unknown as StorageClient,
    db: { scalePhoto: { create } } as unknown as Db,
  };
}

describe("createPhotoUpload", () => {
  test("signs an organization-scoped path and records the photo", async () => {
    const { db, storage, from, create, createSignedUploadUrl } = setup();

    const result = await createPhotoUpload(db, storage, {
      orgId: "org-1",
      userId: "user-1",
      contentType: "image/jpeg",
      sizeBytes: 1000,
    });

    expect(result.path).toMatch(/^org-1\/[0-9a-f-]{36}\.jpg$/);
    expect(result).toMatchObject({ token: "tok" });
    expect(from).toHaveBeenCalledExactlyOnceWith("scale-photos");
    expect(createSignedUploadUrl).toHaveBeenCalledExactlyOnceWith(result.path);
    expect(create).toHaveBeenCalledExactlyOnceWith({
      data: {
        id: result.photoId,
        storagePath: result.path,
        uploadedBy: "user-1",
      },
    });
  });

  test("uses the extension for the content type", async () => {
    const { db, storage } = setup();
    const result = await createPhotoUpload(db, storage, {
      orgId: "org-1",
      userId: "user-1",
      contentType: "image/webp",
      sizeBytes: 1000,
    });
    expect(result.path.endsWith(".webp")).toBe(true);
  });

  test("does not record a photo when signing fails", async () => {
    const { db, storage, create } = setup({ message: "denied" });
    await expect(
      createPhotoUpload(db, storage, {
        orgId: "org-1",
        userId: "user-1",
        contentType: "image/png",
        sizeBytes: 1000,
      }),
    ).rejects.toThrow("Could not create a signed upload URL: denied");
    expect(create).not.toHaveBeenCalled();
  });
});
