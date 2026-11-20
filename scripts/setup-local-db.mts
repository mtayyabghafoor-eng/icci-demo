// Writes .env.localdb: the settings for the LOCAL Supabase database in Docker,
// which the tests use by default (tests/test-env.ts). Never prints a value.
// Run with: npm run setup:local-db   (Docker Desktop must be running)
//
// It starts the local database if needed, reads its address and keys from
// "supabase status", and makes a new random test password and reminder key
// for the local made-up accounts. Safe to run again: it keeps the password
// and reminder key it made before, so the seeded accounts still sign in.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";

const FILE = ".env.localdb";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (args: string[]) =>
  execFileSync(npx, ["supabase", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });

try {
  run(["status"]);
} catch {
  console.log("Starting the local database (the first time downloads a few GB)…");
  execFileSync(npx, ["supabase", "start"], { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });
}

const status = parseEnv(run(["status", "-o", "env"])) as Record<string, string>;
const url = status.API_URL;
const publishable = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const secret = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
if (!url || !publishable || !secret) {
  console.error('Could not read the local database\'s address and keys from "supabase status". Is Docker Desktop running?');
  process.exit(1);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  console.error("Refusing: the local database address is not on this computer.");
  process.exit(1);
}

const before = existsSync(FILE) ? (parseEnv(readFileSync(FILE, "utf8")) as Record<string, string>) : {};
// Letters and numbers, 24 characters: meets the 12+ letters-and-digits rule.
const password = before.TEST_USER_PASSWORD || `Local${randomBytes(12).toString("hex")}`.slice(0, 24) + "a1";
const cronSecret = before.CRON_SECRET || randomBytes(32).toString("hex");

writeFileSync(
  FILE,
  [
    "# LOCAL Supabase database in Docker, for tests (npm run setup:local-db).",
    "# Git-ignored. Made-up accounts only. Never share or paste into chat.",
    "ICCI_ENVIRONMENT=development",
    `NEXT_PUBLIC_SUPABASE_URL=${url}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}`,
    `SUPABASE_SECRET_KEY=${secret}`,
    `TEST_USER_PASSWORD=${password}`,
    `CRON_SECRET=${cronSecret}`,
    // Local tests never send real email.
    "RESEND_API_KEY=",
    "",
  ].join("\n"),
);
console.log(`${FILE} written for the local database at ${url} (keys not shown).`);
