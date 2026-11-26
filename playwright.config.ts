import { loadTestEnv } from "./tests/test-env";
import { defineConfig, devices } from "@playwright/test";

// The browser tests create a fictional "Test run" admin and calculate test
// authenticator codes, so they need the development settings (never printed).
loadTestEnv(); // local Docker database by default (tests/test-env.ts)

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  // One test at a time: tests sign in as the same fictional admins, and
  // finishing a sign-in ends that admin's other half-finished sign-ins.
  workers: 1,
  // Sign-in tests may wait up to 30 seconds for the next authenticator code.
  timeout: 90_000,
  // Each check waits up to 10 seconds (default 5). On the development
  // server a heavy page (a person with their history) now and then takes
  // 5 to 10 seconds even on a quiet computer; about once per run. The cause
  // was very long lists (session 23, docs/PROGRESS.md); they now show 50 at
  // a time and test leftovers are switched off, so pages take 1 to 2 seconds.
  // Raised to 20 seconds in P2.8 (session 32): late in a 17-minute run the
  // asset pages now and then still showed "Loading…" after 10 seconds, even
  // on a freshly reset database. A real fault still fails, only later.
  expect: { timeout: 20_000 },
  reporter: "list",
  // At the end: switch off the made-up places and people the tests created.
  globalTeardown: "./tests/e2e/global-teardown.ts",
  // No single click or wait may hang for more than 15 seconds.
  use: { baseURL: "http://localhost:3000", actionTimeout: 15_000, navigationTimeout: 30_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    // Slice P4.3: a pretend Open Library with made-up books only, so the
    // ISBN look-up is tested without any real outside website.
    {
      command: "node tests/e2e/fake-open-library.mjs",
      url: "http://127.0.0.1:3999/api/books",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      // If a website is already running here it is used as it is, and its
      // look-ups go to the real Open Library: close it before a test run.
      reuseExistingServer: true,
      timeout: 180_000,
      // Round C3: printed labels take their address from SITE_URL; in a
      // test run that is this test website.
      env: { OPEN_LIBRARY_URL: "http://127.0.0.1:3999", SITE_URL: "http://localhost:3000" },
    },
  ],
});
