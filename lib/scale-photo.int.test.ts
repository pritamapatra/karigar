import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "./db";
import { createPhotoUpload } from "./scale-photo";
import { MAX_PHOTO_BYTES, SCALE_PHOTO_BUCKET } from "./schemas/scale-photo";
import { ensureScalePhotoBucket } from "./storage-bucket";
import { createAdminClient } from "./supabase/admin";

const db = createDb(process.env.DIRECT_URL);
const admin = createAdminClient();
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const userId = randomUUID();
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let orgId = "";
const photoIds: string[] = [];
const paths: string[] = [];

async function slot() {
  const upload = await createPhotoUpload(db, admin, {
    orgId,
    userId,
    contentType: "image/png",
    sizeBytes: PNG.length,
  });
  photoIds.push(upload.photoId);
  paths.push(upload.path);
  return upload;
}

function send(
  upload: { path: string; token: string },
  body: Buffer,
  contentType: string,
) {
  return admin.storage
    .from(SCALE_PHOTO_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, body, { contentType });
}

beforeAll(async () => {
  await ensureScalePhotoBucket(admin);
  orgId = (
    await db.organization.create({
      data: { name: `it-photos-${randomUUID().slice(0, 8)}` },
    })
  ).id;
}, 60000);

afterAll(async () => {
  await admin.storage.from(SCALE_PHOTO_BUCKET).remove(paths);
  await db.scalePhoto.deleteMany({ where: { id: { in: photoIds } } });
  await db.organization.delete({ where: { id: orgId } });
  await db.$disconnect();
}, 60000);

describe("scale photo storage", () => {
  test("a signed upload stores an image under the organization prefix", async () => {
    const upload = await slot();
    const { data, error } = await send(upload, PNG, "image/png");

    expect(error).toBeNull();
    expect(data?.path).toBe(upload.path);
    expect(upload.path.startsWith(`${orgId}/`)).toBe(true);
    expect(
      await db.scalePhoto.findUniqueOrThrow({ where: { id: upload.photoId } }),
    ).toMatchObject({ storagePath: upload.path, uploadedBy: userId });
  });

  test("I14 public and anonymous access is denied while a signed read works", async () => {
    const upload = await slot();
    expect((await send(upload, PNG, "image/png")).error).toBeNull();

    const publicRead = await fetch(
      `${baseUrl}/storage/v1/object/public/${SCALE_PHOTO_BUCKET}/${upload.path}`,
    );
    expect(publicRead.ok).toBe(false);

    const anonymousRead = await fetch(
      `${baseUrl}/storage/v1/object/${SCALE_PHOTO_BUCKET}/${upload.path}`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
    );
    expect(anonymousRead.ok).toBe(false);

    const signed = await admin.storage
      .from(SCALE_PHOTO_BUCKET)
      .createSignedUrl(upload.path, 60);
    expect(signed.error).toBeNull();

    const signedRead = await fetch(signed.data?.signedUrl ?? "");
    expect(signedRead.status).toBe(200);
    expect(signedRead.headers.get("content-type")).toContain("image/png");
  });

  test("the bucket rejects a non-image upload", async () => {
    const upload = await slot();
    const { error } = await send(upload, Buffer.from("hello"), "text/plain");

    expect(error).not.toBeNull();
    const stored = await admin.storage
      .from(SCALE_PHOTO_BUCKET)
      .createSignedUrl(upload.path, 60);
    expect(stored.error).not.toBeNull();
  });

  test("the bucket rejects a file one byte over the limit", async () => {
    const upload = await slot();
    const { error } = await send(
      upload,
      Buffer.alloc(MAX_PHOTO_BYTES + 1),
      "image/png",
    );

    expect(error).not.toBeNull();
  }, 60000);
});
