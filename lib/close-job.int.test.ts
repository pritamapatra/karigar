import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "./db";
import { issueGold } from "./issue";
import { receiveGold } from "./receipt";
import { closeJob } from "./close-job";

const db = createDb(process.env.DIRECT_URL);
const run = randomUUID().slice(0, 8);
const userId = randomUUID();
let orgId = "";
let jobId = "";
let karigarId = "";
let categoryId = "";

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { name: `it-close-${run}` } }))
    .id;
  karigarId = (
    await db.karigar.create({
      data: { orgId, name: `Close ${run}`, code: `C-${run}` },
    })
  ).id;
  categoryId = (
    await db.itemCategory.create({ data: { orgId, name: "Necklace" } })
  ).id;

  const issued = await issueGold(db, {
    orgId,
    userId,
    karigarId,
    categoryId,
    jobNumber: `C-${run}`,
    grossMg: 120000,
    purityH: 9160,
    idempotencyKey: randomUUID(),
  });
  jobId = (
    await db.ledgerEntry.findUniqueOrThrow({
      where: { id: issued.entry.id },
    })
  ).jobId;

  await receiveGold(db, {
    orgId,
    userId,
    jobId,
    entryType: "receipt_piece",
    netMg: 112450,
    purityH: 9160,
    huid: "ABC123",
    idempotencyKey: randomUUID(),
  });
  await receiveGold(db, {
    orgId,
    userId,
    jobId,
    entryType: "receipt_scrap",
    grossMg: 3300,
    purityH: 9160,
    idempotencyKey: randomUUID(),
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("job closing", () => {
  test("requires an allowance, computes 595 mg and blocks receipts after closing", async () => {
    await expect(closeJob(db, { orgId, jobId })).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (
        await db.job.findUniqueOrThrow({
          where: { id: jobId },
        })
      ).status,
    ).toBe("open");

    await db.karigarWastage.create({
      data: { karigarId, categoryId, wastageBp: 300 },
    });

    const before = await db.ledgerEntry.findMany({
      where: { orgId, jobId },
      orderBy: { id: "asc" },
    });
    const result = await closeJob(db, { orgId, jobId });

    expect(result.job.status).toBe("closed");
    expect(result.job.closedAt).toBeInstanceOf(Date);
    expect(result.wastage).toEqual({
      issuedFineMg: 109920,
      wastageBp: 300,
      allowedMg: 3298,
      actualMg: 3893,
      unexplainedMg: 595,
      overAllowance: true,
    });

    await expect(closeJob(db, { orgId, jobId })).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      receiveGold(db, {
        orgId,
        userId,
        jobId,
        entryType: "receipt_filings",
        grossMg: 1000,
        purityH: 9160,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Job is closed",
    });

    const after = await db.ledgerEntry.findMany({
      where: { orgId, jobId },
      orderBy: { id: "asc" },
    });
    expect(after).toEqual(before);
  }, 60000);
});
