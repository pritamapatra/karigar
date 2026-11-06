import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "./db";
import { issueGold } from "./issue";
import { receiveGold } from "./receipt";

const db = createDb(process.env.DIRECT_URL);
const run = randomUUID().slice(0, 8);
const userId = randomUUID();
let orgId = "";
let karigarId = "";
let jobId = "";

beforeAll(async () => {
  orgId = (
    await db.organization.create({ data: { name: `it-receipt-${run}` } })
  ).id;
  karigarId = (
    await db.karigar.create({
      data: { orgId, name: `Receipt ${run}`, code: `R-${run}` },
    })
  ).id;
  const category = await db.itemCategory.create({
    data: { orgId, name: "Necklace" },
  });
  const issued = await issueGold(db, {
    orgId,
    userId,
    karigarId,
    categoryId: category.id,
    jobNumber: `R-${run}`,
    grossMg: 120000,
    purityH: 9160,
    idempotencyKey: randomUUID(),
  });
  const entry = await db.ledgerEntry.findUniqueOrThrow({
    where: { id: issued.entry.id },
  });
  jobId = entry.jobId;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("receipt transaction", () => {
  test("sample receipts, replay safety and I7 negative-balance rejection", async () => {
    const common = { orgId, userId, jobId, purityH: 9160 };
    const pieceRequest = {
      ...common,
      entryType: "receipt_piece" as const,
      netMg: 112450,
      huid: "ABC123",
      idempotencyKey: randomUUID(),
    };

    const piece = await receiveGold(db, pieceRequest);
    expect(piece.replayed).toBe(false);
    expect(piece.entry.fineMg).toBe(-103004);
    expect(piece.entry.huid).toBe("ABC123");
    expect(piece.jobBalanceMg).toBe(6916);
    expect(piece.balanceMg).toBe(6916);

    const replay = await receiveGold(db, pieceRequest);
    expect(replay.replayed).toBe(true);
    expect(replay.entry.id).toBe(piece.entry.id);
    expect(replay.balanceMg).toBe(6916);
    expect(
      await db.ledgerEntry.count({
        where: { idempotencyKey: pieceRequest.idempotencyKey },
      }),
    ).toBe(1);

    await expect(
      receiveGold(db, {
        ...pieceRequest,
        netMg: 1000,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const scrap = await receiveGold(db, {
      ...common,
      entryType: "receipt_scrap",
      grossMg: 3300,
      idempotencyKey: randomUUID(),
    });
    expect(scrap.entry.fineMg).toBe(-3023);
    expect(scrap.jobBalanceMg).toBe(3893);
    expect(scrap.balanceMg).toBe(3893);

    const before = await db.ledgerEntry.count({ where: { orgId } });
    await expect(
      receiveGold(db, {
        ...common,
        entryType: "receipt_filings",
        grossMg: 5000,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db.ledgerEntry.count({ where: { orgId } })).toBe(before);

    const sum = await db.ledgerEntry.aggregate({
      where: { orgId, jobId },
      _sum: { fineMg: true },
    });
    expect(sum._sum.fineMg).toBe(3893);

    const filings = await receiveGold(db, {
      ...common,
      entryType: "receipt_filings",
      grossMg: 1000,
      idempotencyKey: randomUUID(),
    });
    expect(filings.entry.fineMg).toBe(-916);
    expect(filings.jobBalanceMg).toBe(2977);
    expect(filings.balanceMg).toBe(2977);
  });
});
