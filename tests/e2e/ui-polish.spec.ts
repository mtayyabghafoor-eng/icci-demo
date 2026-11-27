// UI-9 in a real browser (presentation polish): the calmer Home, the folding
// menu, the "← Back" button in the top bar, the floating saved message, the
// Library overview and the Library desk tabs, and the label sheet with its
// emblem. Screenshots of each changed screen are saved to docs/screens/
// as one screenful each (the full-page ones are taken by the older tests).
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { apiAs, completeSignIn, expectSignInPage, mainMenu, openMenuGroups, signInWithEmailCode } from "./helpers";
import { withFileLockRetry } from "./retry";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const operator = seedAdmin("library_operator");

async function signIn(page: Page, who: { email: string }, path = "/") {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
}

/** One screenful, as the owner would see it on opening the page. */
async function view(page: Page, name: string, project: string) {
  await expect(page.getByText(/^Loading/)).toHaveCount(0);
  await withFileLockRetry(() =>
    page.screenshot({ path: `docs/screens/slice-ui-9-${name}-${project}.png`, scale: "css", caret: "initial", animations: "disabled", timeout: 60_000 }),
  );
}

test("Home: four headline numbers, slim Needs attention rows, big actions; the menu folds", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await signIn(page, centre);
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  for (const id of ["items", "people", "books", "approvals"]) await expect(page.getByTestId(`headline-${id}`)).toBeVisible();
  // D1: the approvals box adds up its queues (P5.3: expense claims too).
  const queueLines = await page.getByTestId("headline-approvals").getByRole("link").allTextContents();
  const sum = queueLines.reduce((n, t) => n + Number(t.trim().match(/^\d+/)?.[0] ?? 0), 0);
  await expect(page.getByTestId("headline-approvals").getByTestId("headline-count")).toHaveText(String(sum));
  await view(page, "home", info.project.name);

  if (!phone) {
    // On Home only Overview is open; every other group waits folded.
    const menu = await mainMenu(page);
    await expect(menu.getByRole("button", { name: "Items and stock", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(menu.getByRole("link", { name: "Renewals", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Stock", exact: true })).toBeHidden();
    // A group opened stays open on the next page (this browser tab).
    await menu.getByRole("button", { name: "Assets", exact: true }).click();
    await menu.getByRole("link", { name: "Vehicles", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Vehicles" })).toBeVisible();
    await page.goto("/people");
    await expect((await mainMenu(page)).getByRole("button", { name: "Assets", exact: true })).toHaveAttribute("aria-expanded", "true");
  }
});

test("Back in the top bar goes up one level; a saved message floats and can be closed", async ({ page }, info) => {
  await signIn(page, centre, "/items");
  const first = page.locator('a[href^="/items/"]').filter({ hasNotText: /Register/ }).first();
  const href = await first.getAttribute("href");
  await page.goto(href!);
  const back = page.getByTestId("back-button");
  await expect(back).toBeVisible();
  await expect(back).toHaveAccessibleName("Back to All items");
  await expect(page.locator("header").getByTestId("back-button")).toBeVisible();
  await view(page, "back-button", info.project.name);
  await back.click();
  await expect(page).toHaveURL(/\/items$/);
  // Top-level pages have no Back.
  await expect(page.getByTestId("back-button")).toHaveCount(0);

  // A saved message floats over the page, then closes and leaves the address.
  await page.goto("/people");
  const person = await page
    .locator('#content a[href^="/people/"]:not([href="/people/new"]):not([href^="/people/vetting"]):not([href^="/people/training"])')
    .first()
    .getAttribute("href");
  await page.goto(`${person}?done=saved`);
  const toast = page.getByTestId("toast");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Changes saved.");
  await view(page, "saved-message", info.project.name);
  await toast.getByRole("button", { name: "Close this message" }).click();
  await expect(toast).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("done")).toBe(false);
});

test("Library for an admin: two menu links, a calm overview, and the desk tabs", async ({ page }, info) => {
  await signIn(page, centre, "/library/overview");
  await expect(page.getByRole("heading", { level: 1, name: "Library Overview" })).toBeVisible();
  for (const id of ["titles", "on-loan", "overdue", "lost"]) await expect(page.getByTestId(`library-${id}`)).toBeVisible();
  await expect(page.getByTestId("overview-overdue")).toBeVisible();
  // No book-by-book list on the overview.
  await expect(page.getByTestId("book-count")).toHaveCount(0);
  await view(page, "library-overview", info.project.name);

  const menu = await mainMenu(page);
  await openMenuGroups(menu);
  const library = menu.getByRole("button", { name: "Library", exact: true }).locator("xpath=..");
  await expect(library.getByRole("link")).toHaveText(["Library overview", "Library desk"]);
  await expect(menu.getByRole("link", { name: "Library overview", exact: true })).toHaveAttribute("aria-current", "page");
  await menu.getByRole("link", { name: "Library desk", exact: true }).click();

  const tabs = page.getByRole("navigation", { name: "Library desk" });
  await expect(tabs.getByRole("link")).toHaveText(["Catalog", "Add a book", "Lend", "Return", "Borrowers", "On loan", "Overdue", "Most borrowed", "Lost and withdrawn"]);
  await expect(tabs.getByRole("link", { name: "Catalog" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "On loan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "On loan" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "On loan" })).toHaveAttribute("aria-current", "page");
  await view(page, "library-desk-tabs", info.project.name);
  // The menu keeps "Library desk" lit on every desk page.
  const again = await mainMenu(page);
  await expect(again.getByRole("link", { name: "Library desk", exact: true })).toHaveAttribute("aria-current", "page");
});

test("the Library Operator keeps all nine links, and sees the desk tabs too", async ({ page }) => {
  await signInWithEmailCode(page, operator.email);
  const menu = await mainMenu(page);
  await expect(menu.getByRole("link")).toHaveText(["Home", "Library", "Add a book", "Lend", "Return", "Borrowers", "On loan", "Overdue", "Most borrowed", "Lost and withdrawn"]);
  // A short menu never folds.
  await expect(menu.locator("button[aria-expanded]")).toHaveCount(0);
  const close = page.getByRole("button", { name: "Close the menu" });
  if (await close.isVisible()) await close.click();
  await page.goto("/library/overdue");
  await expect(page.getByRole("navigation", { name: "Library desk" }).getByRole("link", { name: "Overdue" })).toHaveAttribute("aria-current", "page");
});

test("Finance cannot see the Library overview; a signed-out visitor gets the sign-in page", async ({ page }) => {
  await page.goto("/library/overview");
  await expectSignInPage(page);
  await completeSignIn(page, finance.email, testAuthenticatorSecret(finance.email));
  await expect(page.getByTestId("cannot-see-library")).toBeVisible();
  await expect(page.getByTestId("library-titles")).toHaveCount(0);
});

test("the label sheet: a dome emblem on every label, the number and QR code unchanged", async ({ page }, info) => {
  const api = await apiAs(centre.email);
  const { data } = await api.from("label_print_runs").select("id").order("id").limit(1).single();
  await signIn(page, centre, `/labels/sheet/${data!.id}`);
  const label = page.getByTestId("label").first();
  await expect(label).toBeVisible();
  await expect(label.locator("svg.label-emblem")).toBeVisible();
  await expect(label.getByRole("img", { name: /QR code for ICCI-/ })).toBeVisible();
  await expect(label).toContainText("TEST LABEL");
  await page.getByTestId("label-sheets").scrollIntoViewIfNeeded();
  await view(page, "label-sheet", info.project.name);
});
