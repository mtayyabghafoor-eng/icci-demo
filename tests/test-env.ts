// Loads the settings for a test run without ever printing them.
//
// By default every test runs against the LOCAL Supabase database in Docker
// (owner's choice, 19 Nov 2026: the cloud icci-dev project was running out of
// its free log allowance and dropping connections). Its settings live in the
// git-ignored .env.localdb, written by: npm run setup:local-db
//
// To run against the cloud icci-dev project instead, set ICCI_TEST_TARGET=cloud
// (PowerShell: $env:ICCI_TEST_TARGET="cloud"; npm test).
//
// Values already set are never replaced, so .env.localdb wins and .env.local
// only fills in the rest (for example the email settings).
import { existsSync } from "node:fs";

export const LOCAL_DB_FILE = ".env.localdb";

export function testTarget(): "local" | "cloud" {
  return process.env.ICCI_TEST_TARGET === "cloud" ? "cloud" : "local";
}

export function loadTestEnv(): void {
  if (testTarget() === "local") {
    if (!existsSync(LOCAL_DB_FILE)) {
      throw new Error(
        `No ${LOCAL_DB_FILE} yet. Start Docker Desktop, then run: npm run setup:local-db ` +
          "(or set ICCI_TEST_TARGET=cloud to test against icci-dev).",
      );
    }
    process.loadEnvFile(LOCAL_DB_FILE);
  }
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}
