// Slice 8 in a real browser, on a PC-sized and a phone-sized window: start a
// stocktake of a room, scan labels (as the phone's camera would open them),
// check what is missing, send it, and have a DIFFERENT admin approve one
// difference and reject the other. Finance cannot run a stocktake.
// Every screen is saved to docs/screens/.
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, newTestLabel, shot, signOutHere } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const second = SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!;

async function s(page: Page, name: string, project: string) {
  await expect(page.getByText(/^(Loading|Opening|Working out)/)).toHaveCount(0);
  await shot(page, name, project, "08");
}

function master() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * A fresh made-up room: two chairs (one will not be found), and a shelf of
 * bin bags counted at 12.
 */
async function newTestRoom(project: string) {
  const db = master();
  const stamp = `${Date.now()} ${project}`;
  const one = async (q: PromiseLike<{ data: { id: string } | null; error: unknown }>) => {
    const { data, error } = await q;
    if (error) throw error;
    return data!.id;
  };
  const building = await one(db.from("locations").select("id").eq("name", "Test Building A").single());
  const roomName = `Test run ${stamp} hall`;
  const room = await one(db.from("locations").insert({ name: roomName, kind: "room", parent_id: building }).select("id").single());
  const store = await one(
    db.from("locations").insert({ name: `Test run ${stamp} cupboard`, kind: "store_room", parent_id: room }).select("id").single(),
  );
  const shelf = await one(
    db.from("locations").insert({ name: `Test run ${stamp} top shelf`, kind: "shelf", parent_id: store }).select("id").single(),
  );
  const furniture = await one(db.from("item_categories").select("id").eq("name", "Other furniture").single());
  const cleaning = await one(db.from("item_categories").select("id").eq("name", "Cleaning supplies").single());
  const item = async (fields: Record<string, unknown>) => {
    const label = await newTestLabel();
    const id = await one(db.from("items").insert({ label_serial: label, category_id: furniture, ...fields }).select("id").single());
    return { id, label, name: fields.name as string };
  };
  const seenChair = await item({ kind: "fixed_asset", name: `Test run ${stamp} blue chair`, location_id: room, condition: "good" });
  const lostChair = await item({ kind: "fixed_asset", name: `Test run ${stamp} red chair`, location_id: room, condition: "good" });
  // Marked missing earlier, and then found in this stocktake (audit fix 1).
  const foundChair = await item({ kind: "fixed_asset", name: `Test run ${stamp} green chair`, location_id: room, condition: "good" });
  const lost = await db
    .from("asset_events")
    .insert({ item_id: foundChair.id, kind: "missing", note: "Test: made-up report", reported_by: "Test volunteer (fictional)" });
  if (lost.error) throw lost.error;
  const bags = await item({
    kind: "consumable",
    name: `Test run ${stamp} bin bags`,
    category_id: cleaning,
    location_id: shelf,
    unit: "roll",
    minimum_level: 3,
  });
  const counted = await db.from("stock_movements").insert({ item_id: bags.id, kind: "count", quantity: 12 });
  if (counted.error) throw counted.error;
  return { roomPath: `Test Building A › ${roomName}`, seenChair, lostChair, foundChair, bags, unknownLabel: await newTestLabel() };
}

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

