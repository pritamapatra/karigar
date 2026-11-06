import { HttpError } from "./authz";
import type { createDb } from "./db";

type LedgerInput = {
  orgId: string;
  karigarId: string;
  asOn: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

function exclusiveCutoff(asOn: string): Date {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(asOn)) {
    throw new HttpError(400, "As-on date must be a valid YYYY-MM-DD date");
  }

  const midnightUtc = new Date(`${asOn}T00:00:00.000Z`);
  if (
    !Number.isFinite(midnightUtc.getTime()) ||
    midnightUtc.toISOString().slice(0, 10) !== asOn
  ) {
    throw new HttpError(400, "As-on date must be a valid YYYY-MM-DD date");
  }

  return new Date(midnightUtc.getTime() + DAY_MS - IST_OFFSET_MS);
}

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
