import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env.local" });

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["**/*.int.test.ts"],
    exclude: ["node_modules", ".next"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
