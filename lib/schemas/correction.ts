import { z } from "zod";

export const correctionSchema = z
  .object({
    entryId: z.uuid(),
    reason: z.string().trim().min(1, "Reason is required").max(500),
    idempotencyKey: z.uuid(),
  })
  .strict();

export type CorrectionInput = z.infer<typeof correctionSchema>;
