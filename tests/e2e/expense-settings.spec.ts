// Slice P5.1 in a real browser, on a PC-sized and a phone-sized window:
// Finance's Home (the "not linked yet" note and the two tiles), Expense
// settings (add, rename and switch off a category; add a restricted fund;
// the amounts read only; a used name locked), a Super Admin asking for a new
// amount and a second Super Admin confirming it (migration 0052), a Centre Admin
// reading the page without changing it, and the Library Operator kept out.
// Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot, signInWithEmailCode } from "./helpers";

const superAdmin = seedAdmin("super_admin");
const superTwo = { email: "super.two@icci-prototype.test" };
const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const library = seedAdmin("library_operator");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p5-1");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

const saved = (page: Page) => page.getByTestId("notice").filter({ visible: true });

test("Finance's Home says the account is not linked yet and offers the two pages", async ({ page }, info) => {
  await signInAs(page, finance, "/");
  await expect(page.getByTestId("greeting")).toContainText(finance.displayName);
  await expect(page.getByTestId("expense-link")).toContainText("You cannot approve expense claims yet");
  await expect(page.getByRole("link", { name: "Asset register Values by place" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Expense settings Categories, funds, amounts" })).toBeVisible();
  await s(page, "home-finance", info.project.name);
  await page.getByRole("link", { name: /^Expense settings Categories/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Expense Settings" })).toBeVisible();
});

test("Finance adds, renames and switches off a category, adds a restricted fund, and cannot change the amounts", async ({ page }, info) => {
  const project = info.project.name;
  const stamp = `Test run ${Date.now().toString(36)} ${project}`;
  await signInAs(page, finance, "/expenses/settings");
  await expect(page.getByTestId("setting-second_approval_cents")).toContainText("€500.00");
  await expect(page.getByTestId("setting-lost_receipt_second_cents")).toContainText("€50.00");
  await expect(page.getByText("Only a Super Admin can ask for a new amount, and a second Super Admin must confirm it.")).toBeVisible();
  await expect(page.getByText("Change this amount")).toHaveCount(0);
  await expect(page.getByTestId("category-list")).toContainText("Repairs and maintenance");
  await expect(page.getByTestId("fund-list").getByTestId("fund-entry").filter({ hasText: "Zakat" })).toContainText("Restricted");
  await s(page, "settings-finance", project);

  // Add a category.
  await page.getByRole("textbox", { name: "New category" }).fill(`${stamp} stationery`);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(saved(page)).toHaveText("Category added.");
  const entry = page.getByTestId("category-entry").filter({ hasText: `${stamp} stationery` });
  await expect(entry).toBeVisible();

  // The same name again is refused in plain words.
  await page.getByRole("textbox", { name: "New category" }).fill(`  ${stamp.toUpperCase()} STATIONERY `);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByTestId("form-error").filter({ visible: true })).toContainText("already exists");

  // Security review finding 2: "Utilities" is on seeded claims, so its name is locked.
  const utilities = page.getByTestId("category-entry").filter({ hasText: /^Utilities/ });
  await expect(utilities.getByTestId("name-locked")).toContainText("In use");
  await expect(utilities.getByText("Rename")).toHaveCount(0);
  await utilities.scrollIntoViewIfNeeded();
  await shot(page, "name-locked", project, "p5-7");

  // Rename it (not used yet), then switch it off.
  await entry.getByText("Rename").click();
  await entry.getByRole("textbox", { name: "Name" }).fill(`${stamp} office supplies`);
  await entry.getByRole("button", { name: "Save" }).click();
  await expect(saved(page)).toHaveText("Name changed.");
  const renamed = page.getByTestId("category-entry").filter({ hasText: `${stamp} office supplies` });
  await renamed.getByRole("button", { name: /^Switch off/ }).click();
  await expect(saved(page)).toContainText("Switched off");
  await expect(page.getByTestId("category-list")).not.toContainText(`${stamp} office supplies`);
  await page.getByText(/^Switched off \(\d+\)$/).first().click();
  await expect(page.getByTestId("category-list-off")).toContainText(`${stamp} office supplies`);

  // A restricted fund.
  await page.getByRole("textbox", { name: "New fund" }).fill(`${stamp} Sadaqah`);
  await page.getByRole("radio", { name: "Restricted", exact: true }).check();
  await page.getByRole("button", { name: "Add fund" }).click();
  await expect(saved(page)).toHaveText("Fund added.");
  await expect(page.getByTestId("fund-entry").filter({ hasText: `${stamp} Sadaqah` })).toContainText("Restricted");
  await s(page, "settings-finance-added", project);
});

// Security review 26 Nov 2026, finding 1 (migration 0052): one Super Admin
// asks for a new amount, a different Super Admin confirms it.
test("a Super Admin asks for a new lost-receipt amount; a second Super Admin confirms it", async ({ page, browser }, info) => {
  const before = await master().from("app_settings").select("amount_cents").eq("key", "lost_receipt_second_cents").single();
  await signInAs(page, superAdmin, "/expenses/settings");
  await expect(page.getByTestId("expense-link")).toContainText("You cannot approve expense claims yet");
  const row = page.getByTestId("setting-lost_receipt_second_cents");
  await row.getByText("Change this amount").click();
  await row.getByRole("textbox", { name: "New amount in euro" }).fill("nonsense");
  await row.getByRole("button", { name: "Ask for this change" }).click();
  await expect(row.getByTestId("form-error")).toContainText("for example 500");
  await row.getByRole("textbox", { name: "New amount in euro" }).fill("60");
  await row.getByRole("button", { name: "Ask for this change" }).click();
  await expect(saved(page)).toContainText("second Super Admin confirms it");
  const waiting = page.getByTestId("setting-lost_receipt_second_cents").getByTestId("setting-waiting");
  await expect(waiting).toContainText("New amount €60.00, asked for by you");
  await expect(waiting.getByRole("button", { name: "Confirm the new amount" })).toHaveCount(0);
  await expect(page.getByTestId("setting-lost_receipt_second_cents").getByTestId("setting-amount")).toHaveText(
    `€${(before.data!.amount_cents / 100).toFixed(2)}`,
  );
  await s(page, "settings-super-admin", info.project.name);
  await shot(page, "amount-asked", info.project.name, "p5-7");

  // The second Super Admin, in a separate window.
  const other = await (await browser.newContext({ viewport: page.viewportSize() })).newPage();
  await signInAs(other, superTwo, "/expenses/settings");
  const theirs = other.getByTestId("setting-lost_receipt_second_cents").getByTestId("setting-waiting");
  await expect(theirs).toContainText(`asked for by ${superAdmin.displayName}`);
  await shot(other, "amount-to-confirm", info.project.name, "p5-7");
  await theirs.getByRole("button", { name: "Confirm the new amount" }).click();
  await expect(saved(other)).toContainText("New amount confirmed");
  await expect(other.getByTestId("setting-lost_receipt_second_cents").getByTestId("setting-amount")).toHaveText("€60.00");
  await expect(other.getByTestId("setting-waiting")).toHaveCount(0);
  await shot(other, "amount-confirmed", info.project.name, "p5-7");
  await other.context().close();

  // Put it back for the other tests (the master key, as the seed does).
  const { error } = await master().from("app_settings").update({ amount_cents: before.data!.amount_cents }).eq("key", "lost_receipt_second_cents");
  expect(error).toBeNull();
});

test("a Centre Admin reads the settings but has no forms; the menu has no link for them", async ({ page }, info) => {
  await signInAs(page, centre, "/expenses/settings");
  await expect(page.getByTestId("expense-link")).toContainText("Your account is linked to Test Centre Admin");
  await expect(page.getByTestId("category-list")).toContainText("Utilities");
  await expect(page.getByRole("button", { name: "Add category" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Switch off/ })).toHaveCount(0);
  await expect(page.getByText("Only a Super Admin or Finance can change the categories and funds.")).toBeVisible();
  await expect(page.locator('a[href="/expenses/settings"]')).toHaveCount(0);
  await s(page, "settings-centre-admin", info.project.name);
});

test("the Library Operator cannot see expense settings; signed out goes to sign-in", async ({ page }) => {
  const signedOut = await page.request.get("/expenses/settings", { maxRedirects: 0 });
  expect(signedOut.status()).toBe(307);
  await signInWithEmailCode(page, library.email);
  await page.goto("/expenses/settings");
  await expect(page.getByTestId("cannot-see-expenses")).toBeVisible();
});
