// Slice A6 in a real browser: a mistyped address and a missing record show
// an ICCI page with a way home (never the plain Next.js page), and an empty
// search shows one calm card with "Clear filters". Screens in docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");

async function signIn(page: Page) {
  await page.goto("/");
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page).toHaveURL(/\/$/);
}

test("a mistyped address and a missing item show ICCI pages with a way home", async ({ page }, info) => {
  await signIn(page);
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toContainText("Page Not Found");
  await shot(page, "page-not-found", info.project.name, "a6");
  await page.getByRole("link", { name: "Go to Home" }).click();
  await expect(page).toHaveURL(/\/$/);

  // A record that does not exist: the menu stays.
  await page.goto("/items/00000000-0000-4000-8000-000000000000");
  await expect(page.getByTestId("not-found")).toContainText("This page could not be found");
  await expect(page.getByRole("link", { name: "Go to Home" })).toBeVisible();
  await shot(page, "record-not-found", info.project.name, "a6");
});

test("an empty search shows one card with Clear filters", async ({ page }, info) => {
  await signIn(page);
  await page.goto("/items?q=zzqqxx-nothing");
  const empty = page.getByTestId("empty-list");
  await expect(empty).toContainText("No items match");
  await expect(page.getByTestId("item-count")).toHaveCount(0); // E2: said once, by the card
  await shot(page, "empty-search", info.project.name, "a6");
  await empty.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByTestId("empty-list")).toHaveCount(0);
});
