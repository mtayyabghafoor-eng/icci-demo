import { expect, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readTestAuthenticators } from "../../scripts/test-authenticators.mts";
import { secondsLeftInWindow, totp } from "../../scripts/totp.mts";
import { withFileLockRetry } from "./retry";

export const PASSWORD = () => process.env.TEST_USER_PASSWORD!;

/**
 * A database client signed in as a fictional seed admin (password and test
 * authenticator), for setting up made-up records before a browser test, the
 * same way the seed script does. The database's own rules apply.
 */
export async function apiAs(email: string): Promise<SupabaseClient> {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await c.auth.signInWithPassword({ email, password: PASSWORD() });
  if (signIn.error) throw signIn.error;
  const key = readTestAuthenticators()[email];
  const v = await c.auth.mfa.challengeAndVerify({ factorId: key.factorId, code: totp(key.secret) });
  if (v.error) throw v.error;
  return c;
}

/**
 * Saves a screenshot to docs/screens/. Authenticator keys and their QR codes
 * are blacked out, so no key (even a fictional one) is ever committed. Label
 * QR codes hold only a link with the label number, so they are shown.
 */
export function shot(page: Page, name: string, project: string, slice = "03") {
  // Tried up to three times if Windows briefly locks the file (see retry.ts).
  return withFileLockRetry(() => page.screenshot({
    path: `docs/screens/slice-${slice}-${name}-${project}.png`,
    fullPage: true,
    // One image pixel per screen point. A phone has about three real pixels
    // per point, which made long phone lists 20,000-pixel images that took
    // over 15 seconds to save. PC screenshots are the same either way.
    scale: "css",
    timeout: 60_000,
    // Round C5: temporary passwords are blacked out too (made up, but never committed).
    mask: [page.getByTestId("setup-key"), page.getByRole("img", { name: /authenticator app/ }), page.getByTestId("temporary-password")],
    maskColor: "#1F2A27",
    // Do not let the screenshot tool restyle the text cursor (React notices the change).
    caret: "initial",
  }));
}

export async function enterPassword(page: Page, email: string, password = PASSWORD()) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Types the current authenticator code. If the code is about to change it
 * waits for the new one. If Supabase refuses a code that was just used
 * (another test used the same one), it waits for the next and tries again.
 */
export async function enterCode(page: Page, secret: string, button: "Continue" | "Finish set-up" = "Continue") {
  // The code page first asks the cloud sign-in service about the account,
  // which now and then takes longer than the usual 5 seconds.
  await expect(page.getByLabel("6-digit code")).toBeVisible({ timeout: 30_000 });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (secondsLeftInWindow() < 4) await wait(secondsLeftInWindow() * 1000 + 500);
    await page.getByLabel("6-digit code").fill(totp(secret));
    const answered = page.waitForResponse((r) => r.request().method() === "POST");
    await page.getByRole("button", { name: button }).click();
    await answered;
    const signedIn = await page
      .waitForURL((u) => !u.pathname.startsWith("/sign-in/"), { timeout: 10_000 })
      .then(() => true, () => false);
    // Left the code page (signed in, or refused for another reason): the
    // calling test checks where it ended up.
    if (signedIn || !page.url().includes("/sign-in/")) return;
    await wait(secondsLeftInWindow() * 1000 + 500);
  }
  throw new Error("Authenticator code refused twice");
}

/** A new fictional admin with no authenticator yet (for the first-time set-up test). */
export async function createNewTestAdmin(): Promise<string> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `test-run-${stamp}@icci-prototype.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD(),
    email_confirm: true,
    user_metadata: { display_name: "Test run new admin", test_run: true },
  });
  if (error) throw error;
  const insert = await admin
    .from("app_users")
    .insert({ id: data.user.id, display_name: `Test run ${stamp} New Admin`, role: "centre_admin" });
  if (insert.error) throw insert.error;
  return email;
}

export async function expectSignInPage(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
}

/** Signs in fully (password and authenticator code) from the sign-in page. */
export async function completeSignIn(page: Page, email: string, secret: string) {
  await enterPassword(page, email);
  await enterCode(page, secret);
}

/** A new, unassigned fictional label: the next number, handed out by the database. */
export async function newTestLabel(): Promise<string> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc("print_new_labels", { p_count: 1 });
  if (error) throw new Error(`Could not create a test label: ${error.message}`);
  return `ICCI-${String((data as { first_number: number }).first_number).padStart(6, "0")}`;
}

/**
 * The main menu: the sidebar on a PC or tablet; on a phone the Menu button
 * in the bottom bar opens it as a sheet first.
 */
export async function mainMenu(page: Page) {
  const sidebar = page.getByTestId("sidebar");
  // Wait until the signed-in page has drawn its sidebar or its bottom bar.
  await expect(sidebar.or(page.getByTestId("bottom-bar")).filter({ visible: true })).toHaveCount(1);
  if (await sidebar.isVisible()) return sidebar.getByRole("navigation", { name: "Main" });
  await page.getByTestId("bottom-bar").getByRole("button", { name: "Menu" }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  return sheet.getByRole("navigation", { name: "Main" });
}

/** Opens a page from the main menu, unfolding its group first if it is closed (UI-9). */
export async function clickMenuLink(page: Page, name: string) {
  const menu = await mainMenu(page);
  await openMenuGroups(menu);
  await menu.getByRole("link", { name, exact: true }).click();
}

/** UI-9: unfolds every closed menu group, so all links can be found by name. */
export async function openMenuGroups(menu: Locator) {
  const closed = menu.locator('button[aria-expanded="false"]');
  for (let n = await closed.count(); n > 0; n = await closed.count()) {
    await closed.first().click();
  }
}

/** Checks the menu marks this link as the current page, then closes the phone sheet. */
export async function expectCurrentMenuLink(page: Page, name: string) {
  const menu = await mainMenu(page);
  await expect(menu.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  const close = page.getByRole("button", { name: "Close the menu" });
  if (await close.isVisible()) await close.click();
}

/** On a phone the drop-down filters of a list fold away; open them first. */
export async function showFilters(page: Page) {
  // Only phones fold the filters away (below 768 pixels wide, "md").
  const width = page.viewportSize()?.width ?? 1280;
  if (width >= 768) return;
  // A2: a list with drop-downs only (no search box) shows them straight away.
  const form = page.locator("form.list-filters").first();
  await expect(form).toBeVisible();
  if ((await form.locator('input:not([type]), input[type="search"], input[type="text"]').count()) === 0) return;
  // Wait for the button, and click again if the first click came before the
  // page was ready to respond (seen once in a full run, session 32).
  const fold = page.getByRole("button", { name: /^(More|Fewer) filters/ });
  await expect(async () => {
    if ((await fold.getAttribute("aria-expanded")) !== "true") await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Signs in the Library Operator's way (slice P4.1): email address, then the
 * emailed 6-digit code. No email is sent: the code is asked for with the
 * master key, as if read from the email.
 */
export async function signInWithEmailCode(page: Page, email: string) {
  await page.goto("/sign-in/library");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page).toHaveURL(/\/sign-in\/library\/code/);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.email_otp) throw new Error(`No emailed code for ${email}: ${error?.message}`);
  await page.getByLabel("6-digit code").fill(data.properties.email_otp);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}

/**
 * Slice A1: a permanent action asks once more in a small sheet. Checks the
 * sheet is open and presses its "Yes, …" button.
 */
export async function confirmSheet(page: Page) {
  const sheet = page.locator("dialog[open]");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("confirm-yes").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}
