// Slice UI-2 in a real browser, PC and phone: the sidebar (PC), the icon
// rail (tablet), the top bar, the phone bottom bar and menu sheet, the menu
// for each role, the Scan page and the two-minute sign-out warning.
// Screenshots go to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, mainMenu, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");

async function signIn(page: Page, who: { email: string }, to = "/") {
  await page.goto(to);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
}

const ready = (page: Page) => expect(page.getByText(/^Loading/)).toHaveCount(0);
const s = async (page: Page, name: string, project: string) => {
  await ready(page);
  await shot(page, name, project, "ui-2");
};

test("Centre Admin: every menu group, the current page marked, the page named in the top bar", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await signIn(page, centre, "/stock");
  await expect(page.getByTestId("where-am-i")).toContainText("Stock");

  if (phone) {
    // Phone: no sidebar; a bottom bar with four shortcuts and Menu.
    await expect(page.getByTestId("sidebar")).toBeHidden();
    const bar = page.getByTestId("bottom-bar");
    for (const name of ["Home", "Items", "Scan", "People"]) await expect(bar.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Menu" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await s(page, "stock-with-bottom-bar", info.project.name);
  } else {
    await expect(page.getByTestId("bottom-bar")).toBeHidden();
    await expect(page.getByTestId("signed-in-name")).toHaveText(centre.displayName);
  }

  const menu = await mainMenu(page);
  for (const group of ["Overview", "Items and stock", "Assets", "People"]) {
    await expect(menu.getByText(group, { exact: true }).first()).toBeVisible();
  }
  await expect(menu.getByRole("link", { name: "Stock", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(menu.getByRole("link", { name: "Items", exact: true })).not.toHaveAttribute("aria-current", "page");
  // UI-9: the group of this page is open; the other long groups fold away.
  await expect(menu.getByRole("button", { name: "Items and stock", exact: true })).toHaveAttribute("aria-expanded", "true");
  const people = menu.getByRole("button", { name: "People", exact: true });
  await expect(people).toHaveAttribute("aria-expanded", "false");
  await expect(menu.getByRole("link", { name: "Garda vetting", exact: true })).toBeHidden();
  await s(page, phone ? "menu-sheet" : "stock-with-sidebar", info.project.name);

  // Opening a group shows its links; a menu link opens its page and the sheet closes behind it.
  await people.click();
  await expect(people).toHaveAttribute("aria-expanded", "true");
  await menu.getByRole("link", { name: "Garda vetting", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Garda vetting" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  await expect(page.getByTestId("where-am-i")).toContainText("Garda vetting");
});

test("Finance sees only Home in the menu", async ({ page }, info) => {
  await signIn(page, finance);
  const menu = await mainMenu(page);
  await expect(menu.getByRole("link")).toHaveCount(1);
  await expect(menu.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  if (info.project.name === "phone") {
    const bar = page.getByTestId("bottom-bar");
    await expect(bar.getByRole("link")).toHaveCount(1);
    await expect(bar.getByRole("link", { name: "Scan" })).toHaveCount(0);
  } else {
    // No label box for a role that cannot open items.
    await expect(page.getByRole("search", { name: "Open a label" })).toHaveCount(0);
  }
  await s(page, "finance-menu", info.project.name);
});

test("Scan opens the label page; an unknown number is explained", async ({ page }, info) => {
  await signIn(page, centre);
  if (info.project.name === "phone") {
    await page.getByTestId("bottom-bar").getByRole("link", { name: "Scan" }).click();
  } else {
    await page.goto("/scan");
  }
  await expect(page.getByRole("heading", { level: 1, name: "Open a Label" })).toBeVisible();
  await expect(page.getByTestId("where-am-i")).toContainText("Open a label");
  await s(page, "scan", info.project.name);

  if (info.project.name === "desktop") {
    // The top bar box opens a label from any page.
    await page.goto("/people");
    const box = page.getByRole("search", { name: "Open a label" });
    await box.getByLabel("Open a label by its number").fill("ICCI-999999");
    await box.getByRole("button", { name: "Go to this label" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Label not recognised" })).toBeVisible();
  }
});

test("tablet width shows the icon rail with hidden words", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "tablet width is checked once, from the desktop browser");
  await page.setViewportSize({ width: 900, height: 1000 });
  await signIn(page, centre);
  const rail = page.getByTestId("sidebar");
  await expect(rail).toBeVisible();
  expect((await rail.boundingBox())?.width).toBe(72);
  // The word is still there for screen readers, and as a tooltip.
  await expect(rail.getByRole("link", { name: "People", exact: true })).toHaveAttribute("title", "People");
  await ready(page);
  await shot(page, "home-tablet-rail", "tablet", "ui-2");
});

test("a warning bar appears two minutes before the idle sign-out and goes on activity", async ({ page }, info) => {
  await signIn(page, centre, "/people");
  await ready(page);
  // Pretend the last activity was 13 minutes 30 seconds ago (the limit is 15).
  // Written exactly as the app writes it, so it replaces the real one. The
  // page writes the real time once when it starts, so try again until the
  // pretend time sticks; the page checks every 10 seconds.
  const warning = page.getByTestId("idle-warning");
  await expect(async () => {
    await page.evaluate((t) => {
      document.cookie = `icci_last_active=${t}; path=/; max-age=86400; samesite=lax`;
    }, Date.now() - 13.5 * 60_000);
    await expect(warning).toBeVisible({ timeout: 12_000 });
  }).toPass({ timeout: 45_000 });
  await expect(warning).toContainText("Signing out in 2 minutes");
  await shot(page, "idle-warning", info.project.name, "ui-2");

  await page.keyboard.press("Shift");
  await expect(warning).toBeHidden();
});

test("no list page is wider than the screen beside the sidebar or rail", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "PC and tablet widths are checked from the desktop browser");
  test.setTimeout(240_000); // eight list pages, each loaded once
  await signIn(page, centre);
  for (const path of ["/items", "/stock", "/assets", "/assets/not-seen", "/assets/register", "/people", "/people/vetting", "/stocktake"]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    // Long lists from the cloud development database can take 20 seconds.
    await page.goto(path, { timeout: 60_000 });
    await ready(page);
    // The same page, re-laid out at PC width and at tablet width.
    for (const width of [1280, 900]) {
      await page.setViewportSize({ width, height: 900 });
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(extra, `${path} at ${width} px scrolls sideways`).toBeLessThanOrEqual(0);
    }
  }
});

test("keyboard: the first Tab offers 'Skip to the page', and focus shows a clear outline", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard use is checked on the PC");
  await signIn(page, centre, "/people");
  await ready(page);
  // A fresh page load, so the first Tab starts from the top of the page.
  await page.reload();
  await ready(page);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to the page" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await shot(page, "skip-link", info.project.name, "ui-8");
  await page.keyboard.press("Enter");
  await expect(page.locator("#content")).toBeFocused();

  // Tabbing on from the page lands on real controls, each with the outline.
  // Buttons fade their colours over 0.15 seconds, so wait for the fade.
  await page.keyboard.press("Tab");
  const outline = () =>
    page.evaluate(() => {
      const s = getComputedStyle(document.activeElement as HTMLElement);
      return `${s.outlineStyle} ${parseFloat(s.outlineWidth)} ${s.outlineColor}`;
    });
  await expect.poll(outline).toBe("solid 3 rgb(138, 106, 43)");
});
