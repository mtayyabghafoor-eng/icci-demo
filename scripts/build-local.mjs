// A production build that talks to the LOCAL test database (for the speed
// check, npm run test:speed). A production build fixes the database address
// into the pages when it is built, so the local settings are loaded first;
// .env.local only fills in what they do not set. Never prints any value.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".env.localdb")) {
  console.error("No .env.localdb yet. Start Docker Desktop, then run: npm run setup:local-db");
  process.exit(1);
}
process.loadEnvFile(".env.localdb");
const run = spawnSync("npx next build", { stdio: "inherit", env: process.env, shell: true });
process.exit(run.status ?? 1);
