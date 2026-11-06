import { z } from "zod";

const weightMg = z.number().int().min(1).max(10_000_000);

const common = {
  jobId: z.uuid(),
  purityH: z.number().int().min(1).max(10000),
  idempotencyKey: z.uuid(),
};

export const receiptSchema = z.discriminatedUnion("entryType", [
  z
    .object({
      ...common,
      entryType: z.literal("receipt_piece"),
      netMg: weightMg,
      huid: z.string().trim().min(1, "HUID is required").max(64),
    })
    .strict(),
  z
    .object({
      ...common,
      entryType: z.literal("receipt_scrap"),
      grossMg: weightMg,
    })
    .strict(),
  z
    .object({
      ...common,
      entryType: z.literal("receipt_filings"),
      grossMg: weightMg,
    })
    .strict(),
]);

export type ReceiptInput = z.infer<typeof receiptSchema>;
