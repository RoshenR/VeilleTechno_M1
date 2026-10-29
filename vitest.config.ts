import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    env: loadEnv("test", process.cwd(), ""), // integration tests read .env.local (local Supabase)
  },
});
