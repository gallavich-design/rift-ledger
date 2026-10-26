import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const E2E_DB_URL = `file:${path.resolve(__dirname, "prisma/e2e.db")}`;

// Run via `npm run e2e`, which first prepares prisma/e2e.db (scripts/prepare-e2e-db.ts).
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1, // tests share one database
  fullyParallel: false,
  use: { baseURL: `http://localhost:${PORT}`, colorScheme: "light", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/cards`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: E2E_DB_URL },
  },
});
