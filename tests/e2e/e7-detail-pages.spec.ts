// Slice E7 in a real browser, on a PC-sized and a phone-sized window: one
// look for detail pages. One left edge for every page on a PC; facts label
// over value; the item's documents in one card and empty sections in one
// line; codes in the code font and in the browser tab; "Approve €43.21"
// with who was paid; on a phone, one main ticket button with the rest
// behind "More". Screens saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { apiAs, completeSignIn, expectSignInPage, newTestLabel, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const second = SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!;
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

const titleLeft = async (page: Page) => (await page.getByRole("heading", { level: 1 }).filter({ visible: true }).first().boundingBox())!.x;

test("every page title starts at the same left edge on a PC", async ({ page }) => {
  const { data: person } = await master().from("people").select("id").eq("active", true).ilike("full_name", "Test %").limit(1).single();
  await signInAs(page, centre, "/items");
  const edges: number[] = [];
  // A list (wide), a record (medium) and a form (narrow).
  for (const path of ["/items", `/people/${person!.id}`, "/people/new", "/tickets/new", "/rota"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).filter({ visible: true }).first()).toBeVisible();
    edges.push(Math.round(await titleLeft(page)));
  }
  expect(new Set(edges).size, `title edges: ${edges.join(", ")}`).toBe(1);
  if (!isPhone(page)) expect(edges[0]).toBeLessThan(320);
});

test("an item page: label in the code font and the tab, documents once, empty sections in one line", async ({ page }, info) => {
  const db = master();
  // An asset whose make and model has a manual (from the test seed).
  const { data: doc } = await db.from("asset_documents").select("model_id, title").not("model_id", "is", null).eq("hidden", false).limit(1).single();
  const [cat, loc] = await Promise.all([
    db.from("item_categories").select("id").eq("name", "Other furniture").single(),
    db.from("locations").select("id").eq("name", "Test Room A1").single(),
  ]);
  const name = `Test run ${Date.now()} ${info.project.name} E7 heater`;
  const label = await newTestLabel();
  const { data: item, error } = await (await apiAs(centre.email))
    .from("items")
    .insert({ label_serial: label, kind: "fixed_asset", name, category_id: cat.data!.id, location_id: loc.data!.id, condition: "good", model_id: doc!.model_id })
    .select("id")
    .single();
  if (error) throw error;

  await signInAs(page, centre, `/items/${item.id}`);
  await expect(page).toHaveTitle(`${label} · ${name} | ICCI Control Dashboard`);
  const code = page.getByTestId("item-code");
  await expect(code).toHaveText(label);
  expect(await code.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/JetBrains|mono/i);

  // One list of documents (the model's manual is in it), not two.
  await expect(page.getByTestId("documents")).toHaveCount(1);
  await expect(page.getByTestId("documents")).toContainText(doc!.title);
  await expect(page.getByTestId("documents")).toContainText("for every one of this model");
  await expect(page.getByRole("heading", { name: "Manuals and documents" })).toHaveCount(1);
  // The model's manual cannot be hidden from one item's page.
  await expect(page.getByTestId("documents").getByText("Hide this document")).toHaveCount(0);

  // Nothing reported and no tickets: one line, not two empty sections.
  await expect(page.getByTestId("nothing-yet")).toHaveText("Nothing yet: moves and reports, maintenance tickets.");
  await expect(page.getByRole("heading", { name: "Moves and reports" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Maintenance tickets" })).toHaveCount(0);
  // Fact labels are in sentence case, not capitals.
  expect(await page.locator("dt").first().evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
  await shot(page, "item", info.project.name, "e7");
});

test("facts read label over value on a record page", async ({ page }, info) => {
  const { data: person } = await master().from("people").select("id").eq("active", true).ilike("full_name", "Test %").limit(1).single();
  await signInAs(page, centre, `/people/${person!.id}`);
  const dt = page.locator("dl.facts dt").first();
  const dd = page.locator("dl.facts dd").first();
  const a = (await dt.boundingBox())!;
  const b = (await dd.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1);
  expect(Math.abs(b.x - a.x)).toBeLessThan(2);
  await shot(page, "person", info.project.name, "e7");
});

test("a claim's Approve button names the amount, with who was paid beside it", async ({ page }, info) => {
  const c = await apiAs(centre.email);
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const path = `claims/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-receipt-1.png`;
  await c.storage.from("expense-receipts").upload(path, PNG, { contentType: "image/png" });
  const { data: cats } = await c.from("expense_categories").select("id").eq("name", "Other").single();
  const { data: payer } = await c.from("people").select("id, full_name").eq("active", true).is("app_user_id", null).limit(1).single();
  const { data: id, error } = await c.rpc("enter_expense_claim", {
    p_amount_cents: 4321,
    p_receipt_date: new Date().toISOString().slice(0, 10),
    p_category_id: cats!.id,
    p_description: `Test run ${Date.now().toString(36)} E7 claim`,
    p_payment: "personal",
    p_paid_by_person_id: payer!.id,
    p_files: [path],
  });
  if (error) throw error;

  await signInAs(page, second, `/expenses/${id}`);
  await expect(page).toHaveTitle(`EXP-${String(id).padStart(4, "0")} | ICCI Control Dashboard`);
  await expect(page.getByTestId("approve").filter({ visible: true })).toHaveText("Approve €43.21");
  await expect(page.getByTestId("approve-payee").filter({ visible: true })).toContainText(`Paid by ${payer!.full_name}`);
  const code = page.getByRole("heading", { level: 1 }).locator(".title-code");
  expect(await code.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/JetBrains|mono/i);
  await shot(page, "claim-approve", info.project.name, "e7");
});

test("a ticket shows one main button for the next step; on a phone the rest is behind More", async ({ page }, info) => {
  const { data: asset } = await master().from("items").select("id").eq("kind", "fixed_asset").eq("condition", "good").ilike("name", "Test %").limit(1).single();
  const made = await (await apiAs(centre.email))
    .from("maintenance_tickets")
    .insert({ item_id: asset!.id, description: "Test: E7 window latch loose (made up)", reported_by: "Test cleaner (fictional)" })
    .select("id")
    .single();
  if (made.error) throw made.error;
  await signInAs(page, centre, `/tickets/${made.data.id}`);
  await expect(page).toHaveTitle(`T-${String(made.data.id).padStart(4, "0")} | ICCI Control Dashboard`);
  const actions = page.getByTestId("ticket-actions");
  // An open ticket: the next step is to start it.
  await expect(actions.getByRole("button", { name: "Mark in progress" })).toBeVisible();
  if (isPhone(page)) {
    await expect(actions.getByRole("link", { name: "Close ticket" })).toBeHidden();
    await expect(page.getByTestId("fold-assign")).toBeHidden();
    await shot(page, "ticket-more-closed", info.project.name, "e7");
    await page.getByTestId("ticket-more").locator(":scope > summary").click();
  } else {
    await expect(page.getByTestId("ticket-more").locator(":scope > summary")).toBeHidden();
  }
  await expect(actions.getByRole("link", { name: "Close ticket" })).toBeVisible();
  await expect(page.getByTestId("fold-assign")).toBeVisible();
  await shot(page, "ticket", info.project.name, "e7");
});
