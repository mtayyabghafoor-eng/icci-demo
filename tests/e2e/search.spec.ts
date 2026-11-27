// D8 (owner, 27 Nov 2026): one search box for items, people, policies,
// books, companies, places and vehicles, with a short list as you type.
// Also who may search what: a signed-out visitor gets nothing, Finance has
// no box, and the Library Operator only ever finds books.
import { expect, test } from "@playwright/test";
import { SEED_PEOPLE, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot, signInWithEmailCode } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const operator = seedAdmin("library_operator");
const person = SEED_PEOPLE[0].full_name;

test("one box finds policies, people and more, as you type", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await page.goto("/");
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));

  if (phone) {
    // A phone: the box under the greeting on Home, and the top bar's search button.
    await expect(page.getByTestId("home-search").getByRole("combobox")).toBeVisible();
    await page.getByRole("link", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("heading", { level: 1, name: "Search" })).toBeVisible();
  }
  // Next.js keeps the page just left alive but hidden, so only the box on show counts.
  const big = () => page.locator('[data-testid="search-box-big"]:visible');
  const box = phone ? big() : page.getByTestId("search-box");

  // As you type: a short list grouped by kind; choosing a line opens it.
  await box.fill("safeguard");
  const list = page.getByRole("listbox", { name: "Results" }).first();
  const policy = list.getByRole("option", { name: /^Test policy: Safeguarding children, Policies/ });
  await expect(policy).toBeVisible();
  await shot(page, "search-as-you-type", info.project.name, "d8");
  await box.press("ArrowDown");
  await box.press("ArrowDown"); // the first line is the policy; the arrow keys move through the list
  await box.press("ArrowUp");
  await expect(policy).toHaveAttribute("aria-selected", "true");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/policies\/[0-9a-f-]{36}$/);

  // Enter on its own: the full results page, grouped.
  await page.goto("/search");
  await big().fill(person);
  await big().press("Enter");
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByTestId("search-group-people").getByRole("link", { name: new RegExp(person) }).first()).toBeVisible();
  await shot(page, "search-results-page", info.project.name, "d8");
  await page.getByTestId("search-group-people").getByRole("link", { name: new RegExp(person) }).first().click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);

  // A label number still opens that label at once.
  await page.goto("/search");
  await big().fill("ICCI-999999");
  await big().press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Label not recognised" })).toBeVisible();
});

test("a signed-out visitor gets nothing from the search", async ({ request }) => {
  // The gatekeeper sends a visitor to the sign-in page before the search runs.
  const r = await request.get(`/search/suggest?q=${encodeURIComponent(person)}`, { maxRedirects: 0 });
  expect([302, 303, 307, 401]).toContain(r.status());
  expect(r.headers()["content-type"] ?? "").not.toContain("json");
  expect(await r.text()).not.toContain(person);
  const p = await request.get(`/search?q=${encodeURIComponent(person)}`, { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(p.status());
});

test("Finance has no search box and finds nothing", async ({ page }) => {
  await page.goto("/");
  await expectSignInPage(page);
  await completeSignIn(page, finance.email, testAuthenticatorSecret(finance.email));
  await expect(page.getByTestId("greeting")).toBeVisible();
  await expect(page.getByRole("search", { name: "Search the dashboard" })).toHaveCount(0);
  const r = await page.request.get(`/search/suggest?q=${encodeURIComponent(person)}`);
  expect(r.status()).toBe(200);
  expect((await r.json()).groups).toEqual([]);
  await page.goto(`/search?q=${encodeURIComponent(person)}`);
  await expect(page.getByTestId("search-not-allowed")).toBeVisible();
});

test("the Library Operator only ever finds books", async ({ page }) => {
  await signInWithEmailCode(page, operator.email);
  const people = await page.request.get(`/search/suggest?q=${encodeURIComponent(person)}`);
  expect((await people.json()).groups).toEqual([]);
  const policies = await page.request.get(`/search/suggest?q=safeguard`);
  expect((await policies.json()).groups).toEqual([]);
  const books = await page.request.get(`/search/suggest?q=made+up`);
  const groups = (await books.json()).groups as Array<{ key: string }>;
  expect(groups.map((g) => g.key)).toEqual(["books"]);
});
