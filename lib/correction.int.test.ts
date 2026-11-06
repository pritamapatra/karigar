import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "./db";
import { correctReceipt } from "./correction";

const db = createDb(process.env.DIRECT_URL);
const userId = randomUUID();
let orgId = "";
let foreignOrgId = "";

beforeAll(async () => {
  orgId = (
    await db.organization.create({
      data: { name: `correction-${randomUUID()}` },
    })
  ).id;
  foreignOrgId = (
    await db.organization.create({ data: { name: `foreign-${randomUUID()}` } })
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
});

async function fixture(
  organizationId = orgId,
  entryType:
    "receipt_piece" | "receipt_scrap" | "receipt_filings" = "receipt_piece",
) {
  const karigar = await db.karigar.create({
    data: {
      orgId: organizationId,
      name: "Correction test",
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
  const common = {
    orgId: organizationId,
    karigarId: karigar.id,
    jobId: job.id,
    purityH: 9160,
    createdBy: userId,
  };
  const issue = await db.ledgerEntry.create({
    data: {
      ...common,
      entryType: "issue",
      grossMg: 120000,
      fineMg: 109920,
      slipNo: randomUUID(),
      idempotencyKey: randomUUID(),
    },
  });
  const receipt = await db.ledgerEntry.create({
    data: {
      ...common,
      entryType,
      grossMg: 3300,
      fineMg: -3023,
      huid: entryType === "receipt_piece" ? "TEST-HUID" : null,
      slipNo: randomUUID(),
      idempotencyKey: randomUUID(),
    },
  });
  return { job, issue, receipt };
}

function input(entryId: string) {
  return {
    orgId,
    userId,
    entryId,
    reason: "Wrong receipt weight",
    idempotencyKey: randomUUID(),
  };
}

describe("receipt correction transaction", () => {
  test.each(["receipt_piece", "receipt_scrap", "receipt_filings"] as const)(
    "I3 reverses %s exactly and preserves the original",
    async (type) => {
      const { receipt, job } = await fixture(orgId, type);
      const result = await correctReceipt(db, input(receipt.id));

      expect(result.replayed).toBe(false);
      expect(result.entry).toMatchObject({
        orgId,
        jobId: job.id,
        karigarId: receipt.karigarId,
        entryType: "correction",
        grossMg: receipt.grossMg,
        purityH: receipt.purityH,
        fineMg: 3023,
        huid: receipt.huid,
        reversesEntryId: receipt.id,
        reason: "Wrong receipt weight",
        createdBy: userId,
      });
      expect(result.entry.slipNo).toMatch(/^TX-[0-9]+$/);
      expect(result.entry.id).not.toBe(receipt.id);
      expect(result.jobBalanceMg).toBe(109920);
      expect(result.balanceMg).toBe(109920);
      expect(
        await db.ledgerEntry.findUniqueOrThrow({ where: { id: receipt.id } }),
      ).toEqual(receipt);
      expect(await db.ledgerEntry.count({ where: { jobId: job.id } })).toBe(3);
    },
  );

  test("matching replay succeeds after closure; changed reason conflicts", async () => {
    const { receipt, job } = await fixture();
    const request = input(receipt.id);
    const first = await correctReceipt(db, request);
    await db.job.update({
      where: { id: job.id },
      data: { status: "closed", closedAt: new Date() },
    });
    const replay = await correctReceipt(db, request);
    expect(replay.replayed).toBe(true);
    expect(replay.entry.id).toBe(first.entry.id);
    expect(replay.balanceMg).toBe(109920);
    await expect(
      correctReceipt(db, { ...request, reason: "Different reason" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await db.ledgerEntry.count({ where: { reversesEntryId: receipt.id } }),
    ).toBe(1);
  });

  test("rejects duplicate reversal and reversal of a correction", async () => {
    const { receipt } = await fixture();
    const first = await correctReceipt(db, input(receipt.id));
    await expect(correctReceipt(db, input(receipt.id))).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      correctReceipt(db, input(first.entry.id)),
    ).rejects.toMatchObject({ status: 409 });
  });

  test("rejects issue reversal and new correction on a closed job", async () => {
    const { issue, receipt, job } = await fixture();
    await expect(correctReceipt(db, input(issue.id))).rejects.toMatchObject({
      status: 409,
    });
    await db.job.update({
      where: { id: job.id },
      data: { status: "closed", closedAt: new Date() },
    });
    await expect(correctReceipt(db, input(receipt.id))).rejects.toMatchObject({
      status: 409,
    });
    expect(await db.ledgerEntry.count({ where: { jobId: job.id } })).toBe(2);
  });

  test("unknown and other-organization entries return 404", async () => {
    const foreign = await fixture(foreignOrgId);
    await expect(correctReceipt(db, input(randomUUID()))).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      correctReceipt(db, input(foreign.receipt.id)),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("a key belonging to another organization cannot be replayed", async () => {
    const foreign = await fixture(foreignOrgId);
    const local = await fixture();
    const key = randomUUID();
    await correctReceipt(db, {
      ...input(foreign.receipt.id),
      orgId: foreignOrgId,
      idempotencyKey: key,
    });
    await expect(
      correctReceipt(db, { ...input(local.receipt.id), idempotencyKey: key }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await db.ledgerEntry.count({
        where: { reversesEntryId: local.receipt.id },
      }),
    ).toBe(0);
  });

  test("concurrent matching requests append once", async () => {
    const { receipt } = await fixture();
    const request = input(receipt.id);
    const results = await Promise.all([
      correctReceipt(db, request),
      correctReceipt(db, request),
    ]);
    expect(results[0].entry.id).toBe(results[1].entry.id);
    expect(results.map((result) => result.replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(
      await db.ledgerEntry.count({ where: { reversesEntryId: receipt.id } }),
    ).toBe(1);
  });

  test("concurrent different keys cannot reverse the original twice", async () => {
    const { receipt } = await fixture();
    const results = await Promise.allSettled([
      correctReceipt(db, input(receipt.id)),
      correctReceipt(db, input(receipt.id)),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(
      rejected?.status === "rejected" ? rejected.reason : null,
    ).toMatchObject({ status: 409 });
    expect(
      await db.ledgerEntry.count({ where: { reversesEntryId: receipt.id } }),
    ).toBe(1);
  });
});
