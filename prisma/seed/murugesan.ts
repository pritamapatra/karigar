import { balanceMg, fineMg, formatGrams } from "../../lib/gold";
import type { PrismaClient } from "../../lib/generated/prisma/client";
import { CATEGORIES, ORG_ID } from "./org";

const EXPECTED_BALANCE_MG = 3893;

export async function seedMurugesan(db: PrismaClient) {
  const karigar = await db.karigar.upsert({
    where: { orgId_code: { orgId: ORG_ID, code: "K-014" } },
    update: { name: "Murugesan S" },
    create: { orgId: ORG_ID, code: "K-014", name: "Murugesan S" },
  });

  const categories = await db.itemCategory.findMany({
    where: { orgId: ORG_ID },
  });
  for (const name of CATEGORIES) {
    const category = categories.find((c) => c.name === name);
    if (!category) throw new Error(`Missing category ${name}`);
    await db.karigarWastage.upsert({
      where: {
        karigarId_categoryId: {
          karigarId: karigar.id,
          categoryId: category.id,
        },
      },
      update: { wastageBp: 300 },
      create: {
        karigarId: karigar.id,
        categoryId: category.id,
        wastageBp: 300,
      },
    });
  }

  const necklace = categories.find((c) => c.name === "Necklace");
  if (!necklace) throw new Error("Missing category Necklace");
  const clerk = await db.profile.findFirstOrThrow({
    where: { orgId: ORG_ID, role: "clerk" },
  });

  const issuedFine = fineMg(120000, 9160);
  const job = await db.job.upsert({
    where: { orgId_jobNumber: { orgId: ORG_ID, jobNumber: "J-30411" } },
    update: {},
    create: {
      orgId: ORG_ID,
      jobNumber: "J-30411",
      karigarId: karigar.id,
      categoryId: necklace.id,
      issuedFineMg: issuedFine,
      openedAt: new Date("2026-10-28T10:00:00+05:30"),
    },
  });

  const entries = [
    {
      slip: "TX-30411",
      type: "issue",
      gross: 120000,
      sign: 1,
      at: "2026-10-28T10:00:00+05:30",
      huid: null,
    },
    {
      slip: "TX-30437",
      type: "receipt_piece",
      gross: 112450,
      sign: -1,
      at: "2026-11-02T15:30:00+05:30",
      huid: "A1B2C3",
    },
    {
      slip: "TX-30438",
      type: "receipt_scrap",
      gross: 3300,
      sign: -1,
      at: "2026-11-02T15:45:00+05:30",
      huid: null,
    },
  ] as const;

  for (const e of entries) {
    const key = `seed-${e.slip}`;
    const exists = await db.ledgerEntry.findUnique({
      where: { idempotencyKey: key },
    });
    if (exists) continue;
    await db.ledgerEntry.create({
      data: {
        orgId: ORG_ID,
        karigarId: karigar.id,
        jobId: job.id,
        entryType: e.type,
        grossMg: e.gross,
        purityH: 9160,
        fineMg: e.sign * fineMg(e.gross, 9160),
        huid: e.huid,
        slipNo: e.slip,
        idempotencyKey: key,
        createdBy: clerk.id,
        createdAt: new Date(e.at),
      },
    });
  }

  const rows = await db.ledgerEntry.findMany({
    where: { karigarId: karigar.id },
  });
  const balance = balanceMg(rows.map((r) => r.fineMg));
  if (balance !== EXPECTED_BALANCE_MG) {
    throw new Error(
      `Murugesan balance is ${balance} mg, expected ${EXPECTED_BALANCE_MG} mg`,
    );
  }
  console.log(
    `Murugesan S: ${rows.length} entries, balance ${formatGrams(balance)}`,
  );
}
