import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "./db";
import { readPhoto } from "./read-photo";
import { createPhotoUpload } from "./scale-photo";
import { SCALE_PHOTO_BUCKET } from "./schemas/scale-photo";
import { ensureScalePhotoBucket } from "./storage-bucket";
import { createAdminClient } from "./supabase/admin";

const db = createDb(process.env.DIRECT_URL);
const admin = createAdminClient();
const orgId = randomUUID();
const userId = randomUUID();
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const good = JSON.stringify({
  kind: "scale",
  weight_g: 112.45,
  purity_pct: 91.6,
  confidence: "high",
  notes: null,
});

const photoIds: string[] = [];
const paths: string[] = [];

async function slot(upload: boolean) {
  const created = await createPhotoUpload(db, admin, {
    orgId,
    userId,
    contentType: "image/png",
    sizeBytes: PNG.length,
  });
  photoIds.push(created.photoId);
  paths.push(created.path);
  if (upload) {
    const { error } = await admin.storage
      .from(SCALE_PHOTO_BUCKET)
      .upload(created.path, PNG, { contentType: "image/png", upsert: true });
    expect(error).toBeNull();
  }
  return created.photoId;
}

beforeAll(async () => {
  await ensureScalePhotoBucket(admin);
});

afterAll(async () => {
  await db.aiReading.deleteMany({ where: { photoId: { in: photoIds } } });
  await db.scalePhoto.deleteMany({ where: { id: { in: photoIds } } });
  if (paths.length) await admin.storage.from(SCALE_PHOTO_BUCKET).remove(paths);
  await db.$disconnect();
});

describe("readPhoto against the real database and storage", () => {
  test("stores a pending reading in integer units", async () => {
    const photoId = await slot(true);
    const result = await readPhoto(
      db,
      admin,
      { orgId, userId, photoId },
      { call: async () => good },
    );
    expect(result.ok).toBe(true);
    const row = await db.aiReading.findFirstOrThrow({ where: { photoId } });
    expect(row).toMatchObject({
      kind: "scale",
      weightMg: 112450,
      purityH: 9160,
      confidence: "high",
      status: "pending",
    });
  });

  test("stores a failed read as rejected", async () => {
    const photoId = await slot(true);
    const result = await readPhoto(
      db,
      admin,
      { orgId, userId, photoId },
      { call: async () => "not json" },
    );
    expect(result).toMatchObject({ ok: false, reason: "malformed" });
    const row = await db.aiReading.findFirstOrThrow({ where: { photoId } });
    expect(row).toMatchObject({ status: "rejected", confidence: "unreadable" });
  });

  test("another organization gets 404 and no row is written", async () => {
    const photoId = await slot(true);
    await expect(
      readPhoto(
        db,
        admin,
        { orgId: randomUUID(), userId, photoId },
        { call: async () => good },
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(await db.aiReading.count({ where: { photoId } })).toBe(0);
  });

  test("a photo that was never uploaded gets 409", async () => {
    const photoId = await slot(false);
    await expect(
      readPhoto(
        db,
        admin,
        { orgId, userId, photoId },
        { call: async () => good },
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
