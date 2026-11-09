import { config } from "dotenv";
import { ensureScalePhotoBucket } from "../lib/storage-bucket";
import { createAdminClient } from "../lib/supabase/admin";

config({ path: ".env.local" });

ensureScalePhotoBucket(createAdminClient())
  .then(() => console.log("Bucket scale-photos is ready (private)."))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
