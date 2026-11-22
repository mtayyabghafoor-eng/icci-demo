import { describe, expect, it } from "vitest";
import { assertDevelopment, assertSeedable, assertStagingTarget, requireEnv } from "@/lib/env";

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

describe("assertStagingTarget", () => {
  const staging = "https://hqauynjxtdafxhgzmffq.supabase.co";

  it("allows the ICCI Staging project when the file says staging", () => {
    expect(() => assertStagingTarget("staging", staging)).not.toThrow();
  });

  it.each(["development", "production", "", undefined])("refuses environment %s", (value) => {
    expect(() => assertStagingTarget(value, staging)).toThrow(/ICCI_ENVIRONMENT must be "staging"/);
  });

  it.each([
    "https://cqbnokadsrauhudjwrfc.supabase.co",
    "https://hqauynjxtdafxhgzmffq.supabase.co.evil.example",
    "https://evil.example/hqauynjxtdafxhgzmffq.supabase.co",
    "not a web address",
    undefined,
  ])("refuses any other database: %s", (url) => {
    expect(() => assertStagingTarget("staging", url)).toThrow(/not the ICCI Staging project/);
  });
});
