import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "./db";
import { getStock } from "./stock-query";

const db = createDb(process.env.DIRECT_URL);
const userId = randomUUID();
let orgId = "";
let karigarId = "";
let idleKarigarId = "";

async function createFixture() {
  const suffix = randomUUID().slice(0, 8);

  const org = await db.organization.create({
    data: {
      name: `it-stock-${suffix}`,
      openingVaultMg: 500000,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  });

  const karigar = await db.karigar.create({
    data: {
      orgId: org.id,
      name: `Stock ${suffix}`,
      code: `S-${suffix}`,
      active: false,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  });

  const idle = await db.karigar.create({
    data: {
      orgId: org.id,
      name: `Idle ${suffix}`,
      code: `I-${suffix}`,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  });

  const category = await db.itemCategory.create({
    data: { orgId: org.id, name: "Stock category" },
  });

  const job = await db.job.create({
    data: {
      orgId: org.id,
      karigarId: karigar.id,
      categoryId: category.id,
      jobNumber: `STOCK-${suffix}`,
      issuedFineMg: 100000,
      openedAt: new Date("2020-01-01T01:00:00.000Z"),
      status: "closed",
      closedAt: new Date("2020-01-04T18:30:00.000Z"),
      closedAllowedMg: 3000,
      closedActualMg: 10000,
    },
  });

  const common = {
    orgId: org.id,
    karigarId: karigar.id,
    jobId: job.id,
    purityH: 10000,
    createdBy: userId,
  };

  await db.ledgerEntry.create({
    data: {
      ...common,
      entryType: "issue",
      grossMg: 100000,
      fineMg: 100000,
      slipNo: "TX-1",
      idempotencyKey: randomUUID(),
      createdAt: new Date("2020-01-01T01:00:00.000Z"),
    },
  });

  const receipt = await db.ledgerEntry.create({
    data: {
      ...common,
      entryType: "receipt_scrap",
      grossMg: 60000,
      fineMg: -60000,
      slipNo: "TX-2",
      idempotencyKey: randomUUID(),
      createdAt: new Date("2020-01-01T02:00:00.000Z"),
    },
  });

  await db.ledgerEntry.create({
    data: {
      ...common,
      entryType: "correction",
      grossMg: 60000,
      fineMg: 60000,
      reversesEntryId: receipt.id,
      reason: "Integration test reversal",
      slipNo: "TX-3",
      idempotencyKey: randomUUID(),
      createdAt: new Date("2020-01-02T18:30:00.000Z"),
    },
  });

  await db.ledgerEntry.create({
    data: {
      ...common,
      entryType: "receipt_piece",
      grossMg: 90000,
      fineMg: -90000,
      huid: "ABC123",
      slipNo: "TX-4",
      idempotencyKey: randomUUID(),
      createdAt: new Date("2020-01-03T10:00:00.000Z"),
    },
  });

  return {
    orgId: org.id,
    karigarId: karigar.id,
    idleKarigarId: idle.id,
  };
}

beforeAll(async () => {
  const fixture = await createFixture();
  orgId = fixture.orgId;
  karigarId = fixture.karigarId;
  idleKarigarId = fixture.idleKarigarId;

  // Identical movements in another organization must not affect this one.
  await createFixture();
}, 60000);

afterAll(async () => {
  await db.$disconnect();
});

describe("stock query", () => {
  test.each([
    {
      asOn: "2020-01-01",
      inHouseStockMg: 460000,
      karigarStockMg: 40000,
      closedWastageMg: 0,
      totalStockMg: 500000,
    },
    {
      asOn: "2020-01-02",
      inHouseStockMg: 460000,
      karigarStockMg: 40000,
      closedWastageMg: 0,
      totalStockMg: 500000,
    },
    {
      asOn: "2020-01-03",
      inHouseStockMg: 490000,
      karigarStockMg: 10000,
      closedWastageMg: 0,
      totalStockMg: 500000,
    },
    {
      asOn: "2020-01-04",
      inHouseStockMg: 490000,
      karigarStockMg: 10000,
      closedWastageMg: 0,
      totalStockMg: 500000,
    },
    {
      asOn: "2020-01-05",
      inHouseStockMg: 490000,
      karigarStockMg: 0,
      closedWastageMg: 10000,
      totalStockMg: 490000,
    },
  ])("reports historical stock for $asOn", async (expected) => {
    const result = await getStock(db, {
      orgId,
      asOn: expected.asOn,
    });

    expect(result).toMatchObject({
      ...expected,
      timezone: "Asia/Kolkata",
      openingVaultMg: 500000,
    });

    expect(result.karigars).toHaveLength(2);
    expect(result.karigars.find((row) => row.id === karigarId)).toMatchObject({
      stockMg: expected.karigarStockMg,
    });
    expect(
      result.karigars.find((row) => row.id === idleKarigarId),
    ).toMatchObject({
      stockMg: 0,
    });

    expect(
      result.inHouseStockMg + result.karigarStockMg + result.closedWastageMg,
    ).toBe(result.openingVaultMg);
  });

  test("reports opening stock before the first job", async () => {
    const result = await getStock(db, {
      orgId,
      asOn: "2019-12-31",
    });

    expect(result).toMatchObject({
      inHouseStockMg: 500000,
      karigarStockMg: 0,
      closedWastageMg: 0,
      totalStockMg: 500000,
      karigars: [],
    });
  });

  test("rejects an invalid calendar date", async () => {
    await expect(
      getStock(db, { orgId, asOn: "2020-02-30" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("rejects an unknown organization", async () => {
    await expect(
      getStock(db, {
        orgId: randomUUID(),
        asOn: "2020-01-05",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
