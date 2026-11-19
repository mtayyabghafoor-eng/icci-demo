// Audit fix 9 (15 Nov 2026): every page tells the browser not to show it
// inside another website, not to guess file types, and not to pass the page
// address on to other sites.
import { expect, test } from "@playwright/test";

for (const path of ["/sign-in", "/items", "/l/ICCI-000001"]) {
  test(`${path} sends the safety instructions to the browser`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["content-security-policy"]).toContain("base-uri 'self'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("same-origin");
    expect(h["permissions-policy"]).toContain("microphone=()");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-powered-by"]).toBeUndefined();
  });
}
