// After all browser tests: switch off the test records they made (tests/tidy-up.ts).
import { loadTestEnv } from "../test-env";
import { tidyUpTestRun } from "../tidy-up";

export default async function teardown() {
  loadTestEnv(); // local Docker database by default (tests/test-env.ts)
  await tidyUpTestRun();
}
