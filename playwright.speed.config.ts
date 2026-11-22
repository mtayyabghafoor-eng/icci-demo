import { loadTestEnv } from "./tests/test-env";
import { defineConfig, devices } from "@playwright/test";

// The speed and reliability check (owner's request, 22 Nov 2026), separate
// from the ordinary tests: the production build of the site (as on Vercel)
// on port 3100, against the local test database. Each main page is opened
// three times; the median time and any browser errors are written to
// test-results/speed.json and printed. Run: npm run test:speed
loadTestEnv();

export default defineConfig({
  testDir: "tests/speed",
  workers: 1,
  timeout: 600_000,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", actionTimeout: 15_000, navigationTimeout: 30_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    // A mid-range phone on a slower connection would be slower again; this
    // measures the site and database, not the mobile network.
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
