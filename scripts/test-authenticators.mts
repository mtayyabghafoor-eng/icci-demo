// The authenticator keys of the FICTIONAL test accounts, so the seed script
// and the tests can produce sign-in codes without a phone.
// They live in .test-authenticators.json, which is git-ignored and is never
// printed. They only unlock made-up accounts on the development database.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const AUTHENTICATORS_FILE = ".test-authenticators.json";

export type TestAuthenticators = Record<string, { factorId: string; secret: string }>;

export function readTestAuthenticators(): TestAuthenticators {
  if (!existsSync(AUTHENTICATORS_FILE)) return {};
  return JSON.parse(readFileSync(AUTHENTICATORS_FILE, "utf8")) as TestAuthenticators;
}

export function writeTestAuthenticators(value: TestAuthenticators): void {
  writeFileSync(AUTHENTICATORS_FILE, JSON.stringify(value, null, 2) + "\n");
}

export function testAuthenticatorSecret(email: string): string {
  const found = readTestAuthenticators()[email];
  if (!found) throw new Error(`No test authenticator for ${email}. Run "npm run db:seed" first.`);
  return found.secret;
}
