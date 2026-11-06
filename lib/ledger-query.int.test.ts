import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "./db";
import { getLedger } from "./ledger-query";

const db = createDb(process.env.DIRECT_URL);
const run = randomUUID();
let orgId = "";
let karigarId = "";
let boundaryKarigarId = "";
let foreignOrgId = "";
let foreignKarigarId = "";

async function fixture(organizationId: string, label: string) {
  const karigar = await db.karigar.create({
    data: {
      orgId: organizationId,
      name: label,
      code: randomUUID(),
    },
  });
  const category = await db.itemCategory.create({
    data: { orgId: organizationId, name: randomUUID() },
  });
  const job = await db.job.create({
    data: {
      orgId: organizationId,
      karigarId: karigar.id,
      categoryId: category.id,
      jobNumber: randomUUID(),
      issuedFineMg: 109920,
    },
  });
  return { orgId: organizationId, karigarId: karigar.id, jobId: job.id };
}

async function entry(
  scope: { orgId: string; karigarId: string; jobId: string },
  createdAt: string,
  fineMg: number,
  grossMg: number,
) {
  return db.ledgerEntry.create({
    data: {
      ...scope,
      entryType: fineMg > 0 ? "issue" : "receipt_scrap",
      grossMg,
      purityH: 9160,
      fineMg,
      slipNo: randomUUID(),
      idempotencyKey: randomUUID(),
      createdBy: randomUUID(),
      createdAt: new Date(createdAt),
    },
  });
}

beforeAll(async () => {
  orgId = (
    await db.organization.create({ data: { name: `ledger-query-${run}` } })
  ).id;
  const historical = await fixture(orgId, "Historical");
  karigarId = historical.karigarId;
  await entry(historical, "2026-11-04T06:00:00.000Z", 109920, 120000);
  await entry(historical, "2026-11-05T06:00:00.000Z", -103004, 112450);
  await entry(historical, "2026-11-06T06:00:00.000Z", -3023, 3300);

  const boundary = await fixture(orgId, "Boundary");
  boundaryKarigarId = boundary.karigarId;
  await entry(boundary, "2026-11-06T18:29:59.999Z", 916, 1000);
  await entry(boundary, "2026-11-06T18:30:00.000Z", -916, 1000);

  foreignOrgId = (
    await db.organization.create({ data: { name: `foreign-${run}` } })
  ).id;
  const foreign = await fixture(foreignOrgId, "Foreign");
  foreignKarigarId = foreign.karigarId;
  await entry(foreign, "2026-11-04T06:00:00.000Z", 916, 1000);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("as-on ledger query", () => {
  test("I15 historical balances ignore later receipts", async () => {
    const first = await getLedger(db, {
      orgId,
      karigarId,
      asOn: "2026-11-04",
    });
    expect(first.balanceMg).toBe(109920);
    expect(first.entries.map((row) => row.balanceMg)).toEqual([109920]);

    const second = await getLedger(db, {
      orgId,
      karigarId,
      asOn: "2026-11-05",
    });
    expect(second.balanceMg).toBe(6916);
    expect(second.entries.map((row) => row.fineMg)).toEqual([109920, -103004]);
    expect(second.entries.map((row) => row.balanceMg)).toEqual([109920, 6916]);

    const third = await getLedger(db, {
      orgId,
      karigarId,
      asOn: "2026-11-06",
    });
    expect(third.balanceMg).toBe(3893);
    expect(third.entries.map((row) => row.balanceMg)).toEqual([
      109920, 6916, 3893,
    ]);
  });

  test("I16 uses exclusive next IST midnight and isolates ledger scope", async () => {
    const result = await getLedger(db, {
      orgId,
      karigarId: boundaryKarigarId,
      asOn: "2026-11-06",
    });
    expect(result.balanceMg).toBe(916);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].createdAt).toEqual(
      new Date("2026-11-06T18:29:59.999Z"),
    );

    const nextDay = await getLedger(db, {
      orgId,
      karigarId: boundaryKarigarId,
      asOn: "2026-11-07",
    });
    expect(nextDay.balanceMg).toBe(0);
    expect(nextDay.entries).toHaveLength(2);

    await expect(
      getLedger(db, {
        orgId,
        karigarId: foreignKarigarId,
        asOn: "2026-11-06",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("history before the first entry is empty with zero balance", async () => {
    const result = await getLedger(db, {
      orgId,
      karigarId,
      asOn: "2026-11-03",
    });
    expect(result.entries).toEqual([]);
    expect(result.balanceMg).toBe(0);
  });

  test("unknown karigar returns 404", async () => {
    await expect(
      getLedger(db, { orgId, karigarId: randomUUID(), asOn: "2026-11-06" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test.each(["2026-02-30", "2026-13-01", "2026-11-6", "not-a-date", ""])(
    "invalid as-on date %j returns 400",
    async (asOn) => {
      await expect(
        getLedger(db, { orgId, karigarId, asOn }),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
});
