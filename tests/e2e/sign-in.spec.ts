// Slice 3 in a real browser, on a PC-sized and a phone-sized window.
// Every screen is saved to docs/screens/ as it is tested.
import { expect, test } from "@playwright/test";
import { seedAdmin, SEED_ADMINS } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { createNewTestAdmin, enterCode, enterPassword, expectSignInPage, shot, signOutHere } from "./helpers";

const superAdmin = seedAdmin("super_admin");
const centreAdmin = seedAdmin("centre_admin");
const secondAdmin = SEED_ADMINS.find((a) => a.email.startsWith("second."))!;
const deactivated = seedAdmin("centre_admin", false);

test("a signed-out visitor scanning a label sees only the sign-in page", async ({ page }, info) => {
  await page.goto("/items/ICCI-000123");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fitems%2FICCI-000123$/);
  await expectSignInPage(page);
  await expect(page.getByRole("img", { name: /Islamic Cultural Centre of Ireland logo/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/sign up|create account/i)).toHaveCount(0);
  await shot(page, "sign-in", info.project.name);

  // The code and set-up pages cannot be opened without a password either.
  await page.goto("/sign-in/code");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a wrong password shows one plain message", async ({ page }, info) => {
  await page.goto("/sign-in");
  await enterPassword(page, superAdmin.email, "Test-wrong-password-1");
  await expect(page.getByTestId("form-error")).toHaveText(/That email and password do not match/);
  await expect(page).toHaveURL(/\/sign-in$/);
  await shot(page, "sign-in-wrong-password", info.project.name);
});

test("signing in needs the password and the authenticator code, then Sign out works", async ({ page }, info) => {
  await page.goto("/");
  await enterPassword(page, superAdmin.email);
  await expect(page).toHaveURL(/\/sign-in\/code/);
  await expect(page.getByRole("heading", { level: 1, name: "Enter your code" })).toBeVisible();
  await shot(page, "code", info.project.name);

  // Password alone does not open the home page.
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\/code/);

  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("form-error")).toHaveText(/That code did not work/);
  await shot(page, "code-wrong", info.project.name);

  await enterCode(page, testAuthenticatorSecret(superAdmin.email));
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByTestId("signed-in-name")).toHaveText(superAdmin.displayName);
  await expect(page.getByTestId("signed-in-role")).toHaveText("Super Admin");
  await expect(page.getByRole("img", { name: /Islamic Cultural Centre of Ireland logo/ })).toBeVisible();
  await shot(page, "home-signed-in", info.project.name);

  await signOutHere(page);
  await expect(page).toHaveURL(/\/sign-in\?reason=signed-out/);
  await expect(page.getByRole("status")).toHaveText("You have signed out.");
  await shot(page, "signed-out", info.project.name);

  await page.goto("/");
  await expectSignInPage(page);
});

test("first sign-in sets up the authenticator app", async ({ page }, info) => {
  const email = await createNewTestAdmin();
  await page.goto("/");
  await enterPassword(page, email);
  await expect(page).toHaveURL(/\/sign-in\/set-up/);
  await expect(page.getByRole("heading", { level: 1, name: "Set up two-factor sign-in" })).toBeVisible();
  await shot(page, "set-up-start", info.project.name);
  await page.getByRole("button", { name: "Show my QR code" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  await shot(page, "set-up", info.project.name);

  const key = (await page.getByTestId("setup-key").innerText()).replace(/\s/g, "");
  await enterCode(page, key, "Finish set-up");
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("signed-in-name")).toHaveText(/New Admin$/);

  // Once set up, the set-up page cannot be used to add a second phone.
  await page.goto("/sign-in/set-up");
  await expect(page).toHaveURL("/");
});

test("after 15 minutes without activity the admin is signed out", async ({ page }, info) => {
  await page.clock.install();
  await page.goto("/");
  await enterPassword(page, centreAdmin.email);
  await enterCode(page, testAuthenticatorSecret(centreAdmin.email));
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();

  // 14 minutes idle: still signed in. Moving the mouse restarts the 15 minutes.
  await page.clock.fastForward("14:00");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await page.mouse.move(50, 300);
  await page.mouse.move(80, 320);
  await page.clock.fastForward("14:00");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();

  // Now a further minute and a bit: 15 minutes since the last activity.
  await page.clock.fastForward("01:30");
  await expect(page).toHaveURL(/\/sign-in\?reason=idle/, { timeout: 15_000 });
  await expect(page.getByRole("status")).toHaveText(/signed out after 15 minutes of inactivity/);
  await shot(page, "idle-signed-out", info.project.name);

  // The sign-in really ended on the server, not just on screen.
  await page.goto("/");
  await expectSignInPage(page);
});

test("a page reopened after 15 minutes is signed out", async ({ page, context }) => {
  await page.goto("/");
  await enterPassword(page, secondAdmin.email);
  await enterCode(page, testAuthenticatorSecret(secondAdmin.email));
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();

  // As if the laptop lid was closed 16 minutes ago. Leave the page first, so
  // its own "active now" note (written when it opens) cannot land after ours.
  const { hostname } = new URL(page.url());
  await page.goto("about:blank");
  await context.addCookies([
    { name: "icci_last_active", value: String(Date.now() - 16 * 60_000), domain: hostname, path: "/" },
  ]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?reason=idle/);
  await page.goto("/");
  await expectSignInPage(page);
});

test("a switched-off account is refused even with the right code", async ({ page }, info) => {
  await page.goto("/");
  await enterPassword(page, deactivated.email);
  await enterCode(page, testAuthenticatorSecret(deactivated.email));
  await expect(page).toHaveURL(/\/sign-in\?reason=no-access/);
  await expect(page.getByRole("status")).toHaveText(/does not have access/);
  await shot(page, "no-access", info.project.name);
  await page.goto("/");
  await expectSignInPage(page);
});
