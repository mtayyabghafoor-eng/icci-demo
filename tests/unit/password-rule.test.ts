// Audit fix 3 (owner agreed 15 Nov 2026): passwords need at least 12
// characters, with letters and numbers. Supabase enforces it on sign-in
// accounts (supabase/config.toml, sent with `npx supabase config push`).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeTestPassword, meetsPasswordRule, MIN_PASSWORD_LENGTH } from "../../scripts/password-rule.mjs";

describe("the password rule", () => {
  const config = readFileSync("supabase/config.toml", "utf8");

  it("is at least 12 characters, written in the sign-in settings", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(config).toMatch(/^minimum_password_length = 12$/m);
  });

  it("needs letters and numbers, written in the sign-in settings", () => {
    expect(config).toMatch(/^password_requirements = "letters_digits"$/m);
  });

  it.each([
    ["short1", false],
    ["abcdefghijkl", false],
    ["123456789012", false],
    ["abcdefghijk1", true],
    ["Correct-Horse-7-Battery", true],
  ])("%j meets it: %s", (p, ok) => expect(meetsPasswordRule(p)).toBe(ok));

  it("the made-up test password always meets it", () => {
    for (let i = 0; i < 500; i++) expect(meetsPasswordRule(makeTestPassword())).toBe(true);
  });
});
