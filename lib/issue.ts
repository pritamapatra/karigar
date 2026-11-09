import type { z } from "zod";
import { HttpError } from "@/lib/authz";
import { fineMg } from "@/lib/gold";
import { checkReceiptAi } from "@/lib/receipt-ai";
import type { createDb } from "@/lib/db";
import type { issueSchema } from "@/lib/schemas/issue";

type Db = ReturnType<typeof createDb>;
export type IssueInput = z.infer<typeof issueSchema> & {
  orgId: string;
  userId: string;
};

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function issueGold(db: Db, d: IssueInput) {
  const photoId = d.photoId ?? null;
  const aiReadingId = d.aiReadingId ?? null;
  const reason = d.overrideReason?.trim() || null;
  const weightMg = d.grossMg;
  const fine = fineMg(d.grossMg, d.purityH);

  if (aiReadingId && !photoId) {
    throw new HttpError(400, "An AI reading requires a photo");
  }
  if (reason && !aiReadingId) {
    throw new HttpError(400, "An override reason requires an AI reading");
  }
  if (fine <= 0) {
    throw new HttpError(
      400,
      "Weight and purity must produce at least 1 mg of fine gold",
    );
  }

  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${d.orgId}))`;

        const existing = await tx.ledgerEntry.findUnique({
          where: { idempotencyKey: d.idempotencyKey },
          include: { job: true },
        });

        if (
          existing &&
          (existing.orgId !== d.orgId ||
            existing.createdBy !== d.userId ||
            existing.entryType !== "issue" ||
            existing.karigarId !== d.karigarId ||
            existing.job.jobNumber !== d.jobNumber ||
            existing.job.categoryId !== d.categoryId ||
            existing.grossMg !== d.grossMg ||
            existing.purityH !== d.purityH ||
            existing.photoId !== photoId ||
            existing.aiReadingId !== aiReadingId ||
            existing.reason !== reason)
        ) {
          throw new HttpError(
            409,
            "Idempotency key already used for another request",
          );
        }

        if (existing) {
          const sum = await tx.ledgerEntry.aggregate({
            where: { orgId: d.orgId, karigarId: d.karigarId },
            _sum: { fineMg: true },
          });
          return {
            entry: {
              id: existing.id,
              slipNo: existing.slipNo,
              jobNumber: existing.job.jobNumber,
              grossMg: existing.grossMg,
              purityH: existing.purityH,
              fineMg: existing.fineMg,
            },
            balanceMg: sum._sum.fineMg ?? 0,
            replayed: true,
          };
        }

        const [karigar, category] = await Promise.all([
          tx.karigar.findFirst({ where: { id: d.karigarId, orgId: d.orgId } }),
          tx.itemCategory.findFirst({
            where: { id: d.categoryId, orgId: d.orgId },
          }),
        ]);
        if (!karigar) throw new HttpError(404, "Karigar not found");
        if (!karigar.active) throw new HttpError(400, "Karigar is inactive");
        if (!category) throw new HttpError(404, "Category not found");

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
            throw new HttpError(
              409,
              "AI reading already used for another entry",
            );
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
              throw new HttpError(
                409,
                "AI reading changed. Refresh and try again",
              );
            }
          } else if (reading.status !== "rejected") {
            throw new HttpError(409, "AI reading has already been confirmed");
          }
        }

        const rows = await tx.$queryRaw<{ n: number }[]>`
        SELECT COALESCE(MAX(CAST(SUBSTRING(slip_no FROM 4) AS INT)), 30410) AS n
        FROM ledger_entries
        WHERE org_id = ${d.orgId}::uuid AND slip_no ~ '^TX-[0-9]+$'`;

        const job = await tx.job.create({
          data: {
            orgId: d.orgId,
            jobNumber: d.jobNumber,
            karigarId: d.karigarId,
            categoryId: d.categoryId,
            issuedFineMg: fine,
          },
        });
        const entry = await tx.ledgerEntry.create({
          data: {
            orgId: d.orgId,
            karigarId: d.karigarId,
            jobId: job.id,
            entryType: "issue",
            grossMg: d.grossMg,
            purityH: d.purityH,
            fineMg: fine,
            photoId,
            aiReadingId,
            reason,
            slipNo: `TX-${Number(rows[0].n) + 1}`,
            idempotencyKey: d.idempotencyKey,
            createdBy: d.userId,
          },
        });
        const sum = await tx.ledgerEntry.aggregate({
          where: { orgId: d.orgId, karigarId: d.karigarId },
          _sum: { fineMg: true },
        });
        return {
          entry: {
            id: entry.id,
            slipNo: entry.slipNo,
            jobNumber: job.jobNumber,
            grossMg: entry.grossMg,
            purityH: entry.purityH,
            fineMg: entry.fineMg,
          },
          balanceMg: sum._sum.fineMg ?? 0,
          replayed: false,
        };
      },
      { timeout: 20000 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "Job number or request key already exists");
    }
    throw error;
  }
}
