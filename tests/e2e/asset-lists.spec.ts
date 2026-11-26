// Finishing Phase 1 in a real browser, on a PC-sized and a phone-sized window:
// the "Not seen in 12 months" list and the asset register with its CSV file.
// Finance sees a short note instead, and cannot download the file.
// Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "11");

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

test("not seen in 12 months: the list and what counts as seen", async ({ page }, info) => {
  await signInAs(page, centre, "/assets/not-seen");
  await expect(page.getByRole("heading", { level: 1, name: "Not seen in 12 months" })).toBeVisible();
  await expect(page.getByText(/registered, moved, reported damaged, marked repaired or found, or scanned in a stocktake/)).toBeVisible();
  // All made-up assets were created recently, so none is a year old.
  await expect(page.getByTestId("not-seen-count")).toHaveText(/Every asset has been seen in the last 12 months|not been seen/);
  await expectCurrentMenuLink(page, "Not seen in 12 months");
  await s(page, "not-seen", info.project.name);
});

test("asset register: totals by place, one place in detail, and the CSV file", async ({ page }, info) => {
  await signInAs(page, centre, "/assets/register");
  await expect(page.getByRole("heading", { level: 1, name: "Asset register" })).toBeVisible();
  await expectCurrentMenuLink(page, "Asset register");
  const total = page.getByTestId("register-total");
  await expect(total).toHaveText(/\d+ assets? · €[\d,]+\.\d\d/);
  await s(page, "register", info.project.name);

  // One place in detail: its assets, most valuable first.
  await page.getByRole("link", { name: /Test Room A1/ }).first().click();
  // The register is slow when the dev database holds thousands of leftover
  // "Test run" places (npm run db:reset clears them), so allow 15 seconds.
  await expect(page).toHaveURL(/place=/, { timeout: 15_000 });
  await expect(page.getByTestId("register-place-assets").first()).toBeVisible();
  await s(page, "register-place", info.project.name);

  // The CSV file of just this place.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^icci-asset-register-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = (await (await download.createReadStream()).toArray()).map(String).join("");
  const lines = text.replace("﻿", "").trimEnd().split("\r\n");
  expect(lines[0]).toBe("Label,Name,Category,Place,Condition,Value (EUR),Purchase date,Warranty end");
  expect(lines.at(-1)).toMatch(/^Total,,,,,\d+\.\d\d,,$/);
  for (const line of lines.slice(1, -1)) expect(line).toContain("Test Room A1");
});

// P5.1 (owner, 25 Nov 2026): Finance reads the asset register and its CSV,
// never the item pages, and still not "Not seen in 12 months".
test("finance reads the register and its CSV without item links, but not the other asset list; signed out goes to sign-in", async ({ page }, info) => {
  const signedOut = await page.request.get("/assets/register/csv", { maxRedirects: 0 });
  expect(signedOut.status()).toBe(307);
  expect(signedOut.headers()["location"]).toMatch(/\/sign-in/);

  await signInAs(page, finance, "/assets/register");
  await expect(page.getByTestId("register-total")).toContainText(/Total: \d+ assets/);
  await expect(page.locator('a[href^="/items/"]')).toHaveCount(0);
  const firstPlace = page.locator("table.list-table tbody a").first();
  await firstPlace.click();
  await expect(page.getByTestId("register-place-assets").first()).toBeVisible();
  await expect(page.locator('a[href^="/items/"]')).toHaveCount(0);
  await s(page, "register-finance", info.project.name);
  await page.goto("/assets/not-seen");
  await expect(page.getByTestId("cannot-see-assets")).toBeVisible();

  const csv = await page.request.get("/assets/register/csv");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("ICCI-");
});

test("on a phone the list's drop-down filters fold away until asked for", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the fold is for phones only");
  await signInAs(page, centre, "/items");
  const kind = page.getByRole("combobox", { name: "Kind", exact: true });
  await expect(page.getByRole("textbox", { name: "Search", exact: true })).toBeVisible();
  await expect(kind).toBeHidden();
  await page.getByRole("button", { name: "More filters" }).click();
  await expect(kind).toBeVisible();
  await kind.selectOption({ label: "Consumables" });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/kind=consumable/);
  // Folded again after the search, and the button says one filter is in use.
  await expect(page.getByRole("button", { name: "More filters (1 in use)" })).toBeVisible();
  await shot(page, "items-filters-folded", info.project.name, "ui-5");
});
