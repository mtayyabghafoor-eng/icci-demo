// Round C5 in a real browser: the accounts screen and the audit log screen.
//   * Only a Super Admin sees them (menu and address).
//   * A Super Admin adds an account; its temporary password is shown once.
//   * The new person signs in with it, sets up their authenticator, chooses
//     their own password, and only then gets in.
//   * A new temporary password, a two-factor reset and switching off, each
//     after "Are you sure?" where it cannot be undone, and each written down.
//   * After 24 hours a temporary password is refused.
// Made-up accounts only (test-run-...@icci-prototype.test). Screens saved to docs/screens/.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { secondsLeftInWindow, totp } from "../../scripts/totp.mts";
import { completeSignIn, confirmSheet, enterPassword, expectSignInPage, mainMenu, shot } from "./helpers";

const superAdmin = seedAdmin("super_admin");
const centre = seedAdmin("centre_admin");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "c5");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
}

/** Adds a made-up Finance account from the screen; returns its email, id and temporary password. */
async function addAccount(page: Page, project: string, shots = false) {
  const email = `test-run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@icci-prototype.test`;
  await page.goto("/accounts/new");
  await page.getByLabel("Name to show").fill(`Test run ${project} Finance Helper`);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("radio", { name: /^Finance/ }).check();
  if (shots) await s(page, "add-account", project);
  await page.getByRole("button", { name: "Add the account" }).click();
  const shown = page.getByTestId("shown-once");
  await expect(shown).toBeVisible();
  await expect(shown).toContainText(email);
  const password = (await page.getByTestId("temporary-password").innerText()).trim();
  expect(password).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
  if (shots) await s(page, "temporary-password-shown-once", project);
  await shown.getByRole("link", { name: "Open the account" }).click();
  await expect(page).toHaveURL(/\/accounts\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  return { email, id, password };
}

/** The new person's first sign-in, in a browser of their own. */
async function firstSignIn(browser: Browser, email: string, password: string, project: string, shots = false) {
  const ctx = await browser.newContext({ viewport: project === "phone" ? { width: 412, height: 915 } : { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await enterPassword(page, email, password);
  await expect(page).toHaveURL(/\/sign-in\/set-up/);
  await page.getByRole("button", { name: "Show my QR code" }).click();
  const key = (await page.getByTestId("setup-key").innerText()).replace(/\s/g, "");
  // Typed here rather than with enterCode: that helper expects to leave the
  // sign-in pages, but the next step (choose your password) is one of them.
  if (secondsLeftInWindow() < 4) await page.waitForTimeout(secondsLeftInWindow() * 1000 + 500);
  await page.getByLabel("6-digit code").fill(totp(key));
  await page.getByRole("button", { name: "Finish set-up" }).click();
  // Not in yet: their own password first.
  await expect(page).toHaveURL(/\/sign-in\/new-password/);
  await expect(page.getByRole("heading", { level: 1, name: "Choose Your Password" })).toBeVisible();
  if (shots) await s(page, "choose-your-password", project);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("The same password again").fill(password);
  await page.getByRole("button", { name: "Save my password and continue" }).click();
  await expect(page.getByTestId("form-error")).toContainText(/different from the temporary one|could not be saved/);
  const own = `Own${Date.now()}pass`;
  await page.getByLabel("New password").fill(own);
  await page.getByLabel("The same password again").fill(own);
  await page.getByRole("button", { name: "Save my password and continue" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("signed-in-name")).toHaveText(/Finance Helper$/);
  await ctx.close();
}

test.describe("accounts and the audit log", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop" && test.info().title.includes("only"), "Once is enough."));

  test("a Centre Admin has neither: not in the menu, and the addresses say so", async ({ page }, info) => {
    await signInAs(page, centre, "/accounts");
    await expect(page.getByTestId("cannot-see-accounts")).toBeVisible();
    await page.goto("/audit-log");
    await expect(page.getByTestId("cannot-see-audit-log")).toBeVisible();
    const menu = await mainMenu(page);
    await expect(menu.getByRole("link", { name: "Accounts" })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Audit log" })).toHaveCount(0);
    await s(page, "audit-log-centre-admin", info.project.name);
  });

  test("a Super Admin adds an account; the new person sets up, chooses a password and gets in", async ({ page, browser }, info) => {
    const project = info.project.name;
    await signInAs(page, superAdmin, "/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
    await expect(page.getByTestId("account-row").filter({ visible: true }).first()).toBeVisible();
    await s(page, "accounts", project);

    const a = await addAccount(page, project, true);
    await expect(page.getByText("Waiting for first sign-in").first()).toBeVisible();
    await s(page, "account-waiting", project);

    await firstSignIn(browser, a.email, a.password, project, true);

    await page.reload();
    await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("account-history")).toContainText("First sign-in finished");
    await s(page, "account-active", project);
  });

  test("a new temporary password, a two-factor reset and switching off, each written down", async ({ page, browser }, info) => {
    const project = info.project.name;
    await signInAs(page, superAdmin, "/accounts");
    const a = await addAccount(page, project);
    await firstSignIn(browser, a.email, a.password, project);
    await page.goto(`/accounts/${a.id}`);

    // Lost phone: two-factor reset, after "Are you sure?".
    await page.getByTestId("reset-two-factor-button").click();
    await confirmSheet(page);
    await expect(page.getByTestId("notice")).toContainText("Two-factor reset");
    await expect(page.getByText("Authenticator to set up").first()).toBeVisible();

    // Forgotten password: a new temporary one, shown once.
    await page.getByTestId("temporary-password-button").click();
    await confirmSheet(page);
    await expect(page.getByTestId("shown-once")).toBeVisible();
    await expect(page.getByTestId("temporary-password")).toHaveText(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    await s(page, "new-temporary-password", project);

    // Switched off: it is written down, and can be switched back on.
    await page.goto(`/accounts/${a.id}`);
    await page.getByTestId("switch-off").click();
    await expect(page.getByTestId("notice")).toContainText("switched off");
    const history = page.getByTestId("account-history");
    for (const line of ["Switched off", "New temporary password given", "Two-factor reset", "First sign-in finished", "Account added"]) {
      await expect(history).toContainText(line);
    }
    await s(page, "account-history", project);
  });

  test("a Super Admin cannot change their own account here", async ({ page }) => {
    await signInAs(page, superAdmin, "/accounts");
    const { data } = await master().from("app_users").select("id").eq("display_name", "Test Super Admin").single();
    await page.goto(`/accounts/${data!.id}`);
    await expect(page.getByTestId("own-account-note")).toBeVisible();
    await expect(page.getByTestId("switch-off")).toHaveCount(0);
    await expect(page.getByTestId("reset-two-factor-button")).toHaveCount(0);
  });

  test("after 24 hours a temporary password is refused", async ({ page }) => {
    await signInAs(page, superAdmin, "/accounts");
    const a = await addAccount(page, "desktop");
    // This PC's master key moves the time back, to stand for a day passing.
    const back = await master().from("app_users").update({ temporary_password_until: new Date(Date.now() - 60_000).toISOString() }).eq("id", a.id);
    expect(back.error).toBeNull();
    await page.context().clearCookies();
    await page.goto("/");
    await enterPassword(page, a.email, a.password);
    await expect(page.getByTestId("form-error")).toContainText("has run out");
  });

  test("the audit log: every change, newest first, filtered by table", async ({ page }, info) => {
    await signInAs(page, superAdmin, "/audit-log");
    await expect(page.getByRole("heading", { level: 1, name: "Audit Log" })).toBeVisible();
    await expect(page.getByTestId("audit-entry").first()).toBeVisible();
    await expect(page.getByTestId("audit-count")).toHaveText(/[\d,]+ entries/);
    await s(page, "audit-log", info.project.name);
    await page.goto("/audit-log?table=app_users");
    for (const entry of await page.getByTestId("audit-entry").allInnerTexts()) expect(entry).toContain("in app_users");
    const menu = await mainMenu(page);
    await expect(menu.getByRole("link", { name: "Audit log" })).toBeVisible();
  });
});
