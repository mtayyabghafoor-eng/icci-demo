// Slice A2 in a real browser: the phone fixes. Run on both window sizes; the
// phone-only checks skip themselves on a PC. Screens saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

async function signInAs(page: Page, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

async function openStoreRoom(page: Page) {
  // D4: store rooms are a list of cards, each with when it was last counted.
  await page.getByTestId("count-rooms").getByRole("link", { name: /^Test Store Room B1-1(?!d)/ }).click();
  await expect(page).toHaveURL(/\/stock\/count\?room=/);
  await expect(page.locator('input[name^="qty:"]').first()).toBeVisible();
}

test("weekly count: Save stays above the bottom bar, and leaving unsaved asks first", async ({ page }, info) => {
  await signInAs(page, "/stock/count");
  await openStoreRoom(page);
  const save = page.getByRole("button", { name: "Save count" });

  if (isPhone(page)) {
    // In the middle of a long list, the Save button is in view and not under the bottom bar.
    await page.locator('input[name^="qty:"]').nth(5).scrollIntoViewIfNeeded();
    const button = await save.boundingBox();
    const bar = await page.getByTestId("bottom-bar").boundingBox();
    expect(button && bar).toBeTruthy();
    expect(button!.y + button!.height).toBeLessThanOrEqual(bar!.y);
    expect(button!.y).toBeGreaterThan(0);
    await shot(page, "count-save-above-bar", info.project.name, "a2");
  }

  // One shelf counted, then a stray tap on Home: the app asks, and "Cancel" stays.
  await page.locator('input[name^="qty:"]').first().fill("3");
  const asked: string[] = [];
  page.once("dialog", (d) => {
    asked.push(d.message());
    void d.dismiss();
  });
  const home = isPhone(page) ? page.getByTestId("bottom-bar").getByRole("link", { name: "Home" }) : page.getByRole("link", { name: "Home" }).first();
  await home.click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toBe("You have counted 1 shelf but not saved. Leave without saving?");
  await expect(page).toHaveURL(/\/stock\/count\?room=/);
  await expect(page.locator('input[name^="qty:"]').first()).toHaveValue("3");
  // Clearing the box: nothing unsaved, so no question.
  await page.locator('input[name^="qty:"]').first().fill("");
  await home.click();
  await expect(page).toHaveURL(/\/$/);
});

test("a list with drop-downs only shows them on a phone, with no empty box", async ({ page }, info) => {
  await signInAs(page, "/tickets");
  await expect(page.getByLabel("Status")).toBeVisible();
  await expect(page.getByRole("button", { name: /More filters/ })).toHaveCount(0);
  if (isPhone(page)) await shot(page, "tickets-filters-shown", info.project.name, "a2");
  // A list with a search box still folds its drop-downs on a phone.
  await page.goto("/items");
  if (isPhone(page)) {
    await expect(page.getByRole("button", { name: /More filters/ })).toBeVisible();
    await expect(page.locator('select[name="kind"]')).toBeHidden();
  }
});

test("after a scan on a phone, the item's buttons come before its details", async ({ page }, info) => {
  await signInAs(page, "/items?kind=fixed_asset");
  const link = page.locator('main a[href^="/items/"]:not([href="/items/new"])').filter({ visible: true });
  const href = await link.first().getAttribute("href");
  expect(href).toMatch(/^\/items\/[0-9a-f-]{36}$/);
  await page.goto(href!);
  const actions = page.getByTestId("asset-actions");
  await expect(actions).toBeVisible();
  const details = page.getByRole("region", { name: "Details" }).locator("dl");
  const a = await actions.boundingBox();
  const d = await details.boundingBox();
  if (isPhone(page)) {
    expect(a!.y).toBeLessThan(d!.y);
    await shot(page, "item-buttons-first", info.project.name, "a2");
  } else {
    expect(d!.y).toBeLessThan(a!.y);
  }
});

test("companies are cards on a phone and a table on a PC", async ({ page }, info) => {
  await signInAs(page, "/companies");
  if (isPhone(page)) {
    await expect(page.getByRole("table")).toBeHidden();
    await expect(page.getByRole("list", { name: "Companies" }).getByRole("listitem").first()).toBeVisible();
    await shot(page, "companies-cards", info.project.name, "a2");
  } else {
    await expect(page.getByRole("table")).toBeVisible();
  }
});
