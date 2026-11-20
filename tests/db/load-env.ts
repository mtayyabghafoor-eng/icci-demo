// Loads the test settings (local Docker database by default) without ever printing them.
import { loadTestEnv } from "../test-env";

loadTestEnv(); // local Docker database by default (tests/test-env.ts)
if (process.env.ICCI_ENVIRONMENT !== "development") {
  throw new Error('Database tests only run against the development database (ICCI_ENVIRONMENT="development").');
}
