// Slice UI-1 in a real browser, PC and phone: the style sample page shows the
// new fonts, colours, logo, photo and shared parts, and is for signed-in
// admins only. Screenshots go to docs/screens/.
import { expect, test } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");

test("a signed-out visitor is sent to sign-in, not the style sample", async ({ page }) => {
  await page.goto("/style");
  await expectSignInPage(page);
  await expect(page.getByTestId("style-sample")).toHaveCount(0);
});

test("the style sample shows the new look", async ({ page }, info) => {
  await page.goto("/style");
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));

  const main = page.getByTestId("style-sample");
  await expect(main.getByRole("heading", { level: 1, name: "Style Sample" })).toBeVisible();

  // Fonts: titles in Cormorant Garamond, body in Plus Jakarta Sans, labels in JetBrains Mono.
  const font = (sel: ReturnType<typeof page.locator>) => sel.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(await font(main.getByRole("heading", { level: 1 }))).toMatch(/Cormorant/);
  expect(await font(main.getByText(/^Body text in Plus Jakarta Sans/))).toMatch(/Jakarta/);
  expect(await font(main.getByText("ICCI-000123", { exact: true }))).toMatch(/JetBrains/);

  // Titles are no longer forced into capitals.
  expect(await main.getByRole("heading", { level: 1 }).evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");

  // The round logo and the Centre photograph load.
  for (const img of [main.getByTestId("sidebar-preview").getByRole("img"), main.getByTestId("photo-preview").getByRole("img")]) {
    await expect(img).toBeVisible();
    expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }

  // Every status colour carries a word.
  for (const word of ["In stock", "Low", "Missing", "Not counted yet"]) {
    await expect(main.getByText(word, { exact: true }).first()).toBeVisible();
  }
  await expect(main.getByText("1 to 50 of 487")).toBeVisible();

  await shot(page, "style-sample", info.project.name, "ui-1");
});
