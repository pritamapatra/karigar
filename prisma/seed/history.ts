import { fineMg } from "../../lib/gold";
import type { PrismaClient } from "../../lib/generated/prisma/client";
import { CATEGORIES, ORG_ID } from "./org";

const PURITY_H = 9160;
const WASTAGE_BP = 300;
const BASE_ISSUE_MG = [200000, 150000, 300000, 250000, 180000, 220000];
const DAY_MS = 86_400_000;

const KARIGARS = [
  { code: "K-021", name: "Anand R", lossBp: [210, 190, 230, 200, 220, 205] },
  { code: "K-027", name: "Selvam P", lossBp: [180, 190, 175, 200, 185, 295] },
  { code: "K-033", name: "Karthik M", lossBp: [200, 215] },
  { code: "K-038", name: "Ramesh T", lossBp: [270, 285, 260, 290, 275, 340] },
];

function grossForFine(targetFineMg: number): number {
  return Math.ceil((targetFineMg * 10000) / PURITY_H);
}

function pct(bp: number): string {
  return `${Math.trunc(bp / 100)}.${String(bp % 100).padStart(2, "0")}%`;
}

export async function seedHistory(db: PrismaClient) {
  const categories = await db.itemCategory.findMany({
    where: { orgId: ORG_ID },
    orderBy: { name: "asc" },
  });
  const clerk = await db.profile.findFirstOrThrow({
    where: { orgId: ORG_ID, role: "clerk" },
  });
  const summary: Record<string, string | number>[] = [];

  for (const [k, def] of KARIGARS.entries()) {
    const karigar = await db.karigar.upsert({
      where: { orgId_code: { orgId: ORG_ID, code: def.code } },
      update: { name: def.name },
      create: { orgId: ORG_ID, code: def.code, name: def.name },
    });
    await db.karigarWastage.createMany({
      data: CATEGORIES.map((name) => ({
        karigarId: karigar.id,
        categoryId: categories.find((c) => c.name === name)!.id,
        wastageBp: WASTAGE_BP,
      })),
      skipDuplicates: true,
    });

    const entries: Parameters<typeof db.ledgerEntry.createMany>[0]["data"] = [];
    for (const [i, lossBp] of def.lossBp.entries()) {
      const n = i + 1;
      const opened = new Date(Date.UTC(2026, 4, 1, 4, 30) + i * 21 * DAY_MS);
      const closed = new Date(opened.getTime() + 10 * DAY_MS);
      const issueGross = BASE_ISSUE_MG[(i + k) % 6];
      const issuedFine = fineMg(issueGross, PURITY_H);
      const category = categories[(i + k) % categories.length];
      const job = await db.job.upsert({
        where: {
          orgId_jobNumber: {
            orgId: ORG_ID,
            jobNumber: `J-${def.code.slice(2)}-${n}`,
          },
        },
        update: {},
        create: {
          orgId: ORG_ID,
          jobNumber: `J-${def.code.slice(2)}-${n}`,
          karigarId: karigar.id,
          categoryId: category.id,
          issuedFineMg: issuedFine,
          status: "closed",
          openedAt: opened,
          closedAt: closed,
        },
      });

      const returnFine = issuedFine - Math.round((issuedFine * lossBp) / 10000);
      const piece = Math.floor((returnFine * 92) / 100);
      const scrap = Math.floor((returnFine * 5) / 100);
      const filings = returnFine - piece - scrap;
      const base = `${def.code.slice(2)}-${n}`;
      const common = {
        orgId: ORG_ID,
        karigarId: karigar.id,
        jobId: job.id,
        purityH: PURITY_H,
        createdBy: clerk.id,
      };
      const rows = [
        {
          slip: `SD-${base}-I`,
          type: "issue",
          gross: issueGross,
          sign: 1,
          at: opened,
          huid: null,
        },
        {
          slip: `SD-${base}-P`,
          type: "receipt_piece",
          gross: grossForFine(piece),
          sign: -1,
          at: closed,
          huid: `HU${def.code.slice(2)}${n}`,
        },
        {
          slip: `SD-${base}-S`,
          type: "receipt_scrap",
          gross: grossForFine(scrap),
          sign: -1,
          at: closed,
          huid: null,
        },
        {
          slip: `SD-${base}-F`,
          type: "receipt_filings",
          gross: grossForFine(filings),
          sign: -1,
          at: closed,
          huid: null,
        },
      ] as const;
      for (const r of rows) {
        entries.push({
          ...common,
          entryType: r.type,
          grossMg: r.gross,
          fineMg: r.sign * fineMg(r.gross, PURITY_H),
          huid: r.huid,
          slipNo: r.slip,
          idempotencyKey: `seed-${r.slip}`,
          createdAt: r.at,
        });
      }
    }
    await db.ledgerEntry.createMany({ data: entries, skipDuplicates: true });

    const jobs = await db.job.findMany({
      where: { karigarId: karigar.id, status: "closed" },
      orderBy: { openedAt: "asc" },
      include: { ledgerEntries: true },
    });
    const losses = jobs.map((j) => {
      const returned = j.ledgerEntries
        .filter((e) => e.fineMg < 0)
        .reduce((s, e) => s - e.fineMg, 0);
      return Math.round(((j.issuedFineMg - returned) * 10000) / j.issuedFineMg);
    });
    const prev = losses.slice(Math.max(0, losses.length - 6), -1);
    const baseline = prev.length
      ? Math.round(prev.reduce((a, b) => a + b, 0) / prev.length)
      : 0;
    summary.push({
      karigar: def.name,
      closedJobs: jobs.length,
      latestLoss: pct(losses[losses.length - 1]),
      baseline: pct(baseline),
    });
  }
  console.table(summary);
}
