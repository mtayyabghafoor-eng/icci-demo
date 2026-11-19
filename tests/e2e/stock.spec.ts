// Slice 5 in a real browser, on a PC-sized and a phone-sized window:
// count one shelf, add stock, correct an entry, have a DIFFERENT admin
// approve it, do a weekly count of a store room, and see the low-stock list.
// Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { clickMenuLink, completeSignIn, expectSignInPage, newTestLabel, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const second = SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!;
const s = (page: Page, name: string, project: string) => shot(page, name, project, "05");

function master() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A fresh, obviously fictional consumable on a test shelf, never counted. */
async function newTestConsumable(project: string) {
  const db = master();
  const [cat, loc] = await Promise.all([
    db.from("item_categories").select("id").eq("name", "Cleaning supplies").single(),
    db.from("locations").select("id").eq("name", "Test Shelf A1-1-1").single(),
  ]);
  const name = `Test run ${Date.now()} ${project} hand towels`;
  const { data, error } = await db
    .from("items")
    .insert({
      label_serial: await newTestLabel(),
      kind: "consumable",
      name,
      category_id: cat.data!.id,
      location_id: loc.data!.id,
      unit: "pack",
      minimum_level: 4,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, name };
}

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

const quantityNow = (page: Page) => page.locator("dt", { hasText: "Quantity now" }).locator("xpath=following-sibling::dd[1]");

test("count a shelf, add stock, correct an entry, a different admin approves it", async ({ page }, info) => {
  const project = info.project.name;
  const item = await newTestConsumable(project);

  await signInAs(page, centre, `/items/${item.id}`);
  await expect(page.getByRole("heading", { level: 1, name: item.name })).toBeVisible();
  await expect(page.getByTestId("status").first()).toHaveText("Not counted yet");
  await expect(quantityNow(page)).toHaveText("Not counted yet");

  // Count this shelf.
  await page.getByRole("link", { name: "Count this shelf" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Count this shelf" })).toBeVisible();
  await page.getByLabel("How many are on the shelf now?").fill("8");
  await s(page, "count-shelf", project);
  await page.getByRole("button", { name: "Save count" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Count saved" })).toBeVisible();
  await expect(quantityNow(page)).toHaveText("8 pack");
  await expect(page.getByTestId("status").first()).toHaveText("In stock");

  // Add stock.
  await page.getByRole("link", { name: "Add stock" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add stock" })).toBeVisible();
  await page.getByLabel("How many are you adding?").fill("5");
  await s(page, "add-stock", project);
  await page.getByRole("button", { name: "Add stock" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Stock added" })).toBeVisible();
  await expect(quantityNow(page)).toHaveText("13 pack");

  // Correct the restock: it was really 7. The correction waits for approval.
  const entries = page.getByTestId("stock-entries");
  await entries.locator("li", { hasText: "Restock: +5" }).getByRole("link", { name: "Correct this entry" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Correct an entry" })).toBeVisible();
  await page.getByLabel("What should the number have been?").fill("7");
  await page.getByLabel("Reason").fill("Test: the delivery note said 7 packs");
  await s(page, "correct-entry", project);
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Correction sent" })).toBeVisible();
  await expect(quantityNow(page)).toHaveText("13 pack"); // unchanged until approved
  await expect(entries).toContainText("Correction: restock of 5 → 7 pack");
  await expect(entries).toContainText("Waiting for approval");
  await expect(entries).toContainText("Restock: +5 pack"); // the original stays
  await s(page, "item-stock-entries", project);

  // The same admin cannot approve it: no buttons, a plain explanation.
  await page.goto("/stock/approvals");
  const mine = page.getByTestId("pending-correction").filter({ hasText: item.name });
  await expect(mine).toContainText("a different admin must decide on it");
  await expect(mine.getByRole("button", { name: "Approve" })).toHaveCount(0);

  // A different admin approves it.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expectSignInPage(page);
  await signInAs(page, second, "/stock/approvals");
  const theirs = page.getByTestId("pending-correction").filter({ hasText: item.name });
  await expect(theirs).toContainText("Asked for by Test Centre Admin");
  await theirs.scrollIntoViewIfNeeded();
  await s(page, "approvals", project);
  // A close-up of the one correction (the full page also lists test leftovers).
  await theirs.screenshot({ path: `docs/screens/slice-05-approvals-one-${project}.png` });

  // Rejecting needs a reason.
  await theirs.getByRole("button", { name: "Reject" }).click();
  await expect(theirs.getByTestId("form-error")).toContainText("Write why you are rejecting it");
  await theirs.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Correction approved" })).toBeVisible();
  await expect(page.getByTestId("pending-correction").filter({ hasText: item.name })).toHaveCount(0);

  await page.goto(`/items/${item.id}`);
  await expect(quantityNow(page)).toHaveText("15 pack");
  await expect(page.getByTestId("stock-entries")).toContainText(`Approved by ${second.displayName}`);
});

test("weekly count of a store room, then the low-stock list", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/stock/count");
  await expect(page.getByRole("heading", { level: 1, name: "Weekly count" })).toBeVisible();
  await page.getByLabel("Store room").selectOption({ label: "Test Building B › Test Room B1 › Test Store Room B1-1" });
  await page.getByRole("button", { name: "Open" }).click();

  await expect(page).toHaveURL(/\/stock\/count\?room=/);
  const boxes = page.locator('input[name^="qty:"]');
  await expect(boxes.first()).toBeVisible();
  const total = await boxes.count();
  expect(total).toBeGreaterThanOrEqual(20);

  // Fill every shelf. The first one is found empty, so it must show as Out.
  const started = Date.now();
  const firstName = (await page.locator('li[id^="row-"]').first().locator("span.font-semibold").first().textContent())!.trim();
  for (let i = 0; i < total; i++) await boxes.nth(i).fill(i === 0 ? "0" : String(10 + (i % 9)));
  // A mistake is caught before anything is saved, and the typed numbers stay.
  await boxes.nth(1).fill("2.5");
  await page.getByRole("button", { name: "Save count" }).click();
  expect(await boxes.nth(1).evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  await expect(page).not.toHaveURL(/saved=/);
  await expect(boxes.nth(2)).toHaveValue(String(10 + (2 % 9)));
  await boxes.nth(1).fill("11");
  await s(page, "weekly-count", project);
  await page.getByRole("button", { name: "Save count" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Count saved: ${total} shelf entries` })).toBeVisible();
  console.log(`Weekly count of ${total} shelf items entered by the test in ${Math.round((Date.now() - started) / 1000)} s`);
  await s(page, "weekly-count-saved", project);

  // The low-stock list.
  await page.getByRole("link", { name: "See the low-stock list" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Low stock" })).toBeVisible();
  const visibleList = project === "phone" ? page.locator("ul li") : page.getByTestId("low-stock").locator("tbody tr");
  const row = visibleList.filter({ hasText: firstName }).filter({ hasText: "Test Store Room B1-1" }).filter({ hasText: "Out" });
  await expect(row.first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Waiting for approval \(\d+\)/ })).toBeVisible();
  await s(page, "low-stock", project);
});

test("the Stock menu link opens the low-stock list; finance cannot reach stock", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/");
  await clickMenuLink(page, "Stock");
  await expect(page.getByRole("heading", { level: 1, name: "Low stock" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expectSignInPage(page);

  const finance = seedAdmin("finance");
  await signInAs(page, finance, "/stock");
  // The database shows finance nothing: no low stock, no corrections.
  await expect(page.getByTestId("low-count")).toHaveText(/Nothing is low/);
  await expect(page.getByRole("link", { name: "Waiting for approval (0)" })).toBeVisible();
  void project;
});
