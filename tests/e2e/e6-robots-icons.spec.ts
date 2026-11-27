// Slice E6, signed out: search engines and AI scrapers are told to keep
// out, every reply carries a "do not list, do not keep a copy" label, and
// the round ICCI coin is the tab and phone home-screen icon. None of these
// go through the sign-in page.
import { expect, test } from "@playwright/test";

const KEEP_OUT = "noindex, nofollow, noarchive, nosnippet, noimageindex";

test("robots.txt answers directly and keeps every search engine and named AI scraper out", async ({ request }) => {
  const res = await request.get("/robots.txt", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toMatch(/User-Agent: \*\s+Disallow: \//i);
  for (const bot of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "PerplexityBot"]) expect(text).toContain(bot);
  expect(text).not.toMatch(/Allow: \/\S/);
  expect(text).not.toContain("Sitemap");
});

for (const path of ["/sign-in", "/brand/icci-logo-160.png", "/robots.txt", "/items"]) {
  test(`${path} carries the do-not-list label`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.headers()["x-robots-tag"]).toBe(KEEP_OUT);
  });
}

test("the tab icon, the phone icon and the manifest load when signed out", async ({ request }) => {
  for (const [path, type] of [
    ["/icon.png", "image/png"],
    ["/apple-icon.png", "image/png"],
    ["/manifest.webmanifest", "application/manifest+json"],
  ]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toContain(type);
  }
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.theme_color).toBe("#004236");
  expect(manifest.display).toBe("browser");
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test("the sign-in page points to the icons and colours the phone's bar dark green", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /\/icon\.png/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /\/apple-icon\.png/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#004236");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
