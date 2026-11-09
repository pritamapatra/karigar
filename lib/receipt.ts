import type { createDb } from "@/lib/db";
import { HttpError } from "@/lib/authz";
import { fineMg } from "@/lib/gold";
import { checkReceiptAi } from "@/lib/receipt-ai";
import type { ReceiptInput } from "@/lib/schemas/receipt";

type Db = ReturnType<typeof createDb>;
type Input = ReceiptInput & { orgId: string; userId: string };

export async function receiveGold(db: Db, d: Input) {
  const weightMg = d.entryType === "receipt_piece" ? d.netMg : d.grossMg;
  const huid = d.entryType === "receipt_piece" ? d.huid : null;
  const photoId = d.photoId ?? null;
  const aiReadingId = d.aiReadingId ?? null;
  const reason = d.overrideReason?.trim() || null;
  const returnedFineMg = fineMg(weightMg, d.purityH);

  if (aiReadingId && !photoId) {
    throw new HttpError(400, "An AI reading requires a photo");
  }
  if (reason && !aiReadingId) {
    throw new HttpError(400, "An override reason requires an AI reading");
  }
  if (returnedFineMg <= 0) {
    throw new HttpError(
      400,
      "Weight and purity must produce at least 1 mg of fine gold",
    );
  }

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${d.orgId}))`;

      const existing = await tx.ledgerEntry.findUnique({
        where: { idempotencyKey: d.idempotencyKey },
      });

      if (
        existing &&
        (existing.orgId !== d.orgId ||
          existing.jobId !== d.jobId ||
          existing.entryType !== d.entryType ||
          existing.grossMg !== weightMg ||
          existing.purityH !== d.purityH ||
          existing.huid !== huid ||
          existing.photoId !== photoId ||
          existing.aiReadingId !== aiReadingId ||
          existing.reason !== reason)
      ) {
        throw new HttpError(
          409,
          "Idempotency key already used for another request",
        );
      }

      const job = await tx.job.findFirst({
        where: { id: d.jobId, orgId: d.orgId },
      });
      if (!job) throw new HttpError(404, "Job not found");

      const jobSum = await tx.ledgerEntry.aggregate({
        where: { orgId: d.orgId, jobId: job.id },
        _sum: { fineMg: true },
      });
      const karigarSum = await tx.ledgerEntry.aggregate({
        where: { orgId: d.orgId, karigarId: job.karigarId },
        _sum: { fineMg: true },
      });
      const jobBalance = jobSum._sum.fineMg ?? 0;
      const karigarBalance = karigarSum._sum.fineMg ?? 0;

      if (existing) {
        return {
          entry: existing,
          jobBalanceMg: jobBalance,
          balanceMg: karigarBalance,
          replayed: true,
        };
      }

      if (job.status !== "open") throw new HttpError(409, "Job is closed");
      if (returnedFineMg > jobBalance || returnedFineMg > karigarBalance) {
        throw new HttpError(409, "Receipt exceeds the available balance");
      }

      if (photoId) {
        const photo = await tx.scalePhoto.findUnique({
          where: { id: photoId },
        });
        if (!photo || !photo.storagePath.startsWith(`${d.orgId}/`)) {
          throw new HttpError(404, "Photo not found");
        }
      }

      if (aiReadingId) {
        const reading = await tx.aiReading.findUnique({
          where: { id: aiReadingId },
        });
        if (!reading || reading.photoId !== photoId) {
          throw new HttpError(404, "AI reading not found for this photo");
        }

        const linked = await tx.ledgerEntry.findFirst({
          where: { aiReadingId },
          select: { id: true },
        });
        if (linked) {
          throw new HttpError(409, "AI reading already used for another entry");
        }

        if (reading.status === "pending") {
          const decision = checkReceiptAi({
            weightMg,
            purityH: d.purityH,
            reading,
            overrideReason: reason ?? undefined,
          });

          const updated = await tx.aiReading.updateMany({
            where: { id: reading.id, status: "pending" },
            data: {
              status: decision.status,
              confirmedBy: d.userId,
            },
          });
          if (updated.count !== 1) {
            throw new HttpError(409, "AI reading changed. Refresh and try again");
          }
        } else if (reading.status !== "rejected") {
          throw new HttpError(409, "AI reading has already been confirmed");
        }
      }

      const rows = await tx.$queryRaw<{ n: number }[]>`
      SELECT COALESCE(MAX(CAST(SUBSTRING(slip_no FROM 4) AS INT)), 30410) AS n
      FROM ledger_entries
      WHERE org_id = ${d.orgId}::uuid AND slip_no ~ '^TX-[0-9]+$'`;

      const entry = await tx.ledgerEntry.create({
        data: {
          orgId: d.orgId,
          karigarId: job.karigarId,
          jobId: job.id,
          entryType: d.entryType,
          grossMg: weightMg,
          purityH: d.purityH,
          fineMg: -returnedFineMg,
          huid,
          photoId,
          aiReadingId,
          reason,
          slipNo: `TX-${Number(rows[0].n) + 1}`,
          idempotencyKey: d.idempotencyKey,
          createdBy: d.userId,
        },
      });

      return {
        entry,
        jobBalanceMg: jobBalance - returnedFineMg,
        balanceMg: karigarBalance - returnedFineMg,
        replayed: false,
      };
    },
    { timeout: 20000 },
  );
}
