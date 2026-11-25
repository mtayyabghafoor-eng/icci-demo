// Slice A1 in a real browser, on a PC-sized and a phone-sized window: a
// refusal ("Nobody can record their own Garda vetting") is red, is read out
// as an alert, and stays on the page; a success is green and floats away.
// Finance's "cannot see" note is grey, not green. Screens saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

async function firstPersonPath(page: Page): Promise<string> {
  // A PC row holds a link; a phone card is the link itself.
  const link = page.locator('[data-testid="person-row"] a[href^="/people/"], a[data-testid="person-row"]').filter({ visible: true }).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/people\/[0-9a-f-]{36}$/);
  return href!;
}

test("a refusal is red and stays; a success is green and floats away", async ({ page }, info) => {
  await signInAs(page, centre, "/people");
  const person = await firstPersonPath(page);

  await page.goto(`${person}?done=own-vetting`);
  const refusal = page.getByTestId("notice");
  await expect(refusal).toHaveText(/Nobody can record or withdraw their own Garda vetting/);
  await expect(refusal).toHaveAttribute("role", "alert");
  await expect(refusal).toHaveClass(/icci-bad-fill/);
  await expect(page.locator(".icci-toast")).toHaveCount(0);
  // The whole page, not only the message, before the picture is taken.
  await expect(page.getByTestId("person-vetting").or(page.getByRole("heading", { level: 1 })).first()).toBeVisible();
  await expect(page.getByText("Loading…", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await shot(page, "refusal-red", info.project.name, "a1");
  // A saved message would have gone by now; a refusal is still there.
  await page.waitForTimeout(9_000);
  await expect(refusal).toBeVisible();

  await page.goto(`${person}?done=saved`);
  const saved = page.getByTestId("notice");
  await expect(saved).toHaveText("Changes saved.");
  await expect(saved).toHaveAttribute("role", "status");
  await expect(saved).toHaveClass(/icci-ok-fill/);
  await expect(page.locator(".icci-toast")).toHaveCount(1);
  // Closing it tidies the address, so a reload does not bring it back.
  await page.getByRole("button", { name: "Close this message" }).click();
  await expect(page).not.toHaveURL(/done=/);
  await page.reload();
  await expect(page.getByTestId("notice")).toHaveCount(0);
});

test("Finance's cannot-see note is grey, not green", async ({ page }, info) => {
  await signInAs(page, finance, "/people");
  const note = page.getByTestId("cannot-see-people");
  await expect(note).toHaveText(/Only a Super Admin or Centre Admin/);
  await expect(note).toHaveClass(/icci-none-fill/);
  await shot(page, "cannot-see-grey", info.project.name, "a1");
});
