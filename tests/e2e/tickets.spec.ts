// Phase 3, slice P3.5 in a real browser, on a PC-sized and a phone-sized
// window: report a problem with a place (urgent, with a photo), report a
// problem from an asset's page, the tickets list (urgent first, filters,
// CSV) and Finance's note. Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, newTestLabel, shot, showFilters } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p3-5");

/** A blank 1 x 1 pixel picture: obviously not a real photo. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function newTestAsset(project: string) {
  const db = master();
  const [cat, loc] = await Promise.all([
    db.from("item_categories").select("id").eq("name", "Other furniture").single(),
    db.from("locations").select("id").eq("name", "Test Room A1").single(),
  ]);
  const name = `Test run ${Date.now()} ${project} bookcase`;
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

const field = (page: Page, label: string) => page.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");

test("report an urgent problem with a place, with a photo", async ({ page }, info) => {
  const project = info.project.name;
  const description = `Test run ${Date.now()} ${project}: water on the floor by the made-up shoe racks`;

  await signInAs(page, centre, "/tickets/new");
  await expect(page.getByRole("heading", { level: 1, name: "Report a Problem" })).toBeVisible();
  await expectCurrentMenuLink(page, "Report a problem");
  // Normal is the starting priority; "Reported by" starts with you.
  await expect(page.getByRole("radio", { name: "Normal" })).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Reported by" }).locator("option:checked")).toHaveText(/\(you\)$/);

  // Nothing is sent without a description and a place.
  await page.getByRole("button", { name: "Report the problem" }).click();
  await expect(page).toHaveURL(/\/tickets\/new$/);

  await page.getByRole("textbox", { name: "What is wrong?" }).fill(description);
  await page.getByRole("combobox", { name: "Where?" }).selectOption({ label: "Test Building A › Test Room A2" });
  await page.getByTestId("photo-input").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: TINY_PNG });
  await expect(page.getByAltText("Preview of the new photo")).toBeVisible();
  await page.getByRole("radio", { name: "Urgent" }).check();
  await s(page, "report-problem", project);
  await page.getByRole("button", { name: "Report the problem" }).click();

  await expect(page.getByRole("status").filter({ hasText: /Problem reported as ticket T-\d{4}/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /^Ticket T-\d{4}$/ })).toBeVisible();
  await expect(page.getByTestId("ticket-description")).toHaveText(description);
  await expect(page.getByTestId("status").first()).toHaveText("Open");
  await expect(page.getByTestId("status").nth(1)).toHaveText("Urgent");
  await expect(field(page, "Where")).toHaveText("Test Building A › Test Room A2");
  await expect(field(page, "Assigned to")).toHaveText("Nobody yet");
  await expect(page.getByAltText("Photo sent with the report")).toBeVisible();
  await expect(page.getByTestId("ticket-history").getByRole("listitem")).toHaveCount(1);
  await expect(page.getByTestId("ticket-history")).toContainText("Reported");
  await s(page, "ticket-page", project);
});

test("report a problem from an asset's page; the asset lists its tickets", async ({ page }, info) => {
  const project = info.project.name;
  const asset = await newTestAsset(project);

  await signInAs(page, centre, `/items/${asset.id}`);
  await expect(page.getByText("No tickets for this asset.")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Report a problem" }).click();
  await expect(page).toHaveURL(new RegExp(`/tickets/new\\?item=${asset.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Report a Problem" })).toBeVisible();
  await expect(page.getByRole("main").getByText(asset.name, { exact: true })).toBeVisible();
  // The place is the asset's own: no "Where?" box.
  await expect(page.getByRole("combobox", { name: "Where?" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "What is wrong?" }).fill("Test: one made-up shelf has slipped");
  await page.getByRole("combobox", { name: "Reported by" }).selectOption({ label: "Someone else (type the name)" });
  await page.getByRole("textbox", { name: "Their name" }).fill("Test visitor (fictional)");
  await s(page, "report-from-asset", project);
  await page.getByRole("button", { name: "Report the problem" }).click();

  await expect(page.getByRole("status").filter({ hasText: /Problem reported/ })).toBeVisible();
  await expect(field(page, "Asset")).toContainText(asset.name);
  await expect(field(page, "Where")).toHaveText("Test Building A › Test Room A1");
  await expect(field(page, "Reported by")).toHaveText("Test visitor (fictional)");

  await field(page, "Asset").getByRole("link").click();
  const tickets = page.getByTestId("item-tickets");
  await expect(tickets.getByRole("listitem")).toHaveCount(1);
  await expect(tickets).toContainText("Test: one made-up shelf has slipped");
  await expect(tickets.getByTestId("status")).toHaveText("Open");
  await tickets.scrollIntoViewIfNeeded();
  await s(page, "item-tickets", project);
});

test("the tickets list: urgent first, filters and CSV", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/tickets");
  await expect(page.getByRole("heading", { level: 1, name: "Maintenance Tickets" })).toBeVisible();
  await expectCurrentMenuLink(page, "Tickets");

  const rows = page.getByTestId("ticket-row").filter({ visible: true });
  await expect(rows.first()).toBeVisible();
  // Not closed yet is the starting filter, urgent on top.
  await expect(rows.first().getByTestId("status").nth(1)).toHaveText("Urgent");
  await expect(rows.filter({ hasText: "Tap in the wudu area drips all the time (made up)" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Heater makes a loud clicking noise (made up)" })).toHaveCount(0);
  await s(page, "tickets-list", project);

  // Closed ones only.
  await showFilters(page);
  await page.getByRole("combobox", { name: "Status" }).selectOption({ label: "Closed" });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/status=closed/);
  await expect(rows.filter({ hasText: "Heater makes a loud clicking noise (made up)" })).toHaveCount(1);
  for (const r of await rows.all()) await expect(r.getByTestId("status").first()).toHaveText("Closed");

  // The CSV holds the same tickets.
  const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  expect(href).toBe("/tickets/csv?status=closed");
  const csv = await page.request.get(href!);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toMatch(/icci-tickets-\d{4}-\d{2}-\d{2}\.csv/);
  const text = await csv.text();
  expect(text).toContain("Ticket,Reported,Priority,Status");
  expect(text).toContain("Heater makes a loud clicking noise (made up)");
  expect(text).toContain("125.00");
  expect(text).not.toContain("Tap in the wudu area");
});

test("finance sees a note instead of tickets, and gets no CSV", async ({ page }, info) => {
  await signInAs(page, finance, "/tickets");
  await expect(page.getByTestId("cannot-see-tickets")).toBeVisible();
  await expect(page.getByTestId("ticket-row")).toHaveCount(0);
  expect((await page.request.get("/tickets/csv")).status()).toBe(403);
  await s(page, "tickets-finance", info.project.name);
});