test("run a stocktake of a room, and a different admin decides on each difference", async ({ page }, info) => {
  // Long: two sign-ins and three decisions. It takes about 1.4 minutes on the
  // owner's PC, close to the usual 1.5-minute limit, so allow three times that.
  test.slow();
  const project = info.project.name;
  const room = await newTestRoom(project);

  await signInAs(page, centre, "/stocktake");
  await expect(page.getByRole("heading", { level: 1, name: "Stocktake" })).toBeVisible();
  await expectCurrentMenuLink(page, "Stocktake");
  await page.getByLabel("Room").selectOption({ label: room.roomPath });
  await s(page, "stocktake-start", project);
  await page.getByRole("button", { name: "Start the stocktake" }).click();
  await expect(page).toHaveURL(/\/stocktake\/\d+$/);
  const stocktakeUrl = new URL(page.url()).pathname;
  await expect(page.getByTestId("scanning-on")).toBeVisible();
  await expect(page.getByTestId("scan-count")).toHaveText("Nothing scanned yet.");
  await s(page, "stocktake-open", project);

  // The phone's camera opens the label's link: it comes to this stocktake.
  await page.goto(`/l/${room.seenChair.label}`);
  await expect(page).toHaveURL(new RegExp(`${stocktakeUrl}/scan\\?label=${room.seenChair.label}$`));
  await expect(page.getByTestId("scan-title")).toHaveText(room.seenChair.name);
  await s(page, "stocktake-scan-asset", project);
  await page.getByRole("button", { name: "Seen here" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Saved: ${room.seenChair.label}` })).toBeVisible();

  // The chair marked missing turns up.
  await page.goto(`/l/${room.foundChair.label}`);
  await expect(page.getByTestId("scan-title")).toHaveText(room.foundChair.name);
  await page.getByRole("button", { name: "Seen here" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Saved: ${room.foundChair.label}` })).toBeVisible();

  // A shelf: type the number found (12 expected, 9 found).
  await page.goto(`/l/${room.bags.label}`);
  await expect(page.getByTestId("scan-title")).toHaveText(room.bags.name);
  await page.getByLabel("How many are on the shelf?").fill("9");
  await s(page, "stocktake-scan-shelf", project);
  await page.getByRole("button", { name: "Save number" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Saved: ${room.bags.label}` })).toBeVisible();

  // A label with no item, typed into the box.
  await page.getByLabel("Or type a label number").fill(String(Number(room.unknownLabel.slice(5))));
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByTestId("scan-title")).toHaveText("Unknown label");
  await page.getByRole("button", { name: "Note this label" }).click();
  await expect(page.getByTestId("scan-count")).toHaveText("4 labels scanned.");
  await s(page, "stocktake-scanned", project);

  // Stop scanning: the camera opens items as normal again.
  await page.getByRole("button", { name: "Stop scanning" }).click();
  await expect(page.getByTestId("scanning-off")).toBeVisible();
  await page.goto(`/l/${room.seenChair.label}`);
  await expect(page).toHaveURL(new RegExp(`/items/${room.seenChair.id}$`));
  await page.goto(stocktakeUrl);
  await page.getByRole("button", { name: "Carry on scanning" }).click();
  await expect(page.getByTestId("scanning-on")).toBeVisible();

  // Check and finish: one missing chair, one shelf counted differently.
  await page.getByRole("link", { name: "Check and finish" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Check and finish" })).toBeVisible();
  await expect(page.getByTestId("group-missing").getByTestId("finding")).toHaveText([new RegExp(room.lostChair.name)]);
  await expect(page.getByTestId("group-move_here").getByTestId("finding")).toHaveCount(0);
  await expect(page.getByTestId("group-found").getByTestId("finding")).toHaveText([new RegExp(room.foundChair.name)]);
  await expect(page.getByTestId("group-quantity").getByTestId("finding")).toContainText("12 roll expected, 9 roll found (3 fewer).");
  await expect(page.getByText(`${room.unknownLabel}. Register their items afterwards.`)).toBeVisible();
  await s(page, "stocktake-finish", project);
  await page.getByRole("button", { name: "Send for approval" }).click();
  // A1: a saved message shown in the page tidies "?done=" out of the address.
  await expect(page).toHaveURL(new RegExp(`${stocktakeUrl}(\\?done=sent)?$`));
  await expect(page.getByTestId("difference")).toHaveCount(3);
  // Whoever ran it cannot decide on it.
  await expect(page.getByTestId("took-part")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await s(page, "stocktake-sent", project);

  // A different admin decides: approve the missing chair, reject the count.
  await signOutHere(page);
  await expectSignInPage(page);
  await signInAs(page, second, stocktakeUrl);
  const missing = page.getByTestId("difference").filter({ hasText: room.lostChair.name });
  const shelf = page.getByTestId("difference").filter({ hasText: room.bags.name });
  await expect(missing).toContainText("If approved, the asset is marked Missing.");
  await s(page, "stocktake-approve", project);
  await shelf.getByRole("button", { name: "Reject" }).click();
  await expect(shelf.getByTestId("form-error")).toContainText("Write why you are rejecting it");
  await shelf.getByLabel("Note").fill("Test: the rest were in the other cupboard");
  await shelf.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Difference rejected" })).toBeVisible();
  await missing.getByRole("button", { name: "Approve" }).click();
  // Slow when the dev database is full of leftover test places; allow 15 seconds.
  await expect(page.getByRole("status").filter({ hasText: "Difference approved" })).toBeVisible({ timeout: 15_000 });

  // The found chair: the approver says what condition it is in now.
  const found = page.getByTestId("difference").filter({ hasText: room.foundChair.name });
  await expect(found).toContainText("Marked missing, but found here");
  await found.getByRole("button", { name: "Approve" }).click();
  await expect(found.getByTestId("form-error")).toContainText("good or fair");
  await found.getByLabel("Fair").check();
  await s(page, "stocktake-approve-found", project);
  await found.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Difference approved" })).toBeVisible();
  await expect(found).toContainText("back in use as Fair");
  await expect(missing).toContainText(`Approved by ${second.displayName}`);
  await expect(shelf).toContainText(`Rejected by ${second.displayName}`);
  await s(page, "stocktake-decided", project);

  // The chair is now missing; the bin bags still show 12.
  await page.goto(`/items/${room.lostChair.id}`);
  await expect(page.getByTestId("status").first()).toHaveText("Missing");
  await page.goto(`/items/${room.foundChair.id}`);
  await expect(page.getByTestId("status").first()).toHaveText("Fair");
  const { data } = await master().from("stock_levels").select("quantity").eq("item_id", room.bags.id).single();
  expect(data!.quantity).toBe(12);
});

test("finance cannot run a stocktake", async ({ page }, info) => {
  await signInAs(page, finance, "/stocktake");
  await expect(page.getByTestId("cannot-stocktake")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start the stocktake" })).toHaveCount(0);
  await s(page, "stocktake-finance", info.project.name);
});

test("a signed-out visitor opening a stocktake sees only the sign-in page", async ({ page }) => {
  await page.goto("/stocktake/1");
  await expectSignInPage(page);
});
