// Round C3 in a real browser:
//   * Opening /sign-out from elsewhere (a link or hidden picture on another
//     website) no longer signs an admin out while they are active.
//   * An address that ends like a picture name still asks for sign-in.
//   * The stricter content rule is sent, and the main pages load without
//     the browser blocking anything they need.
import { expect, test } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage } from "./helpers";

const centre = seedAdmin("centre_admin");

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "The same on a phone."));

test("an address ending like a picture name still asks for sign-in", async ({ request }) => {
  for (const path of ["/items/anything.png", "/people/x.jpg", "/expenses/1.webp"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(res.headers()["location"], path).toMatch(/\/sign-in/);
  }
  // The brand pictures the sign-in page shows still open without signing in.
  expect((await request.get("/brand/icci-logo-160.png", { maxRedirects: 0 })).status()).toBe(200);
});

test("the content rule allows scripts from this site only", async ({ request }) => {
  const csp = (await request.get("/sign-in")).headers()["content-security-policy"];
  for (const part of ["default-src 'self'", "script-src 'self'", "connect-src 'self'", "frame-src 'none'", "object-src 'none'", "frame-ancestors 'none'"]) {
    expect(csp).toContain(part);
  }
  expect(csp).not.toMatch(/(^|[\s;])\*(;|\s|$)/);
});

test("another website cannot sign an active admin out; the idle sign-out still works", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (load|execute|connect)/i.test(m.text())) blocked.push(m.text());
  });
  await page.goto("/");
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page.getByTestId("greeting")).toBeVisible();

  for (const reason of ["idle", "no-access", "anything"]) {
    await page.goto(`/sign-out?reason=${reason}`);
    await expect(page, reason).toHaveURL(/\/$/);
    await expect(page.getByTestId("greeting")).toBeVisible();
  }

  // A few busy pages: nothing they need is blocked by the content rule.
  for (const path of ["/items", "/people", "/expenses", "/rota", "/library"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  expect(blocked).toEqual([]);

  // Really idle for 15 minutes (the activity time is put back): signed out.
  const url = new URL(page.url());
  await page.context().addCookies([{ name: "icci_last_active", value: String(Date.now() - 16 * 60_000), domain: url.hostname, path: "/" }]);
  await page.goto("/sign-out?reason=idle");
  await expect(page).toHaveURL(/\/sign-in\?reason=idle$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
});
