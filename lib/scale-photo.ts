import { randomUUID } from "node:crypto";
import type { createDb } from "./db";
import {
  photoPath,
  SCALE_PHOTO_BUCKET,
  type PhotoUploadInput,
} from "./schemas/scale-photo";
import type { createAdminClient } from "./supabase/admin";

type Db = ReturnType<typeof createDb>;
export type StorageClient = ReturnType<typeof createAdminClient>;
type Input = PhotoUploadInput & { orgId: string; userId: string };

export async function createPhotoUpload(
  db: Db,
  storage: StorageClient,
  { orgId, userId, contentType }: Input,
) {
  const photoId = randomUUID();
  const path = photoPath(orgId, contentType, photoId);

  const { data, error } = await storage.storage
    .from(SCALE_PHOTO_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(
      `Could not create a signed upload URL: ${error?.message ?? "no data"}`,
    );
  }

  await db.scalePhoto.create({
    data: { id: photoId, storagePath: path, uploadedBy: userId },
  });

  return {
    photoId,
    path,
    token: data.token,
    signedUrl: data.signedUrl,
  };
}
