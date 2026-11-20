// Re-fills the ICCI Staging (demo) database with the same made-up data as
// development: tickets, rota, library and everything else in seed.mts.
// Run with: npm run db:seed:staging
//
// Safety:
// - Reads only .env.staging (git-ignored), never .env.local, and never
//   prints any value from it.
// - Refuses unless that file says ICCI_ENVIRONMENT=staging AND points at the
//   ICCI Staging project (src/lib/env.ts). Production and development are
//   refused before anything runs.
// - Adds and updates only; never resets or deletes the demo database.
// - seed.mts rewrites .test-authenticators.json (the development test keys).
//   This script keeps a copy and puts it back afterwards, so the development
//   tests still sign in. Do not run it while a development test run is going.
// - Each run removes the demo accounts' authenticators: presenters set up
//   their phone again at their next sign-in, and the demo password becomes
//   TEST_USER_PASSWORD from .env.staging.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { parseEnv } from "node:util";
import { assertStagingTarget } from "../src/lib/env.ts";
import { AUTHENTICATORS_FILE } from "./test-authenticators.mts";

const SETTINGS = ".env.staging";
const BACKUP = `${AUTHENTICATORS_FILE}.before-staging-seed`;

if (!existsSync(SETTINGS)) {
  console.error(
    `Missing ${SETTINGS}. Copy .env.example to ${SETTINGS} and fill in the ICCI Staging ` +
      "project's address and keys, ICCI_ENVIRONMENT=staging and a demo TEST_USER_PASSWORD.",
  );
  process.exit(1);
}

const settings = parseEnv(readFileSync(SETTINGS, "utf8")) as Record<string, string>;
try {
  assertStagingTarget(settings.ICCI_ENVIRONMENT, settings.NEXT_PUBLIC_SUPABASE_URL);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

// "--check": only say whether .env.staging is complete (names, never values).
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "TEST_USER_PASSWORD"];
const missing = REQUIRED.filter((k) => !settings[k]?.trim());
if (process.argv.includes("--check")) {
  console.log(missing.length ? `.env.staging is missing: ${missing.join(", ")}` : ".env.staging is complete and points at ICCI Staging.");
  process.exit(missing.length ? 1 : 0);
}
if (missing.length) {
  console.error(`.env.staging is missing: ${missing.join(", ")}`);
  process.exit(1);
}

// Only the staging settings reach the seed: nothing from .env.local or this shell
// that could point it somewhere else.
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  PATH: process.env.PATH ?? "",
  SYSTEMROOT: process.env.SYSTEMROOT ?? "",
  ...settings,
};

const hadKeys = existsSync(AUTHENTICATORS_FILE);
if (hadKeys) copyFileSync(AUTHENTICATORS_FILE, BACKUP);

let status = 1;
try {
  console.log("Re-seeding the ICCI Staging demo with made-up data…");
  const run = spawnSync(process.execPath, ["scripts/seed.mts"], { stdio: "inherit", env });
  status = run.status ?? 1;
} finally {
  if (hadKeys) {
    copyFileSync(BACKUP, AUTHENTICATORS_FILE);
    rmSync(BACKUP);
  } else {
    rmSync(AUTHENTICATORS_FILE, { force: true });
  }
}

console.log(status === 0 ? "Staging demo re-seeded. Development test keys left as they were." : "Staging re-seed failed (see above).");
process.exit(status);
