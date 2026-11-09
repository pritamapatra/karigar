import {
  MAX_PHOTO_BYTES,
  PHOTO_CONTENT_TYPES,
  SCALE_PHOTO_BUCKET,
} from "./schemas/scale-photo";
import type { createAdminClient } from "./supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function ensureScalePhotoBucket(client: AdminClient) {
  const options = {
    public: false,
    fileSizeLimit: MAX_PHOTO_BYTES,
    allowedMimeTypes: [...PHOTO_CONTENT_TYPES],
  };

  const existing = await client.storage.getBucket(SCALE_PHOTO_BUCKET);
  const result = existing.data
    ? await client.storage.updateBucket(SCALE_PHOTO_BUCKET, options)
    : await client.storage.createBucket(SCALE_PHOTO_BUCKET, options);

  if (result.error) {
    throw new Error(
      `Could not configure the ${SCALE_PHOTO_BUCKET} bucket: ${result.error.message}`,
    );
  }
}
