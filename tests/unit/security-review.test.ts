// Website-side fixes from the audit and the fresh-eyes security review
// (15 Nov 2026). The password rule (audit fix 3) is not done yet: it changes
// the live sign-in settings and waits for the owner's go-ahead.
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { decideRoute, safeNextPath } from "@/lib/auth/rules";
import { safeDecode } from "@/lib/items/rules";

describe("return address after sign-in: hidden characters (new finding)", () => {
  // Browsers silently drop tabs and line breaks inside a web address, so
  // "/<tab>/evil.example" would become "//evil.example": another website.
  it.each([
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/\t\\evil.example",
    "/items\u0000",
    "/ /evil.example",
  ])("refuses %j", (raw) => {
    expect(safeNextPath(raw)).toBe("/");
  });

  it("still keeps an ordinary page with its search", () => {
    expect(safeNextPath("/items?q=chair&kind=fixed_asset")).toBe("/items?q=chair&kind=fixed_asset");
    expect(safeNextPath("/l/ICCI-000123")).toBe("/l/ICCI-000123");
  });

  it("the gatekeeper never sends a signed-in admin to another website", () => {
    const d = decideRoute({ pathname: "/sign-in", search: "?next=%2F%09%2Fevil.example", aal: "aal2", lastActive: String(Date.now()), now: Date.now() });
    expect(d).toEqual({ kind: "redirect", to: "/", signOut: false });
  });
});

describe("a badly formed label link (audit fix 10)", () => {
  it("is read as plain text instead of crashing the page", () => {
    expect(safeDecode("ICCI-000123")).toBe("ICCI-000123");
    expect(safeDecode("ICCI%2D000123")).toBe("ICCI-000123");
    expect(safeDecode("%E0%A4%A")).toBe("%E0%A4%A");
    expect(safeDecode("100%")).toBe("100%");
  });
});

describe("security headers on every page (audit fix 9)", () => {
  it("are sent for every address", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeDefined();
    const h = Object.fromEntries(all!.headers.map((x) => [x.key.toLowerCase(), x.value]));
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("same-origin");
    expect(h["permissions-policy"]).toMatch(/microphone=\(\)/);
    expect(h["permissions-policy"]).toMatch(/geolocation=\(\)/);
  });
});
