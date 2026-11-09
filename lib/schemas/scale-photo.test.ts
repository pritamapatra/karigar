import { describe, expect, test } from "vitest";
import { MAX_PHOTO_BYTES, photoPath, photoUploadSchema } from "./scale-photo";

describe("scale photo upload schema", () => {
  test.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts %s",
    (contentType) => {
      expect(
        photoUploadSchema.safeParse({ contentType, sizeBytes: 1000 }).success,
      ).toBe(true);
    },
  );

  test.each(["image/gif", "image/heic", "application/pdf", "", undefined])(
    "rejects content type %s",
    (contentType) => {
      expect(
        photoUploadSchema.safeParse({ contentType, sizeBytes: 1000 }).success,
      ).toBe(false);
    },
  );

  test("accepts exactly the size limit and rejects one byte over", () => {
    const base = { contentType: "image/jpeg" };
    expect(
      photoUploadSchema.safeParse({ ...base, sizeBytes: MAX_PHOTO_BYTES })
        .success,
    ).toBe(true);
    expect(
      photoUploadSchema.safeParse({
        ...base,
        sizeBytes: MAX_PHOTO_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  test.each([0, -1, 1.5, Number.NaN, "1000", undefined])(
    "rejects size %s",
    (sizeBytes) => {
      expect(
        photoUploadSchema.safeParse({ contentType: "image/png", sizeBytes })
          .success,
      ).toBe(false);
    },
  );

  test("builds a server-controlled path under the organization", () => {
    expect(photoPath("org-1", "image/webp", "photo-1")).toBe(
      "org-1/photo-1.webp",
    );
  });
});
