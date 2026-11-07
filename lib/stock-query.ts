import { exclusiveCutoff } from "./as-on";
import { HttpError } from "./authz";
import type { createDb } from "./db";

type StockInput = {
  orgId: string;
  asOn: string;
};

export async function getStock(
  db: ReturnType<typeof createDb>,
  { orgId, asOn }: StockInput,
) {
  const cutoff = exclusiveCutoff(asOn);

  return db.$transaction(
    async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: orgId },
        select: { id: true, openingVaultMg: true },
      });

      if (!org) throw new HttpError(404, "Organization not found");

      const karigars = await tx.karigar.findMany({
        where: {
          orgId,
          createdAt: { lt: cutoff },
        },
        orderBy: [{ code: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          code: true,
        },
      });

      const jobs = await tx.job.findMany({
        where: {
          orgId,
          openedAt: { lt: cutoff },
        },
        select: {
          id: true,
          karigarId: true,
          closedAt: true,
        },
      });

      const sums = await tx.ledgerEntry.groupBy({
        by: ["jobId"],
        where: {
          orgId,
          createdAt: { lt: cutoff },
        },
        _sum: { fineMg: true },
      });

      const balances = new Map(
        sums.map((row) => [row.jobId, row._sum.fineMg ?? 0]),
      );

      const heldByKarigar = new Map<string, number>();
      let closedWastageMg = 0;

      for (const job of jobs) {
        const balanceMg = balances.get(job.id) ?? 0;
        const closedAsOn =
          job.closedAt !== null && job.closedAt.getTime() < cutoff.getTime();

        if (closedAsOn) {
          closedWastageMg += balanceMg;
        } else {
          heldByKarigar.set(
            job.karigarId,
            (heldByKarigar.get(job.karigarId) ?? 0) + balanceMg,
          );
        }
      }

      const ledgerBalanceMg = sums.reduce(
        (total, row) => total + (row._sum.fineMg ?? 0),
        0,
      );

      const karigarStockMg = [...heldByKarigar.values()].reduce(
        (total, balanceMg) => total + balanceMg,
        0,
      );

      const inHouseStockMg = org.openingVaultMg - ledgerBalanceMg;

      return {
        asOn,
        timezone: "Asia/Kolkata",
        openingVaultMg: org.openingVaultMg,
        inHouseStockMg,
        karigarStockMg,
        closedWastageMg,
        totalStockMg: inHouseStockMg + karigarStockMg,
        karigars: karigars.map((karigar) => ({
          ...karigar,
          stockMg: heldByKarigar.get(karigar.id) ?? 0,
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
