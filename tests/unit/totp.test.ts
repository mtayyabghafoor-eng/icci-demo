// The code calculator used by the tests must match the official standard,
// otherwise the test sign-ins would prove nothing.
import { describe, expect, it } from "vitest";
import { base32Decode, secondsLeftInWindow, totp } from "../../scripts/totp.mts";

// RFC 6238 appendix B: key "12345678901234567890", written in base32.
const RFC_KEY = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("authenticator code calculator", () => {
  it("decodes the text key correctly", () => {
    expect(base32Decode(RFC_KEY).toString("ascii")).toBe("12345678901234567890");
  });

  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("matches the official example at %i seconds", (seconds, expected) => {
    expect(totp(RFC_KEY, seconds * 1000, 8)).toBe(expected);
  });

  it("gives 6-digit codes by default (the last 6 digits of the 8-digit form)", () => {
    expect(totp(RFC_KEY, 59_000)).toBe("287082");
  });

  it("refuses a key with characters that are not allowed", () => {
    expect(() => base32Decode("NOT-VALID-1!")).toThrow(/not allowed/);
  });

  it("knows how long until the code changes", () => {
    expect(secondsLeftInWindow(0)).toBe(30);
    expect(secondsLeftInWindow(29_000)).toBe(1);
  });
});
