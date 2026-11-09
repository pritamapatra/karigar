import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import { createDb } from "./db";
import { issueGold } from "./issue";
import { receiveGold } from "./receipt";

const db = createDb(process.env.DIRECT_URL);

afterAll(async () => {
  await db.$disconnect();
});

async function setup(status: "pending" | "rejected" = "pending") {
  const run = randomUUID().slice(0, 8);
  const userId = randomUUID();
  const org = await db.organization.create({
    data: { name: `it-receipt-ai-${run}` },
  });
  const karigar = await db.karigar.create({
    data: { orgId: org.id, name: `AI ${run}`, code: `AI-${run}` },
  });
  const category = await db.itemCategory.create({
    data: { orgId: org.id, name: "AI test" },
  });
  const issued = await issueGold(db, {
    orgId: org.id,
    userId,
    karigarId: karigar.id,
    categoryId: category.id,
    jobNumber: `AI-${run}`,
    grossMg: 120000,
    purityH: 9160,
    idempotencyKey: randomUUID(),
  });
  const issue = await db.ledgerEntry.findUniqueOrThrow({
    where: { id: issued.entry.id },
  });
  const photo = await db.scalePhoto.create({
    data: {
      storagePath: `${org.id}/${randomUUID()}.jpg`,
      uploadedBy: userId,
    },
  });
  const reading = await db.aiReading.create({
    data: {
      photoId: photo.id,
      kind: "scale",
      weightMg: status === "pending" ? 53000 : null,
      purityH: null,
      confidence: status === "pending" ? "high" : "unreadable",
      rawResponse: { test: true },
      status,
    },
  });

  return {
    reading,
    request: {
      orgId: org.id,
      userId,
      jobId: issue.jobId,
      entryType: "receipt_scrap" as const,
      grossMg: 53000,
      purityH: 9160,
      photoId: photo.id,
      aiReadingId: reading.id,
      idempotencyKey: randomUUID(),
    },
  };
}

describe("AI-linked receipt transaction", () => {
  test("links and confirms a matching reading; exact retry is safe", async () => {
    const { request, reading } = await setup();
    const first = await receiveGold(db, request);
    expect(first.entry).toMatchObject({
      photoId: request.photoId,
      aiReadingId: reading.id,
      reason: null,
    });
    expect(
      await db.aiReading.findUniqueOrThrow({ where: { id: reading.id } }),
    ).toMatchObject({
      status: "confirmed",
      confirmedBy: request.userId,
    });

    const replay = await receiveGold(db, request);
    expect(replay.replayed).toBe(true);
    expect(replay.entry.id).toBe(first.entry.id);

    await expect(
      receiveGold(db, { ...request, aiReadingId: undefined }),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      receiveGold(db, { ...request, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
  });

  test("a mismatch writes no receipt and leaves the reading pending", async () => {
    const { request, reading } = await setup();
    await expect(
      receiveGold(db, { ...request, grossMg: 54000 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await db.ledgerEntry.count({
        where: { idempotencyKey: request.idempotencyKey },
      }),
    ).toBe(0);
    expect(
      await db.aiReading.findUniqueOrThrow({ where: { id: reading.id } }),
    ).toMatchObject({ status: "pending", confirmedBy: null });
  });

  test("an override stores its reason and rejects changed-reason retries", async () => {
    const { request, reading } = await setup();
    const override = {
      ...request,
      grossMg: 54000,
      overrideReason: "Checked scale manually",
    };
    const result = await receiveGold(db, override);
    expect(result.entry.reason).toBe(override.overrideReason);
    expect(
      await db.aiReading.findUniqueOrThrow({ where: { id: reading.id } }),
    ).toMatchObject({
      status: "overridden",
      confirmedBy: request.userId,
    });
    expect((await receiveGold(db, override)).replayed).toBe(true);
    await expect(
      receiveGold(db, { ...override, overrideReason: "Different reason" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  test("rejects a photo from another organization", async () => {
    const { request } = await setup();
    const foreign = await db.scalePhoto.create({
      data: {
        storagePath: `${randomUUID()}/${randomUUID()}.jpg`,
        uploadedBy: request.userId,
      },
    });
    await expect(
      receiveGold(db, {
        ...request,
        photoId: foreign.id,
        aiReadingId: undefined,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await db.ledgerEntry.count({
        where: { idempotencyKey: request.idempotencyKey },
      }),
    ).toBe(0);
  });

  test("rejects a reading that belongs to a different photo", async () => {
    const { request } = await setup();
    const otherPhoto = await db.scalePhoto.create({
      data: {
        storagePath: `${request.orgId}/${randomUUID()}.jpg`,
        uploadedBy: request.userId,
      },
    });
    await expect(
      receiveGold(db, { ...request, photoId: otherPhoto.id }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("allows manual receipt entry linked to a rejected attempt", async () => {
    const { request, reading } = await setup("rejected");
    const result = await receiveGold(db, request);
    expect(result.entry.aiReadingId).toBe(reading.id);
    expect(
      await db.aiReading.findUniqueOrThrow({ where: { id: reading.id } }),
    ).toMatchObject({ status: "rejected", confirmedBy: null });
  });

  test("requires a photo when an AI reading is supplied", async () => {
    const { request } = await setup();
    await expect(
      receiveGold(db, { ...request, photoId: undefined }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
