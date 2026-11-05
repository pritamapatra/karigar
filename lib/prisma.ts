import type { PrismaClient } from "./generated/prisma/client";
import { createDb } from "./db";

const globalForPrisma = globalThis as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createDb();
  return globalForPrisma.prisma;
}
