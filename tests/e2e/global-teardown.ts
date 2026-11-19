// After all browser tests: switch off the test records they made (tests/tidy-up.ts).
import { existsSync } from "node:fs";
import { tidyUpTestRun } from "../tidy-up";

export default async function teardown() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  await tidyUpTestRun();
}
