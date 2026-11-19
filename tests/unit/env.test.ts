import { describe, expect, it } from "vitest";
import { assertDevelopment, assertSeedable, requireEnv } from "@/lib/env";

describe("requireEnv", () => {
  it("returns a value that is set", () => {
    expect(requireEnv("X", " abc ")).toBe("abc");
  });

  it("names the missing setting without printing any value", () => {
    expect(() => requireEnv("SUPABASE_SECRET_KEY", "")).toThrow(/Missing setting SUPABASE_SECRET_KEY/);
    expect(() => requireEnv("ANY", undefined)).toThrow(/\.env\.example/);
  });
});

describe("assertDevelopment", () => {
  it("allows development", () => {
    expect(() => assertDevelopment("development")).not.toThrow();
  });

  it.each(["production", "staging", "", undefined])("refuses %s", (value) => {
    expect(() => assertDevelopment(value)).toThrow(/Refusing to run/);
  });
});

describe("assertSeedable", () => {
  it.each(["development", "staging"])("allows made-up data on %s", (value) => {
    expect(assertSeedable(value)).toBe(value);
  });

  it.each(["production", "Staging", "", undefined])("refuses %s", (value) => {
    expect(() => assertSeedable(value)).toThrow(/Refusing to seed/);
  });
});
