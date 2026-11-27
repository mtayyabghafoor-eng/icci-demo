// Slice 9 in a real browser, on a PC-sized and a phone-sized window: the home
// page counters show the same numbers as their lists and open them. Finance
// sees a short note instead. Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");

async function s(page: Page, name: string, project: string) {
  await expect(page.getByText(/^Loading/)).toHaveCount(0);
  await shot(page, name, project, "09");
}

async function signInAtHome(page: Page, who: { email: string }) {
  await page.goto("/");
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
}

const count = async (page: Page, id: string) =>
  Number(await page.getByTestId(`counter-${id}`).getByTestId("count").textContent());

test("home page counters match their lists and open them", async ({ page }, info) => {
  await signInAtHome(page, centre);
  for (const id of ["low-stock", "missing-damaged"]) {
    await expect(page.getByTestId(`counter-${id}`)).toBeVisible();
  }
  // D1: the approval queues are only in their own box, never also in the list.
  for (const id of ["corrections-for-me", "disposals-for-me", "stocktake-for-me", "expenses-for-me"]) {
    await expect(page.getByTestId(`counter-${id}`)).toHaveCount(0);
  }
  await s(page, "home-counters", info.project.name);

  // UI-4: a greeting with the admin's name and one plain sentence.
  await expect(page.getByTestId("greeting")).toContainText(centre.displayName);
  await expect(page.getByTestId("greeting")).toContainText(/Good (morning|afternoon|evening)/);
  // E1: only red things are urgent, each said in words too, not by colour alone.
  const urgentRegion = page.getByRole("region", { name: "Urgent" });
  const urgentRows = urgentRegion.locator("[data-tone]");
  const tones = await urgentRows.evaluateAll((els) => els.map((e) => e.getAttribute("data-tone")));
  expect(tones.every((t) => t === "red")).toBe(true);
  const urgent = tones.length;
  await expect(page.getByTestId("attention-line")).toHaveText(
    urgent === 0 ? "Nothing is urgent today." : `${urgent} ${urgent === 1 ? "thing is" : "things are"} urgent today.`,
  );
  for (const row of await urgentRows.all()) await expect(row).toContainText(/urgent/i);

  // E1 (owner, 27 Nov 2026): backlogs and plain totals sit in a quiet row, never red or amber.
  const quiet = page.getByRole("region", { name: "Everything else" });
  for (const id of ["counter-low-stock", "counter-missing-damaged", "headline-items", "headline-people", "headline-books"]) {
    await expect(quiet.getByTestId(id)).toBeVisible();
  }
  const alarm = ["rgb(179, 38, 30)", "rgb(138, 90, 0)", "rgb(251, 231, 229)", "rgb(251, 241, 220)"];
  const colours = await quiet.locator("a, a *").evaluateAll((els) =>
    els.flatMap((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]),
  );
  expect(colours.filter((c) => alarm.includes(c))).toEqual([]);
  await expect(quiet.locator("[data-tone]")).toHaveCount(0);

  // E1: nothing is counted twice anywhere on Home.
  const ids = await page.locator('[data-testid^="counter-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(new Set(ids).size).toBe(ids.length);
  await expect(page.getByTestId("headline-approvals")).toBeVisible();
  await expect(page.getByTestId("headline-low-stock")).toHaveCount(0);

  // E1 (owner): on a phone, Urgent comes before Quick actions, which come before the approvals.
  const top = async (name: string) => (await page.getByRole("region", { name, exact: true }).boundingBox())!.y;
  // On a PC they sit side by side (Urgent on the left), so level is fine there.
  if (info.project.name === "phone") {
    expect(await top("Urgent")).toBeLessThan(await top("Quick actions"));
    expect(await top("Quick actions")).toBeLessThan(await top("For you to approve"));
  } else {
    expect(await top("Urgent")).toBeLessThanOrEqual(await top("Quick actions"));
  }
  for (const action of ["Register an item", "Register a room", "Report a problem", "Move or report an asset"]) {
    await expect(page.getByRole("link", { name: new RegExp(`^${action}`) }).last()).toBeVisible();
  }
  await expect(page.getByRole("link", { name: /^Weekly count/ })).toBeHidden();
  await page.getByText("More actions", { exact: true }).click();
  for (const action of ["Weekly count", "Stocktake", "Garda vetting", "Print labels"]) {
    await expect(page.getByRole("link", { name: new RegExp(`^${action}`) }).last()).toBeVisible();
  }

  // Low stock: the same number as the list says.
  const low = await count(page, "low-stock");
  await page.getByTestId("counter-low-stock").click();
  await expect(page.getByRole("heading", { level: 1, name: "Low stock" })).toBeVisible();
  await expect(page.getByTestId("low-count")).toHaveText(
    low === 0 ? /Nothing is low/ : new RegExp(`^${low} items? (is|are) low or out`),
  );

  // Missing or damaged opens its list.
  await page.goto("/");
  await page.getByTestId("counter-missing-damaged").click();
  await expect(page.getByRole("heading", { level: 1, name: "Missing and damaged" })).toBeVisible();

  // Waiting for you: opens the approvals list.
  await page.goto("/");
  const disposals = page.getByTestId("headline-approvals").getByRole("link", { name: /Disposals/ });
  if (await disposals.count()) {
    await disposals.click();
    await expect(page.getByRole("heading", { level: 1, name: "Disposals waiting" })).toBeVisible();
  }
});

test("finance sees its expense counters instead of the Centre's (P5.3)", async ({ page }, info) => {
  await signInAtHome(page, finance);
  await expect(page.getByTestId("headline-expenses-for-me")).toBeVisible();
  await expect(page.getByTestId("greeting")).toContainText(finance.displayName);
  // No quick actions for a role that cannot use them.
  await expect(page.getByRole("link", { name: /^Register an item/ })).toHaveCount(0);
  await expect(page.getByTestId("counter-low-stock")).toHaveCount(0);
  await s(page, "home-finance", info.project.name);
});

test("a signed-out visitor opening the home page sees only the sign-in page", async ({ page }) => {
  await page.goto("/");
  await expectSignInPage(page);
  await expect(page.getByTestId("counter-low-stock")).toHaveCount(0);
});
