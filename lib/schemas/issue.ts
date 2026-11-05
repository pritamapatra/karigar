import { z } from "zod";

export const issueSchema = z.object({
  karigarId: z.uuid(),
  categoryId: z.uuid(),
  jobNumber: z.string().trim().min(2).max(20),
  grossMg: z.number().int().min(1).max(10_000_000),
  purityH: z.number().int().min(1).max(10000),
  idempotencyKey: z.string().min(8).max(64),
});
