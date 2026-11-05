import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "./db";

const db = createDb(process.env.DIRECT_URL);
const run = randomUUID().slice(0, 8);

let orgId = "";
let karigarId = "";
let categoryId = "";
let jobId = "";
let entryId = "";
const entryKey = randomUUID();

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `it-${run}` } });
  orgId = org.id;
  const karigar = await db.karigar.create({
    data: { orgId, name: `Test ${run}`, code: `T-${run}` },
  });
  karigarId = karigar.id;
  const category = await db.itemCategory.create({
    data: { orgId, name: "Chain" },
  });
  categoryId = category.id;
  const job = await db.job.create({
    data: {
      orgId,
      jobNumber: `J-${run}`,
      karigarId,
      categoryId,
      issuedFineMg: 109920,
    },
  });
  jobId = job.id;
  const entry = await db.ledgerEntry.create({
    data: {
      orgId,
      karigarId,
      jobId,
      entryType: "issue",
      grossMg: 120000,
      purityH: 9160,
      fineMg: 109920,
      slipNo: `S-${run}-1`,
      idempotencyKey: entryKey,
      createdBy: randomUUID(),
    },
  });
  entryId = entry.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("ledger integrity", () => {
  test("I1 UPDATE on a ledger entry is rejected", async () => {
    await expect(
      db.ledgerEntry.update({ where: { id: entryId }, data: { fineMg: 1 } }),
    ).rejects.toThrow();
    const row = await db.ledgerEntry.findUnique({ where: { id: entryId } });
    expect(row?.fineMg).toBe(109920);
  });

  test("I2 DELETE on a ledger entry is rejected", async () => {
    await expect(
      db.ledgerEntry.delete({ where: { id: entryId } }),
    ).rejects.toThrow();
    const row = await db.ledgerEntry.findUnique({ where: { id: entryId } });
    expect(row).not.toBeNull();
  });

  test("I5 duplicate idempotency key is rejected", async () => {
    await expect(
      db.ledgerEntry.create({
        data: {
          orgId,
          karigarId,
          jobId,
          entryType: "issue",
          grossMg: 1000,
          purityH: 9160,
          fineMg: 916,
          slipNo: `S-${run}-2`,
          idempotencyKey: entryKey,
          createdBy: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });

  test("I5 duplicate job number in the same organisation is rejected", async () => {
    await expect(
      db.job.create({
        data: {
          orgId,
          jobNumber: `J-${run}`,
          karigarId,
          categoryId,
          issuedFineMg: 1000,
        },
      }),
    ).rejects.toThrow();
  });
});
