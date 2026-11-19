// Slice P4.1 in a real browser: the Library Operator signs in with an
// emailed 6-digit code, on a PC-sized and a phone-sized window. No email is
// sent: Supabase refuses ".test" addresses, so the test asks for the code
// directly with the master key, as if reading it from the email.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { mainMenu, shot } from "./helpers";

const operator = seedAdmin("library_operator");
const formerOperator = seedAdmin("library_operator", false);
const centreAdmin = seedAdmin("centre_admin");
const SLICE = "p4-1";

/** The newest emailed code for this account (what the email would show). */
async function emailedCode(email: string): Promise<string> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.email_otp) throw new Error(`No code for ${email}: ${error?.message}`);
  return data.properties.email_otp;
}

async function askForCode(page: Page, email: string) {
  await page.goto("/sign-in/library");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page).toHaveURL(/\/sign-in\/library\/code$/);
  await expect(page.getByRole("heading", { level: 1, name: "Check Your Email" })).toBeVisible();
}

async function typeCode(page: Page, code: string) {
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("the sign-in page leads to the library sign-in", async ({ page }, info) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Sign in with an emailed code" }).click();
  await expect(page).toHaveURL(/\/sign-in\/library$/);
  await expect(page.getByRole("heading", { level: 1, name: "Library Sign In" })).toBeVisible();
  await expect(page.locator("input[type=password]").filter({ visible: true })).toHaveCount(0);
  await shot(page, "library-sign-in", info.project.name, SLICE);

  // The code page cannot be opened without asking for a code first.
  await page.goto("/sign-in/library/code");
  await expect(page).toHaveURL(/\/sign-in\/library$/);
});

test("the Library Operator signs in with an emailed code and sees only the library", async ({ page }, info) => {
  await askForCode(page, operator.email);
  // The address bar never holds the email address.
  expect(page.url()).not.toContain("library%40");
  expect(page.url()).not.toContain("@");
  await expect(page.getByTestId("pending-email")).toHaveText(operator.email);
  await shot(page, "library-code", info.project.name, SLICE);

  await typeCode(page, "000000");
  await expect(page.getByTestId("form-error")).toHaveText(/That code did not work/);
  await shot(page, "library-code-wrong", info.project.name, SLICE);

  await typeCode(page, await emailedCode(operator.email));
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("no-counters")).toHaveText(/signed in to the library/);
  await expect(page.getByTestId("signed-in-role")).toHaveText("Library Operator");
  await shot(page, "library-home", info.project.name, SLICE);

  // Only Home and the library in the menu (P4.2); other screens say "cannot see".
  const menu = await mainMenu(page);
  await expect(menu.getByRole("link")).toHaveText(["Home", "Library", "Add a book", "Lend", "Return", "Borrowers", "On loan", "Overdue", "Most borrowed", "Lost and withdrawn"]);
  const close = page.getByRole("button", { name: "Close the menu" });
  if (await close.isVisible()) await close.click();
  await page.goto("/people");
  await expect(page.getByTestId("cannot-see-people")).toBeVisible();

  await page.goto("/sign-out");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("an admin cannot use an emailed code instead of password and authenticator", async ({ page }, info) => {
  await askForCode(page, centreAdmin.email);
  await typeCode(page, await emailedCode(centreAdmin.email));
  await expect(page).toHaveURL(/\/sign-in\?reason=email-code-refused$/);
  await expect(page.getByRole("status")).toHaveText(/did not give access/);
  await shot(page, "library-admin-refused", info.project.name, SLICE);

  // And is really signed out: Home leads back to sign-in.
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
});

test("a switched-off Library Operator is refused, even with a genuine code", async ({ page }) => {
  await askForCode(page, formerOperator.email);
  await typeCode(page, await emailedCode(formerOperator.email));
  await expect(page).toHaveURL(/\/sign-in\?reason=email-code-refused$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
});

test("an unknown address sees the same page as a real one", async ({ page }) => {
  await askForCode(page, "nobody-at-all@icci-prototype.test");
  await expect(page.getByTestId("pending-email")).toHaveText("nobody-at-all@icci-prototype.test");
  await expect(page.getByTestId("form-error")).toHaveCount(0);
});
