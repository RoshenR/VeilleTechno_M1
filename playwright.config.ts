import { defineConfig, devices } from "@playwright/test";

// Requires a running local Supabase (`npx supabase start`) with collected content (`npm run ingest`).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", locale: "fr-FR" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile/ },
  ],
  webServer: { command: "npm run dev", url: "http://localhost:3000/connexion", reuseExistingServer: true, timeout: 180_000 },
});
