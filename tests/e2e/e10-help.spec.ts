// Slice E10 in a real browser, on a PC-sized and a phone-sized window: a
// "Help" link at the foot of the menu opens the user guide (a PDF) for a
// signed-in admin; a signed-out visitor asking for the guide gets only the
// sign-in page. Screens saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

test("Help at the foot of the menu opens the user guide", async ({ page }, info) => {
  await page.goto("/");
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page.getByTestId("greeting")).toBeVisible();

  if (isPhone(page)) await page.getByRole("button", { name: "Menu" }).click();
  const help = page.getByRole("link", { name: /Help: the user guide/ }).filter({ visible: true }).first();
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute("href", "/help/ICCI-User-Guide.pdf");
  await expect(help).toHaveAttribute("target", "_blank");
  await shot(page, "help-link", info.project.name, "e10");

  // The guide itself, with the admin's sign-in.
  const res = await page.request.get("/help/ICCI-User-Guide.pdf");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
});

test("a signed-out visitor cannot fetch the user guide", async ({ browser }) => {
  const context = await browser.newContext();
  const res = await context.request.get("/help/ICCI-User-Guide.pdf", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toMatch(/\/sign-in/);
  await context.close();
});
