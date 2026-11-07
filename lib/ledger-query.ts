import { exclusiveCutoff } from "./as-on";
import { HttpError } from "./authz";
import type { createDb } from "./db";

type LedgerInput = {
  orgId: string;
  karigarId: string;
  asOn: string;
};

export async function getLedger(
  db: ReturnType<typeof createDb>,
  { orgId, karigarId, asOn }: LedgerInput,
) {
  const cutoff = exclusiveCutoff(asOn);

  const karigar = await db.karigar.findFirst({
    where: { id: karigarId, orgId },
    select: { id: true, name: true, code: true },
  });

  if (!karigar) throw new HttpError(404, "Karigar not found");

  const rows = await db.ledgerEntry.findMany({
    where: {
      orgId,
      karigarId,
      createdAt: { lt: cutoff },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { job: { select: { status: true } } },
  });

  const reversals = new Map(
    rows
      .filter((row) => row.entryType === "correction" && row.reversesEntryId)
      .map((row) => [row.reversesEntryId, row.id]),
  );

  let balanceMg = 0;
  const entries = rows.map(({ job, ...row }) => {
    balanceMg += row.fineMg;
    return {
      ...row,
      balanceMg,
      jobStatus: job.status,
      reversalId: reversals.get(row.id) ?? null,
    };
  });

  return {
    karigar,
    asOn,
    timezone: "Asia/Kolkata",
    entries,
    balanceMg,
  };
}
