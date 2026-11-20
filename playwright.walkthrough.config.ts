import { loadTestEnv } from "./tests/test-env";
import { defineConfig, devices } from "@playwright/test";

// The approval walkthrough (npm run walkthrough): clean, step-by-step
// screenshots of each workflow for the Centre's admins to review. Not part
// of npm test. Uses only the made-up seed data. Saved to docs/screens/walkthrough/.
loadTestEnv(); // local Docker database by default (tests/test-env.ts)

export default defineConfig({
  testDir: "tests/walkthrough",
  workers: 1,
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: { baseURL: "http://localhost:3000", actionTimeout: 15_000, navigationTimeout: 45_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 960 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 180_000 },
});
