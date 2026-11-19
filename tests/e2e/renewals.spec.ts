// Phase 2, slice P2.8 in a real browser, on a PC-sized and a phone-sized
// window: add a renewal (already overdue, so it is red), mark it renewed
// (next due fills itself in a year later), withdraw the wrong entry, change
// details, switch it off; the register worst first with rows from vehicles
// and elsewhere; the filters; the home counter; and Finance's note. Every
// screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { addDays, addYears, todayInDublin } from "../../src/lib/vetting/rules";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot, showFilters } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p2-8");

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

/** On a PC a row is a table row holding a link; on a phone the whole card is the link. */
async function openRow(row: ReturnType<Page["getByTestId"]>) {
  const isLink = (await row.evaluate((el) => el.tagName)) === "A";
  await (isLink ? row : row.getByRole("link").first()).click();
}

test("add a renewal, mark it renewed, withdraw the wrong entry, switch it off", async ({ page }, info) => {
  const project = info.project.name;
  const title = `Test run ${Date.now()} ${project} lift inspection`;

  await signInAs(page, centre, "/renewals/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add a renewal" })).toBeVisible();
  await expectCurrentMenuLink(page, "Renewals");
  await page.getByLabel("What needs renewing").fill(title);
  await page.getByLabel("Category").selectOption("Safety inspection");
  await page.getByLabel("Due date").fill(addDays(todayInDublin(), -4));
  await page.getByLabel("Owner").selectOption({ label: "Test Hamza Example" });
  await page.getByLabel(/Documents needed/).fill("Test: last inspection report (made up)");
  await s(page, "add-renewal", project);
  await page.getByRole("button", { name: "Add renewal" }).click();

  await expect(page.getByTestId("notice")).toHaveText(/Renewal added/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByTestId("current-due").getByTestId("status")).toHaveText("Overdue");
  await expect(page.getByTestId("current-due")).toContainText("4 days overdue");
  await expect(page.getByTestId("owner")).toHaveText("Test Hamza Example");
  await s(page, "renewal-overdue", project);

  // Mark it renewed: next due fills itself in a year later.
  await page.getByRole("link", { name: "Mark renewed" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mark renewed" })).toBeVisible();
  const renewedOn = addDays(todayInDublin(), -1);
  await page.getByLabel("Renewed on").fill(renewedOn);
  await expect(page.getByLabel("Next due")).toHaveValue(addYears(renewedOn, 1));
  await s(page, "mark-renewed", project);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Marked renewed/);
  await expect(page.getByTestId("current-due").getByTestId("status")).toHaveText("Up to date");
  await expect(page.getByTestId("due-entry")).toHaveCount(2);
  await s(page, "renewal-renewed", project);

  // That was wrong: withdraw it. The first due date counts again.
  const entry = page.getByTestId("due-entry").first();
  await entry.getByText("Withdraw this entry").click();
  await entry.getByLabel("Why is it wrong?").fill("Test: wrong certificate");
  await entry.getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/withdrawn/i);
  await expect(page.getByTestId("current-due").getByTestId("status")).toHaveText("Overdue");
  await expect(page.getByTestId("due-entry").first()).toContainText("Test: wrong certificate");

  // Change details.
  await page.getByRole("link", { name: "Change details" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Change renewal" })).toBeVisible();
  await page.getByLabel(/Notes/).fill("Test note: made up");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Changes saved/);
  await expect(page.getByText("Test note: made up")).toBeVisible();

  // In the register, red, opening this page.
  await page.goto("/renewals");
  const row = page.getByTestId("renewal-row").filter({ visible: true }).filter({ hasText: title });
  await expect(row).toHaveAttribute("data-status", "overdue");
  await expect(row.getByTestId("status")).toHaveText("Overdue");

  // Switch it off: it leaves the register.
  await openRow(row);
  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Switched off/);
  await expect(page.getByRole("link", { name: "Mark renewed" })).toHaveCount(0);
  await page.goto("/renewals?show=all");
  await expect(page.getByTestId("renewal-row").filter({ hasText: title })).toHaveCount(0);
});

test("the register, worst first, with dates from vehicles, vetting and elsewhere", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/renewals");
  await expect(page.getByRole("heading", { level: 1, name: "Renewals" })).toBeVisible();
  const rows = page.getByTestId("renewal-row").filter({ visible: true });
  await expect(rows.first()).toHaveAttribute("data-status", "overdue");
  // Needs attention only: nothing up to date or ended.
  for (const status of ["ok", "ended"]) await expect(page.locator(`[data-testid="renewal-row"][data-status="${status}"]`)).toHaveCount(0);
  // The seed's van has expired motor tax; its row opens the vehicle page.
  const van = rows.filter({ hasText: "Motor tax: TEST-VAN-1" });
  await expect(van.getByTestId("status")).toHaveText("Overdue");
  await expect(rows.filter({ hasText: "Test fire alarm service contract (made up)" }).getByTestId("status")).toHaveText("Overdue");
  await expect(rows.filter({ hasText: "Test lift safety inspection (made up)" }).getByTestId("status")).toHaveText("Due soon");
  await s(page, "renewals-list", project);
  await openRow(van);
  await expect(page.getByRole("heading", { level: 1, name: "TEST-VAN-1" })).toBeVisible();

  // Filter: everything typed in here.
  await page.goto("/renewals");
  await showFilters(page);
  await page.getByLabel("Show").selectOption({ label: "Everything" });
  await page.getByLabel("From").selectOption({ label: "Typed in here" });
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page).toHaveURL(/show=all/);
  const typed = page.getByTestId("renewal-row").filter({ visible: true });
  await expect(typed.filter({ hasText: "Test website domain name (made up)" }).getByTestId("status")).toHaveText("Up to date");
  await expect(typed.filter({ hasText: "Motor tax" })).toHaveCount(0);
  await s(page, "renewals-filtered", project);
});

test("the home page counts renewals overdue or due in 30 days", async ({ page }, info) => {
  await signInAs(page, centre, "/");
  const card = page.getByTestId("counter-renewals");
  await expect(card).toBeVisible();
  await expect(card).toContainText(/overdue/);
  await card.click();
  await expect(page).toHaveURL(/\/renewals$/);
  await s(page, "home-renewals-counter", info.project.name);
});

test("finance sees a note instead of renewals", async ({ page }, info) => {
  await signInAs(page, finance, "/renewals");
  await expect(page.getByTestId("cannot-see-renewals")).toBeVisible();
  await page.goto("/renewals/new");
  await expect(page.getByTestId("cannot-see-renewals")).toBeVisible();
  await s(page, "renewals-finance", info.project.name);
});
