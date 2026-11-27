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

  // UI-4: a greeting with the admin's name, one plain sentence, quick actions.
  await expect(page.getByTestId("greeting")).toContainText(centre.displayName);
  await expect(page.getByTestId("greeting")).toContainText(/Good (morning|afternoon|evening)/);
  const attentionCards = page.getByRole("region", { name: "Needs attention" }).getByRole("link");
  // D1: "2 urgent, 5 to do."
  const tones = await attentionCards.evaluateAll((els) => els.map((e) => e.getAttribute("data-tone")));
  const urgent = tones.filter((t) => t === "red").length;
  const toDo = tones.length - urgent;
  await expect(page.getByTestId("attention-line")).toHaveText(
    urgent + toDo === 0
      ? "Nothing needs attention. Everything is clear."
      : urgent === 0
        ? `${toDo} ${toDo === 1 ? "thing" : "things"} to do, nothing urgent.`
        : toDo === 0
          ? `${urgent} urgent.`
          : `${urgent} urgent, ${toDo} to do.`,
  );
  // Every line in "Needs attention" says so in words, not colour alone.
  for (const card of await attentionCards.all()) await expect(card).toContainText(/Urgent|To do/);
  // UI-9: four headline numbers at the top; four big actions, the rest behind "More actions".
  // D1: plain facts in a slim strip (nothing the list also counts), and the approvals box.
  for (const id of ["items", "people", "books", "approvals"]) await expect(page.getByTestId(`headline-${id}`)).toBeVisible();
  await expect(page.getByTestId("headline-low-stock")).toHaveCount(0);
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
