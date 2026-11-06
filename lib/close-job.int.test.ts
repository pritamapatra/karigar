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

    const persistedJob = await db.job.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(persistedJob).toMatchObject({
      status: "closed",
      closedAllowedMg: 3298,
      closedActualMg: 3893,
    });

    const alertsBeforeRetry = await db.alert.findMany({
      where: { orgId, jobId },
      orderBy: { id: "asc" },
    });
    expect(alertsBeforeRetry).toHaveLength(1);
    expect(alertsBeforeRetry[0]).toMatchObject({
      orgId,
      karigarId,
      jobId,
      kind: "over_allowance",
      baselineBp: null,
      actualBp: 54,
      message: "Review: wastage on this job is above the agreed allowance",
      status: "new",
    });

    await expect(closeJob(db, { orgId, jobId })).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await db.alert.findMany({
        where: { orgId, jobId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(alertsBeforeRetry);

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

async function createHistoryCase(missingSnapshot: boolean) {
  const suffix = randomUUID().slice(0, 8);
  const org = await db.organization.create({
    data: { name: `it-alert-history-${suffix}` },
  });
  const karigar = await db.karigar.create({
    data: { orgId: org.id, name: `History ${suffix}`, code: `H-${suffix}` },
  });
  const category = await db.itemCategory.create({
    data: { orgId: org.id, name: "History category" },
  });
  await db.karigarWastage.create({
    data: {
      karigarId: karigar.id,
      categoryId: category.id,
      wastageBp: 300,
    },
  });

  // Closure snapshots are the history input; no historical ledger is needed
  // for this isolated test of the close-job alert query.
  await db.job.createMany({
    data: [0, 1, 2].map((index) => ({
      orgId: org.id,
      karigarId: karigar.id,
      categoryId: category.id,
      jobNumber: `PRIOR-${suffix}-${index}`,
      issuedFineMg: 100000,
      status: "closed" as const,
      openedAt: new Date(Date.UTC(2020, 0, index + 1)),
      closedAt: new Date(Date.UTC(2020, 1, index + 1)),
      closedAllowedMg: missingSnapshot && index === 1 ? null : 3000,
      closedActualMg: missingSnapshot && index === 1 ? null : 4000,
    })),
  });

  const issued = await issueGold(db, {
    orgId: org.id,
    userId,
    karigarId: karigar.id,
    categoryId: category.id,
    jobNumber: `LATEST-${suffix}`,
    grossMg: 100000,
    purityH: 10000,
    idempotencyKey: randomUUID(),
  });
  const entry = await db.ledgerEntry.findUniqueOrThrow({
    where: { id: issued.entry.id },
  });
  await receiveGold(db, {
    orgId: org.id,
    userId,
    jobId: entry.jobId,
    entryType: "receipt_scrap",
    grossMg: 95500,
    purityH: 10000,
    idempotencyKey: randomUUID(),
  });

  return {
    orgId: org.id,
    karigarId: karigar.id,
    jobId: entry.jobId,
  };
}

describe("close-job alert history", () => {
  test("stores drift at exactly +50% using prior closure snapshots", async () => {
    const fixture = await createHistoryCase(false);
    await closeJob(db, {
      orgId: fixture.orgId,
      jobId: fixture.jobId,
    });

    const alerts = await db.alert.findMany({
      where: { orgId: fixture.orgId, jobId: fixture.jobId },
    });
    expect(alerts).toHaveLength(2);
    expect(alerts.find((alert) => alert.kind === "drift")).toMatchObject({
      karigarId: fixture.karigarId,
      baselineBp: 100,
      actualBp: 150,
      status: "new",
    });
    expect(
      alerts.find((alert) => alert.kind === "over_allowance"),
    ).toMatchObject({
      baselineBp: 100,
      actualBp: 150,
      status: "new",
    });
  }, 60000);

  test("missing historical snapshot skips drift but keeps over-allowance", async () => {
    const fixture = await createHistoryCase(true);
    await closeJob(db, {
      orgId: fixture.orgId,
      jobId: fixture.jobId,
    });

    const alerts = await db.alert.findMany({
      where: { orgId: fixture.orgId, jobId: fixture.jobId },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "over_allowance",
      baselineBp: null,
      actualBp: 150,
    });
  }, 60000);
});

describe("concurrent close-job alerts", () => {
  test("concurrent closes persist one closure and one alert per kind", async () => {
    const fixture = await createHistoryCase(false);
    const input = {
      orgId: fixture.orgId,
      jobId: fixture.jobId,
    };

    const results = await Promise.allSettled([
      closeJob(db, input),
      closeJob(db, input),
    ]);

    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatchObject({ status: 409 });

    const job = await db.job.findUniqueOrThrow({
      where: { id: fixture.jobId },
    });
    expect(job).toMatchObject({
      status: "closed",
      closedAllowedMg: 3000,
      closedActualMg: 4500,
    });
    expect(job.closedAt).toBeInstanceOf(Date);

    const alerts = await db.alert.findMany({
      where: {
        orgId: fixture.orgId,
        jobId: fixture.jobId,
      },
    });
    expect(alerts).toHaveLength(2);
    expect(alerts.map((alert) => alert.kind).sort()).toEqual([
      "drift",
      "over_allowance",
    ]);
    for (const alert of alerts) {
      expect(alert).toMatchObject({
        baselineBp: 100,
        actualBp: 150,
        status: "new",
      });
    }
  }, 60000);
});
