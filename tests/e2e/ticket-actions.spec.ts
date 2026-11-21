// Phase 3, slice P3.6 in a real browser, on a PC-sized and a phone-sized
// window: assign, progress, priority, a note, close with a cost and "mark
// repaired", reopen; "Open a ticket for this" after Report damage; the
// disposal warning; the Home counter. Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { apiAs, completeSignIn, expectSignInPage, newTestLabel, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const second = SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!;
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p3-6");

const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function newTestAsset(project: string, label: string) {
  const db = master();
  const [cat, loc] = await Promise.all([
    db.from("item_categories").select("id").eq("name", "Other furniture").single(),
    db.from("locations").select("id").eq("name", "Test Room A1").single(),
  ]);
  const name = `Test run ${Date.now()} ${project} ${label}`;
  const { data, error } = await (await apiAs(centre.email))
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
const history = (page: Page) => page.getByTestId("ticket-history");

async function openFold(page: Page, testId: string) {
  const fold = page.getByTestId(testId);
  await fold.locator("summary").click();
  await expect(fold).toHaveAttribute("open", "");
  return fold;
}

test("take a ticket from open to closed, marking the asset repaired, then reopen it", async ({ page }, info) => {
  const project = info.project.name;
  const asset = await newTestAsset(project, "cupboard");
  const c = await apiAs(centre.email);
  const dmg = await c.from("asset_events").insert({ item_id: asset.id, kind: "damage", note: "Test: door hinge broken", reported_by: "Test cleaner (fictional)" });
  if (dmg.error) throw dmg.error;
  const made = await c.from("maintenance_tickets").insert({ item_id: asset.id, description: "Test: cupboard door hangs off (made up)", reported_by: "Test cleaner (fictional)" }).select("id").single();
  if (made.error) throw made.error;
  const id = made.data.id as number;

  await signInAs(page, centre, `/tickets/${id}`);
  const actions = page.getByTestId("ticket-actions");
  await expect(actions.getByRole("button")).toHaveText(["Mark in progress", "Mark waiting"]);

  // Assign to a made-up contractor.
  const assign = await openFold(page, "fold-assign");
  await assign.getByRole("combobox", { name: "Assign to" }).selectOption({ label: "Test Khadija Madeup (Contractor)" });
  await assign.getByRole("textbox", { name: /Note/ }).fill("Test: carpenter booked for Tuesday");
  await s(page, "assign", project);
  await assign.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ticket assigned." })).toBeVisible();
  await expect(field(page, "Assigned to")).toHaveText("Test Khadija Madeup");

  // In progress, in one tap.
  await actions.getByRole("button", { name: "Mark in progress" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Status changed." })).toBeVisible();
  await expect(page.getByTestId("status").first()).toHaveText("In progress");
  await expect(actions.getByRole("button")).toHaveText(["Mark waiting", "Back to open"]);

  // Urgent after all.
  const priority = await openFold(page, "fold-priority");
  await expect(priority.getByRole("radio", { name: "Normal (now)" })).toBeDisabled();
  await priority.getByRole("radio", { name: "Urgent" }).check();
  await priority.getByRole("button", { name: "Change priority" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Priority changed." })).toBeVisible();
  await expect(field(page, "Priority")).toHaveText("Urgent");

  // A note.
  const note = await openFold(page, "fold-note");
  await note.getByRole("textbox", { name: "Note" }).fill("Test: new hinge ordered");
  await note.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Note added." })).toBeVisible();
  await s(page, "ticket-in-progress", project);

  // Close, with a cost, marking the asset repaired.
  await actions.getByRole("link", { name: "Close ticket" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Close Ticket T-\d{4}$/ })).toBeVisible();
  await page.getByRole("textbox", { name: /Closing note/ }).fill("Test: new hinge fitted and door rehung");
  await page.getByRole("textbox", { name: /Cost in euro/ }).fill("45.50");
  await page.getByRole("checkbox", { name: "Also mark the asset repaired" }).check();
  await page.getByRole("radio", { name: "Fair" }).check();
  await s(page, "close-ticket", project);
  await page.getByRole("button", { name: "Close ticket" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Ticket closed." })).toBeVisible();
  await expect(page.getByTestId("status").first()).toHaveText("Closed");
  await expect(field(page, "Cost")).toHaveText("€45.50");
  await expect(field(page, "Closing note")).toHaveText("Test: new hinge fitted and door rehung");
  await expect(history(page)).toContainText("The asset was marked repaired at the same time");
  await expect(history(page).getByRole("listitem")).toHaveCount(6);
  await s(page, "ticket-closed", project);

  // The asset is now Fair, with the repair entry naming the ticket.
  await field(page, "Asset").getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: asset.name })).toBeVisible();
  await expect(page.getByTestId("status").first()).toHaveText("Fair");
  await expect(page.getByTestId("asset-events")).toContainText(`Repaired: ticket T-${String(id).padStart(4, "0")} closed.`);

  // Reopen, with a reason.
  await page.goto(`/tickets/${id}`);
  const reopen = await openFold(page, "fold-reopen");
  await reopen.getByRole("textbox", { name: /Why/ }).fill("Test: the door drops again");
  await reopen.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ticket reopened." })).toBeVisible();
  await expect(page.getByTestId("status").first()).toHaveText("Open");
  await expect(field(page, "Assigned to")).toHaveText("Test Khadija Madeup");
  await expect(history(page)).toContainText("Reopened");
});

test("Report damage, then 'Open a ticket for this'", async ({ page }, info) => {
  const project = info.project.name;
  const asset = await newTestAsset(project, "bench");

  await signInAs(page, centre, `/items/${asset.id}/asset/damage`);
  await page.getByRole("textbox", { name: "Note" }).fill("Test: one slat split");
  await page.getByRole("combobox", { name: "Reported by" }).selectOption({ label: "Someone else (type the name)" });
  await page.getByRole("textbox", { name: "Their name" }).fill("Test volunteer (fictional)");
  await page.getByRole("button", { name: "Report damage" }).click();

  const notice = page.getByRole("status").filter({ hasText: "Damage reported." });
  await expect(notice).toBeVisible();
  await s(page, "damage-open-ticket", project);
  await notice.getByRole("link", { name: "Open a ticket for this" }).click();
  await expect(page.getByTestId("from-damage")).toBeVisible();
  await page.getByRole("textbox", { name: "What is wrong?" }).fill("Test: bench slat needs replacing (made up)");
  await page.getByRole("button", { name: "Report the problem" }).click();

  await expect(page.getByRole("status").filter({ hasText: /Problem reported/ })).toBeVisible();
  await expect(field(page, "Opened from")).toHaveText("a damage report on this asset");

  // Back on the asset, the link is not offered twice for the same report.
  await page.goto(`/items/${asset.id}?done=damage`);
  await expect(page.getByRole("status").filter({ hasText: "Damage reported." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open a ticket for this" })).toHaveCount(0);
});

test("a disposal waiting for approval warns about tickets not closed", async ({ page }, info) => {
  const project = info.project.name;
  const asset = await newTestAsset(project, "old desk");
  const c = await apiAs(centre.email);
  const t = await c.from("maintenance_tickets").insert({ item_id: asset.id, description: "Test: drawer stuck (made up)", reported_by: "Test cleaner (fictional)" });
  if (t.error) throw t.error;
  const d = await c.from("asset_events").insert({ item_id: asset.id, kind: "disposal", note: "Test: beyond repair", reported_by: "Test cleaner (fictional)", disposal_route: "thrown_away" });
  if (d.error) throw d.error;

  await signInAs(page, second, "/assets/approvals");
  const card = page.getByTestId("pending-disposal").filter({ hasText: asset.name });
  await expect(card.getByTestId("open-tickets-warning")).toHaveText(/still has 1 maintenance ticket not closed/);
  await card.scrollIntoViewIfNeeded();
  await s(page, "disposal-warning", project);
  // Leave nothing waiting: reject it.
  await card.getByRole("textbox", { name: /Note/ }).fill("Test: tidy-up after the browser test");
  await card.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Disposal rejected." })).toBeVisible();
});

test("the Home page counts open tickets", async ({ page }, info) => {
  await signInAs(page, centre, "/");
  const card = page.getByTestId("counter-tickets");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Open maintenance tickets");
  await expect(card).toContainText(/urgent/);
  await card.scrollIntoViewIfNeeded();
  await s(page, "home-tickets", info.project.name);
});
