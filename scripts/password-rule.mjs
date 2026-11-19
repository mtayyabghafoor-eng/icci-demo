// The password rule (audit fix 3, owner agreed 15 Nov 2026), in one place.
// Supabase enforces the same rule: see [auth] in supabase/config.toml.
import { randomBytes, randomInt } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 12;

/** At least 12 characters, with at least one letter and one number. */
export function meetsPasswordRule(password) {
  return (
    typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

/** A random made-up password for the fictional test accounts. Always meets the rule. */
export function makeTestPassword() {
  const letters = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const body = randomBytes(24).toString("base64url");
  return `${letters[randomInt(letters.length)]}${digits[randomInt(digits.length)]}${body}`;
}
