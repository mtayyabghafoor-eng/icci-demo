// Adds a random TEST_USER_PASSWORD to .env.local if it is not already set.
// It never prints the password. The password always has at least 12
// characters, with letters and numbers (the password rule, audit fix 3).
// If one is already set but too weak, it says so and changes nothing.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { makeTestPassword, meetsPasswordRule } from "./password-rule.mjs";

const file = ".env.local";
if (!existsSync(file)) {
  console.error("No .env.local yet. Copy .env.example to .env.local first.");
  process.exit(1);
}
const text = readFileSync(file, "utf8");
const line = text.split(/\r?\n/).find((l) => l.startsWith("TEST_USER_PASSWORD="));
const current = line ? line.slice("TEST_USER_PASSWORD=".length).trim() : "";
if (current !== "") {
  if (meetsPasswordRule(current)) {
    console.log("TEST_USER_PASSWORD is already set and meets the password rule. Nothing changed.");
    process.exit(0);
  }
  console.error(
    "TEST_USER_PASSWORD is set but does not meet the password rule (12+ characters, letters and numbers).\n" +
      "Delete that line from .env.local, run this again, then run npm run db:seed.",
  );
  process.exit(1);
}
const password = makeTestPassword();
const updated = line
  ? text.replace(line, `TEST_USER_PASSWORD=${password}`)
  : `${text.replace(/\s*$/, "")}\nTEST_USER_PASSWORD=${password}\n`;
writeFileSync(file, updated);
console.log("TEST_USER_PASSWORD added to .env.local (not shown).");
