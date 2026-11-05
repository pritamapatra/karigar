import type { PrismaClient } from "../../lib/generated/prisma/client";

export const ORG_ID = "00000000-0000-4000-8000-000000000001";
export const OPENING_VAULT_MG = 20_000_000;
export const CATEGORIES = [
  "Chain",
  "Necklace",
  "Bangle",
  "Ring",
  "Earring",
  "Pendant",
];

export async function seedOrg(db: PrismaClient) {
  await db.organization.upsert({
    where: { id: ORG_ID },
    update: { name: "Company A", openingVaultMg: OPENING_VAULT_MG },
    create: { id: ORG_ID, name: "Company A", openingVaultMg: OPENING_VAULT_MG },
  });
  for (const name of CATEGORIES) {
    await db.itemCategory.upsert({
      where: { orgId_name: { orgId: ORG_ID, name } },
      update: {},
      create: { orgId: ORG_ID, name },
    });
  }
}
