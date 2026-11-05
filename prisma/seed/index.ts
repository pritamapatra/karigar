import { config } from "dotenv";
import { createDb } from "../../lib/db";
import { ORG_ID, seedOrg } from "./org";

config({ path: ".env.local" });

async function main() {
  const db = createDb(process.env.DIRECT_URL);
  try {
    await seedOrg(db);
    const org = await db.organization.findUniqueOrThrow({
      where: { id: ORG_ID },
    });
    const categories = await db.itemCategory.count({
      where: { orgId: ORG_ID },
    });
    console.log(
      `org=${org.name} vaultMg=${org.openingVaultMg} categories=${categories}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
