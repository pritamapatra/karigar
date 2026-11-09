import { HttpError } from "./authz";
import { getAiConfig, readWithGemini, type AiImage } from "./ai-provider";
import { readScale } from "./ai-reading";
import type { PrismaClient } from "./generated/prisma/client";
import type { StorageClient } from "./scale-photo";
import { SCALE_PHOTO_BUCKET } from "./schemas/scale-photo";

export const READ_LIMIT_PER_MINUTE = 20;

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

type Input = { orgId: string; userId: string; photoId: string };
type Deps = {
  call?: (image: AiImage, signal: AbortSignal) => Promise<string>;
};

export async function readPhoto(
  db: PrismaClient,
  storage: StorageClient,
  { orgId, photoId }: Input,
  deps: Deps = {},
) {
  const photo = await db.scalePhoto.findUnique({ where: { id: photoId } });
  if (!photo || !photo.storagePath.startsWith(`${orgId}/`)) {
    throw new HttpError(404, "Photo not found");
  }

  const recent = await db.aiReading.count({
    where: {
      createdAt: { gte: new Date(Date.now() - 60_000) },
      photo: { storagePath: { startsWith: `${orgId}/` } },
    },
  });
  if (recent >= READ_LIMIT_PER_MINUTE) {
    throw new HttpError(429, "Too many readings. Try again in a minute");
  }

  const { data, error } = await storage.storage
    .from(SCALE_PHOTO_BUCKET)
    .download(photo.storagePath);
  if (error || !data) {
    throw new HttpError(409, "Photo has not been uploaded yet");
  }
  const image: AiImage = {
    bytes: new Uint8Array(await data.arrayBuffer()),
    contentType:
      CONTENT_TYPES[photo.storagePath.split(".").pop() ?? ""] ?? "image/jpeg",
  };

  const call =
    deps.call ??
    ((img: AiImage, signal: AbortSignal) =>
      readWithGemini(getAiConfig(), img, signal));

  let raw: string | null = null;
  const result = await readScale(async (signal) => {
    raw = await call(image, signal);
    return raw;
  });

  if (result.ok) {
    const { reading } = result;
    const row = await db.aiReading.create({
      data: {
        photoId,
        kind: reading.kind,
        weightMg: reading.weight.value,
        purityH: reading.purity.value,
        confidence: reading.confidence,
        rawResponse: { raw },
        status: "pending",
      },
    });
    return { ok: true as const, readingId: row.id, reading };
  }

  // kind is required by the schema; a failed read has none, so use "scale".
  const row = await db.aiReading.create({
    data: {
      photoId,
      kind: "scale",
      confidence: "unreadable",
      rawResponse: { error: result.reason, raw },
      status: "rejected",
    },
  });
  return { ok: false as const, readingId: row.id, reason: result.reason };
}
