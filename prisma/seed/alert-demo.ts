import { randomUUID } from "node:crypto";
import { closeJob } from "../../lib/close-job";
import { issueGold } from "../../lib/issue";
import { receiveGold } from "../../lib/receipt";
import type { PrismaClient } from "../../lib/generated/prisma/client";
import { ORG_ID } from "./org";

export async function seedAlertDemo(db: PrismaClient) {
  const code = "K-047";
  const karigar = await db.karigar.upsert({
    where: { orgId_code: { orgId: ORG_ID, code } },
    update: {},
    create: {
      orgId: ORG_ID,
      code,
      name: "Alert Demo Karigar",
    },
  });
  const category = await db.itemCategory.findFirstOrThrow({
    where: { orgId: ORG_ID, name: "Necklace" },
  });
  const clerk = await db.profile.findFirstOrThrow({
    where: { orgId: ORG_ID, role: "clerk" },
  });
  await db.karigarWastage.upsert({
    where: {
      karigarId_categoryId: {
        karigarId: karigar.id,
        categoryId: category.id,
      },
    },
    update: {},
    create: {
      karigarId: karigar.id,
      categoryId: category.id,
      wastageBp: 300,
    },
  });

  for (let index = 1; index <= 4; index++) {
    const jobNumber = `ALERT-DEMO-${index}`;
    let job = await db.job.findUnique({
      where: { orgId_jobNumber: { orgId: ORG_ID, jobNumber } },
    });

    if (!job) {
      await issueGold(db, {
        orgId: ORG_ID,
        userId: clerk.id,
        karigarId: karigar.id,
        categoryId: category.id,
        jobNumber,
        grossMg: 100000,
        purityH: 10000,
        idempotencyKey: randomUUID(),
      });
      job = await db.job.findUniqueOrThrow({
        where: { orgId_jobNumber: { orgId: ORG_ID, jobNumber } },
      });
    }

    if (job.karigarId !== karigar.id || job.categoryId !== category.id) {
      throw new Error(`Unexpected owner or category for ${jobNumber}`);
    }

    if (job.status === "closed") {
      if (job.closedAllowedMg === null || job.closedActualMg === null) {
        throw new Error(`Missing closure snapshots for ${jobNumber}`);
      }
      continue;
    }

    await receiveGold(db, {
      orgId: ORG_ID,
      userId: clerk.id,
      jobId: job.id,
      entryType: "receipt_scrap",
      grossMg: index === 4 ? 95500 : 96000,
      purityH: 10000,
      idempotencyKey: `seed-alert-demo-receipt-${job.id}`,
    });
    await closeJob(db, { orgId: ORG_ID, jobId: job.id });
  }

  const latest = await db.job.findUniqueOrThrow({
    where: {
      orgId_jobNumber: { orgId: ORG_ID, jobNumber: "ALERT-DEMO-4" },
    },
  });
  const alerts = await db.alert.findMany({
    where: { orgId: ORG_ID, jobId: latest.id },
  });
  const drift = alerts.filter((alert) => alert.kind === "drift");
  if (
    drift.length !== 1 ||
    drift[0].baselineBp !== 100 ||
    drift[0].actualBp !== 150 ||
    alerts.length !== 2
  ) {
    throw new Error(
      "Alert demo did not produce the expected latest-job alerts",
    );
  }

  console.log(
    `${code}: latest job has one drift alert (100 → 150 bp) and one over-allowance alert`,
  );
}
