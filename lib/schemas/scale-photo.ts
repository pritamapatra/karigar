import { z } from "zod";

export const SCALE_PHOTO_BUCKET = "scale-photos";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];

const EXTENSIONS: Record<PhotoContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const photoUploadSchema = z.object({
  contentType: z.enum(PHOTO_CONTENT_TYPES, {
    error: "Photo must be a JPEG, PNG or WebP image",
  }),
  sizeBytes: z
    .number({ error: "Photo size is required" })
    .int("Photo size must be a whole number of bytes")
    .positive("Photo cannot be empty")
    .max(MAX_PHOTO_BYTES, "Photo must be 5 MB or smaller"),
});

export type PhotoUploadInput = z.infer<typeof photoUploadSchema>;

export function photoPath(
  orgId: string,
  contentType: PhotoContentType,
  photoId: string,
) {
  return `${orgId}/${photoId}.${EXTENSIONS[contentType]}`;
}
