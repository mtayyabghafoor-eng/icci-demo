// Slice P1.14 in a real browser, on a PC-sized and a phone-sized window: how
// an item leaves. A sale asks for price, buyer, date and who took the money;
// a gift to charity asks for the charity's name; the approver sees the route;
// the item's history keeps it. Screens are saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, newTestLabel, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const second = SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!;
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p1-14");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function newTestAsset(project: string, what: string) {
  const db = master();
  const [cat, loc] = await Promise.all([
    db.from("item_categories").select("id").eq("name", "Furniture").single(),
    db.from("locations").select("id").eq("name", "Test Room A1").single(),
  ]);
  const name = `Test run ${Date.now().toString(36)} ${project} ${what}`;
  const { data, error } = await db
    .from("items")
    .insert({ label_serial: await newTestLabel(), kind: "fixed_asset", name, category_id: cat.data!.id, location_id: loc.data!.id, condition: "good" })
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

async function fillCommon(page: Page, note: string) {
  await page.getByRole("textbox", { name: "Note" }).fill(note);
  await page.getByRole("combobox", { name: "Reported by" }).selectOption({ label: "Someone else (type the name)" });
  await page.getByRole("textbox", { name: "Their name" }).fill("Test caretaker (fictional)");
}

test("a sale: price, buyer, date and who took the money; the approver sees it; history keeps it", async ({ page }, info) => {
  const project = info.project.name;
  const item = await newTestAsset(project, "old lectern");
  await signInAs(page, centre, `/items/${item.id}/asset/dispose`);

  await page.getByLabel("Sold").check();
  await expect(page.getByTestId("sale-fields")).toBeVisible();
  await fillCommon(page, "Test: sold at the made-up jumble sale");
  // Missing the buyer: the form says so and nothing is sent.
  await page.getByLabel("Price (€)").fill("12.50");
  await page.getByLabel("Who took the money").fill("Test Treasurer (fictional)");
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}/asset/dispose$`));
  await page.getByLabel("Buyer's name").fill("Test Buyer (fictional)");
  await s(page, "sale-form", project);
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Disposal sent." })).toBeVisible();
  await expect(page.getByTestId("asset-events").locator("li").first()).toContainText("Sold: €12.50 to Test Buyer (fictional)");

  const { data: ev } = await master().from("asset_events").select("disposal_route, sale_price_cents, sale_buyer, sale_money_taken_by, sale_date").eq("item_id", item.id).eq("kind", "disposal").single();
  expect(ev).toMatchObject({ disposal_route: "sold", sale_price_cents: 1250, sale_buyer: "Test Buyer (fictional)", sale_money_taken_by: "Test Treasurer (fictional)" });
  expect(ev!.sale_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // A different admin sees how it leaves, and approves.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expectSignInPage(page);
  await signInAs(page, second, "/assets/approvals");
  const theirs = page.getByTestId("pending-disposal").filter({ hasText: item.name });
  await expect(theirs.getByTestId("disposal-route")).toContainText("Sold: €12.50 to Test Buyer (fictional)");
  await expect(theirs.getByTestId("disposal-route")).toContainText("money taken by Test Treasurer (fictional)");
  await theirs.screenshot({ path: `docs/screens/slice-p1-14-approval-sale-${project}.png`, caret: "initial" });
  await theirs.getByRole("button", { name: "Approve disposal" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Disposal approved." })).toBeVisible();

  await page.goto(`/items/${item.id}`);
  await expect(page.getByTestId("status").first()).toHaveText("Disposed");
  await expect(page.getByTestId("asset-events")).toContainText("Sold: €12.50 to Test Buyer (fictional)");
  await s(page, "item-sold", project);
});

test("given to charity needs the charity's name; the route is required", async ({ page }, info) => {
  const project = info.project.name;
  const item = await newTestAsset(project, "spare table");
  await signInAs(page, centre, `/items/${item.id}/asset/dispose`);
  await expect(page.getByRole("radio")).toHaveCount(7);
  await s(page, "routes", project);

  await page.getByLabel("Given to charity").check();
  await fillCommon(page, "Test: collected by the made-up charity shop");
  await page.getByLabel("Name of the charity").fill("Test Charity Shop (fictional)");
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Disposal sent." })).toBeVisible();
  await expect(page.getByTestId("asset-events").locator("li").first()).toContainText("Given to charity: Test Charity Shop (fictional)");
});
