import { config } from "dotenv";
import { createDb } from "../../lib/db";
import { ORG_ID, seedOrg } from "./org";
import { seedHistory } from "./history";
import { seedMurugesan } from "./murugesan";
import { seedUsers } from "./users";

config({ path: ".env.local" });

async function main() {
  const db = createDb(process.env.DIRECT_URL);
  try {
    await seedOrg(db);
    await seedUsers(db);
    await seedMurugesan(db);
    await seedHistory(db);
    const org = await db.organization.findUniqueOrThrow({
      where: { id: ORG_ID },
    });
    const categories = await db.itemCategory.count({
      where: { orgId: ORG_ID },
    });
    const profiles = await db.profile.findMany({
      where: { orgId: ORG_ID },
      select: { role: true, displayName: true },
      orderBy: { role: "asc" },
    });
    console.log(
      `org=${org.name} vaultMg=${org.openingVaultMg} categories=${categories}`,
    );
    console.table(profiles);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
