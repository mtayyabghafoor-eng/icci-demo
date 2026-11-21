// Slice P1.18 in a real browser, on a PC-sized and a phone-sized window:
// "What we own" shows the main categories as tiles with how many we have and
// how many work; opening one lists its sub-categories; each number opens the
// Items list with exactly those items; one building can be chosen. The Items
// search also finds a kind of thing ("lawnmower"). Screens saved to
// docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p1-18");

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

test("how many air conditioners we have, how many work, and which ones", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/assets/overview");
  await expect(page.getByRole("heading", { level: 1, name: "What We Own" })).toBeVisible();
  await expectCurrentMenuLink(page, "What we own");
  await expect(page.getByTestId("campus-count")).toContainText(/\d+ assets · \d+ working/);
  const heating = page.getByTestId("category-tile").filter({ hasText: "Heating, cooling and water" });
  await expect(heating).toContainText(/\d+ not working/);
  await s(page, "overview", project);

  await heating.click();
  await expect(page.getByRole("heading", { level: 1, name: "Heating, cooling and water" })).toBeVisible();
  const ac = page.getByTestId("overview-sub").filter({ hasText: "Air conditioners" });
  await expect(ac).toContainText(/1\d assets · \d+ working · \d+ not working/);
  await s(page, "overview-heating", project);

  // "Not working" opens exactly the damaged air conditioners.
  await ac.getByRole("link", { name: /^Not working/ }).click();
  await expect(page).toHaveURL(/\/items\?category=[0-9a-f-]{36}&condition=damaged$/);
  const names = page.getByRole("main").getByText(/^Test (wall|ceiling) air conditioner \d+$/).filter({ visible: true });
  await expect(names.first()).toBeVisible();
  for (const status of await page.getByTestId("status").filter({ visible: true }).allInnerTexts()) expect(status).toBe("Damaged");

  // One building only.
  await page.goto("/assets/overview");
  await page.getByRole("combobox", { name: "Place" }).selectOption({ label: "Test Building A" });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("main")).toContainText("In Test Building A");
  await s(page, "overview-one-building", project);
});

test("searching for a kind of thing shows its total first, then the items", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/items?q=lawnmower");
  const match = page.getByTestId("matching-categories").getByTestId("category-tile").first();
  await expect(match).toContainText("Lawnmowers");
  await expect(match).toContainText(/\d+ assets · \d+ working/);
  await expect(page.getByRole("main").getByText(/^Test lawnmower \d+$/).filter({ visible: true }).first()).toBeVisible();
  await s(page, "search-lawnmower", project);
});

test("finance sees no numbers", async ({ page }) => {
  await signInAs(page, finance, "/assets/overview");
  await expect(page.getByTestId("overview-not-allowed")).toBeVisible();
});
