import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "./db";
import { issueGold } from "./issue";

const db = createDb(process.env.DIRECT_URL);
const run = randomUUID().slice(0, 8);
const userId = randomUUID();

let orgId = "";
let karigarId = "";
let categoryId = "";

const base = () => ({
  orgId,
  userId,
  karigarId,
  categoryId,
  grossMg: 120000,
  purityH: 9160,
});

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { name: `it-issue-${run}` } }))
    .id;
  karigarId = (
    await db.karigar.create({
      data: { orgId, name: `Test ${run}`, code: `I-${run}` },
    })
  ).id;
  categoryId = (
    await db.itemCategory.create({ data: { orgId, name: "Chain" } })
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("issueGold", () => {
  const key = randomUUID();

  test("issues the sample: 120.000 g at 91.60 gives 109920 mg and slip TX-30411", async () => {
    const r = await issueGold(db, {
      ...base(),
      jobNumber: `J-${run}`,
      idempotencyKey: key,
    });
    expect(r.replayed).toBe(false);
    expect(r.entry.fineMg).toBe(109920);
    expect(r.entry.slipNo).toBe("TX-30411");
    expect(r.balanceMg).toBe(109920);
  });

  test("I6 the same idempotency key creates one entry only", async () => {
    const r = await issueGold(db, {
      ...base(),
      jobNumber: `J-${run}`,
      idempotencyKey: key,
    });
    expect(r.replayed).toBe(true);
    expect(r.entry.slipNo).toBe("TX-30411");
    const count = await db.ledgerEntry.count({
      where: { idempotencyKey: key },
    });
    expect(count).toBe(1);
    expect(r.balanceMg).toBe(109920);
  });

  test("a duplicate job number with a new key is rejected with 409", async () => {
    await expect(
      issueGold(db, {
        ...base(),
        jobNumber: `J-${run}`,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    const count = await db.ledgerEntry.count({ where: { orgId } });
    expect(count).toBe(1);
  });

  test("the next issue gets the next slip number", async () => {
    const r = await issueGold(db, {
      ...base(),
      grossMg: 1000,
      jobNumber: `K-${run}`,
      idempotencyKey: randomUUID(),
    });
    expect(r.entry.slipNo).toBe("TX-30412");
  });
});
