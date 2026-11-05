import { z } from "zod";

const wastage = z.object({
  categoryId: z.uuid(),
  wastageBp: z.number().int().min(0).max(2000),
});

export const createKarigarSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(20).toUpperCase(),
  wastage: z.array(wastage).max(20).default([]),
});

export const updateKarigarSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    active: z.boolean(),
    wastage: z.array(wastage).max(20),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No changes");