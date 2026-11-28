// Phase 6 in a real browser, on a PC-sized and a phone-sized window: the
// Super Admin records a funeral (the number comes from the database),
// corrects it (the old version stays in the history) and cancels it with a
// reason; records a Shahada and a Nikah; the 18-or-over tick is required.
// A Centre Admin sees neither the menu group nor the pages. Every screen is
// saved to docs/screens/. Names are made up ("Test run ...").
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { addDays, todayInDublin } from "../../src/lib/vetting/rules";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const superAdmin = seedAdmin("super_admin");
const centre = seedAdmin("centre_admin");
/** A whole-page picture, taken from the top (a scrolled page caught the top bar mid-picture). */
async function s(page: Page, name: string, project: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, name, project, "p6");
}
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

async function pickFirstPerson(page: Page, label: string) {
  const select = page.getByLabel(label, { exact: true });
  const value = await select.locator("option:not([disabled])").first().getAttribute("value");
  await select.selectOption(value!);
}

test("funeral register: record, correct, cancel", async ({ page }, info) => {
  const project = info.project.name;
  const name = `Test run ${Date.now()} ${project} deceased`;
  await signInAs(page, superAdmin, "/registers/funerals");
  await expect(page.getByRole("heading", { level: 1, name: "Funeral register" })).toBeVisible();
  await s(page, "funeral-register", project);

  await page.getByRole("link", { name: "Record a funeral" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Record a funeral" })).toBeVisible();
  await expect(page.locator('form[data-ready="yes"]').filter({ visible: true })).toBeVisible();
  await page.getByLabel("Date of the janazah").fill(addDays(todayInDublin(), -2));
  // The rota look-up for that date ticks whoever was on call; wait for it.
  await expect(page.locator('form[data-ready="yes"]').filter({ visible: true })).toBeVisible();
  await page.getByLabel("Name of the person who died").fill(name);
  await page.getByLabel("Family contact", { exact: true }).fill("Test run family contact");
  await page.getByLabel(/Family contact.s phone/).fill("01 000 4321");
  await page.getByLabel("Ghusl").check();
  const duty = page.getByTestId("on-duty").locator('input[name="on_duty"]');
  await expect(duty.first()).toBeVisible();
  if ((await page.getByTestId("on-duty").locator('input[name="on_duty"]:checked').count()) === 0) await duty.first().check();
  await s(page, "record-funeral", project);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByTestId("notice")).toHaveText(/database gave it the number/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  const number = (await page.getByTestId("entry-number").textContent())!.trim();
  expect(number).toMatch(/^FU-\d{4}-\d{4,}$/);
  await expect(page.getByTestId("entry-facts")).toContainText("Ghusl, Janazah prayer");
  await s(page, "funeral-entry", project);

  // A mistake: correct it. The number stays and the old version stays.
  await page.getByRole("link", { name: "Correct this entry" }).click();
  await expect(page.locator('form[data-ready="yes"]').filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("Name of the person who died")).toHaveValue(name);
  await page.getByLabel("Name of the person who died").fill(`${name} corrected`);
  await page.getByLabel("What was wrong?").fill("Test: name misspelt");
  await s(page, "correct-funeral", project);
  await page.getByRole("button", { name: "Save the correction" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Correction saved/);
  await expect(page.getByTestId("entry-number")).toHaveText(number);
  const history = page.getByTestId("entry-history");
  await expect(history).toContainText("Correction 1");
  await expect(history).toContainText("What was wrong: Test: name misspelt");
  await expect(history).toContainText("Changed: Person who died.");
  await s(page, "funeral-corrected", project);

  // It should never have been made: cancel it, with a reason.
  await page.getByText("Cancel this entry").click();
  await page.getByLabel("Why is it cancelled?").fill("Test: entered twice");
  await page.getByRole("button", { name: "Cancel the entry" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Entry cancelled/);
  await expect(page.getByTestId("cancelled-note")).toContainText("Reason: Test: entered twice");
  await expect(page.getByRole("link", { name: "Correct this entry" })).toHaveCount(0);
  await s(page, "funeral-cancelled", project);

  // The list hides it unless "Cancelled" is chosen; search finds it by number.
  await page.goto(`/registers/funerals?q=${number}`);
  await expect(page.getByTestId("register-count")).toHaveText("No entries match.");
  await page.goto(`/registers/funerals?q=${number}&show=all`);
  await expect(page.getByTestId("register-row").filter({ visible: true })).toHaveCount(1);
  await expect(page.getByTestId("register-row").filter({ visible: true })).toContainText("Cancelled");
});

test("Shahada and Nikah registers: the 18-or-over tick is required", async ({ page }, info) => {
  const project = info.project.name;
  const stamp = `${Date.now()} ${project}`;
  await signInAs(page, superAdmin, "/registers/shahada/new");
  await expect(page.locator('form[data-ready="yes"]').filter({ visible: true })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(`Test run ${stamp} new Muslim`);
  await pickFirstPerson(page, "Authenticating imam");
  await page.getByLabel(/First witness/).fill("Test run witness one");
  await s(page, "record-shahada", project);
  await page.getByRole("button", { name: "Save" }).click();
  // The browser itself asks for the tick first.
  await expect(page).toHaveURL(/\/registers\/shahada\/new$/);
  await page.getByLabel("The person is 18 or over.").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/database gave it the number/);
  await expect(page.getByTestId("entry-number")).toHaveText(/^SH-\d{4}-\d{4,}$/);
  await s(page, "shahada-entry", project);

  await page.goto("/registers/nikah/new");
  await expect(page.locator('form[data-ready="yes"]').filter({ visible: true })).toBeVisible();
  await page.getByLabel("First spouse").fill(`Test run ${stamp} spouse one`);
  await page.getByLabel("Second spouse").fill(`Test run ${stamp} spouse two`);
  await pickFirstPerson(page, "Officiant");
  await page.getByLabel("First witness").fill("Test run witness one");
  await page.getByLabel("Second witness").fill("Test run witness two");
  await page.getByLabel("Yes", { exact: true }).check();
  await page.getByLabel("Both spouses are 18 or over.").check();
  await s(page, "record-nikah", project);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("entry-number")).toHaveText(/^NK-\d{4}-\d{4,}$/);
  await expect(page.getByTestId("entry-facts")).toContainText("Also a civil marriage");
  await s(page, "nikah-entry", project);

  await page.goto("/registers/nikah");
  await expect(page.getByTestId("register-row").filter({ visible: true }).first()).toBeVisible();
  await s(page, "nikah-register", project);
  if (!isPhone(page)) {
    await expect(page.getByTestId("sidebar").getByRole("link", { name: "Nikah" })).toBeVisible();
    await s(page, "menu-super-admin", project);
  }
});

test("a Centre Admin cannot see the registers", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/registers/funerals");
  await expect(page.getByTestId("cannot-see-registers")).toBeVisible();
  await expect(page.getByRole("link", { name: "Record a funeral" })).toHaveCount(0);
  if (!isPhone(page)) await expect(page.getByTestId("sidebar").getByText("Service registers")).toHaveCount(0);
  await s(page, "centre-admin-refused", project);
  for (const path of ["/registers/shahada/new", "/registers/nikah/1"]) {
    await page.goto(path);
    await expect(page.getByTestId("cannot-see-registers")).toBeVisible();
  }
});
