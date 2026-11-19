// Loads .env.local into the test process without ever printing it.
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (process.env.ICCI_ENVIRONMENT !== "development") {
  throw new Error('Database tests only run against the development database (ICCI_ENVIRONMENT="development").');
}
