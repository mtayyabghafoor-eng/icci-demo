// The authenticator keys of the FICTIONAL test accounts, so the seed script
// and the tests can produce sign-in codes without a phone.
// They live in .test-authenticators.json, which is git-ignored and is never
// printed. They only unlock made-up accounts on the development database.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const AUTHENTICATORS_FILE = ".test-authenticators.json";
/** The local Docker database keeps its own keys, so local and cloud runs never overwrite each other's. */
export const LOCAL_AUTHENTICATORS_FILE = ".test-authenticators.local.json";

export function authenticatorsFile(url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url ?? "") ? LOCAL_AUTHENTICATORS_FILE : AUTHENTICATORS_FILE;
}

export type TestAuthenticators = Record<string, { factorId: string; secret: string }>;

export function readTestAuthenticators(): TestAuthenticators {
  const file = authenticatorsFile();
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8")) as TestAuthenticators;
}

export function writeTestAuthenticators(value: TestAuthenticators): void {
  writeFileSync(authenticatorsFile(), JSON.stringify(value, null, 2) + "\n");
}

export function testAuthenticatorSecret(email: string): string {
  const found = readTestAuthenticators()[email];
  if (!found) throw new Error(`No test authenticator for ${email}. Run "npm run db:seed" first.`);
  return found.secret;
}
