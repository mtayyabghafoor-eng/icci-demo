// Slice 6 in a real browser, on a PC-sized and a phone-sized window:
// move an asset, report damage, mark it repaired, mark it missing, see it on
// the missing and damaged list, mark it found, send it for disposal, and
// have a DIFFERENT admin approve. Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { clickMenuLink, completeSignIn, expectSignInPage, newTestLabel, shot, confirmSheet } from "./helpers";

const centre = seedAdmin("centre_admin");
const second = SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!;
const s = (page: Page, name: string, project: string) => shot(page, name, project, "06");

/** A blank 1 x 1 pixel picture: obviously not a real photo. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function master() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A fresh, obviously fictional fixed asset in Test Room A1, in good condition. */
async function newTestAsset(project: string) {
  const db = master();
  const [cat, loc] = await Promise.all([
    db.from("item_categories").select("id").eq("name", "Other furniture").single(),
    db.from("locations").select("id").eq("name", "Test Room A1").single(),
  ]);
  const name = `Test run ${Date.now()} ${project} lectern`;
  const { data, error } = await db
    .from("items")
    .insert({
      label_serial: await newTestLabel(),
      kind: "fixed_asset",
      name,
      category_id: cat.data!.id,
      location_id: loc.data!.id,
      condition: "good",
      value_cents: 45000,
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

const field = (page: Page, label: string) => page.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");

async function fillReport(page: Page, note: string, who = "Test caretaker (fictional)") {
  // By role, so a previous screen kept hidden by the browser is ignored.
  await page.getByRole("textbox", { name: "Note" }).fill(note);
  // Someone not in the people directory: pick "Someone else" and type the name (P2.2).
  await page.getByRole("combobox", { name: "Reported by" }).selectOption({ label: "Someone else (type the name)" });
  await page.getByRole("textbox", { name: "Their name" }).fill(who);
}

test("move, damage, repair, missing, found, then disposal approved by a different admin", async ({ page }, info) => {
  const project = info.project.name;
  const item = await newTestAsset(project);

  await signInAs(page, centre, `/items/${item.id}`);
  await expect(page.getByRole("heading", { level: 1, name: item.name })).toBeVisible();
  const actions = page.getByTestId("asset-actions");
  // A4: one "Report a problem" (with a "broken or damaged" tick) instead of "Report damage".
  await expect(actions.getByRole("link")).toHaveText(["Report a problem", "Move", "Mark missing", "Dispose"]);

  // Move, with a photo.
  await actions.getByRole("link", { name: "Move" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Move this asset" })).toBeVisible();
  // Nothing is saved without the required boxes.
  await page.getByRole("button", { name: "Move" }).click();
  await expect(page).toHaveURL(/\/asset\/move$/);
  await page.getByRole("combobox", { name: "Where is it going?" }).selectOption({ label: "Test Building B › Test Room B1" });
  await fillReport(page, "Test move: needed for the made-up open day");
  await page.getByTestId("photo-input").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: TINY_PNG });
  await expect(page.getByAltText("Preview of the new photo")).toBeVisible();
  await s(page, "move", project);
  await page.getByRole("button", { name: "Move" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Asset moved." })).toBeVisible();
  await expect(field(page, "Location")).toHaveText("Test Building B › Test Room B1");
  const events = page.getByTestId("asset-events");
  await expect(events).toContainText("Moved: Test Building A › Test Room A1 → Test Building B › Test Room B1");
  await expect(events).toContainText("Reported by Test caretaker (fictional)");
  await expect(events.getByAltText("Photo with this entry")).toBeVisible();

  // Report damage (A4: the damage form is still there for the older "Open a ticket for this" path).
  await page.goto(`/items/${item.id}/asset/damage`);
  await expect(page.getByRole("heading", { level: 1, name: "Report damage" })).toBeVisible();
  await fillReport(page, "Test report: the made-up shelf is cracked");
  await s(page, "report-damage", project);
  await page.getByRole("button", { name: "Report damage" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Damage reported." })).toBeVisible();
  await expect(page.getByTestId("status").first()).toHaveText("Damaged");
  await expect(actions.getByRole("link")).toHaveText(["Report a problem", "Move", "Mark repaired", "Mark missing", "Dispose"]);

  // Mark repaired, as Fair.
  await actions.getByRole("link", { name: "Mark repaired" }).click();
  await page.getByRole("radio", { name: "Fair" }).check();
  await fillReport(page, "Test repair: glued and checked");
  await s(page, "mark-repaired", project);
  await page.getByRole("button", { name: "Mark repaired" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked repaired." })).toBeVisible();
  await expect(page.getByTestId("status").first()).toHaveText("Fair");

  // Mark missing.
  await actions.getByRole("link", { name: "Mark missing" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mark missing" })).toBeVisible();
  await fillReport(page, "Test report: not in its room at the weekly check", "Test volunteer (fictional)");
  await s(page, "mark-missing", project);
  await page.getByRole("button", { name: "Mark missing" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked missing." })).toBeVisible();
  await expect(page.getByTestId("status").first()).toHaveText("Missing");
  await expect(actions.getByRole("link")).toHaveText(["Report a problem", "Mark found", "Dispose"]);

  // It is on the missing and damaged list, opened from the menu.
  await clickMenuLink(page, "Missing and damaged");
  await expect(page.getByRole("heading", { level: 1, name: "Missing and damaged" })).toBeVisible();
  await expect(page.getByTestId("asset-count")).toHaveText(/damaged · \d+ missing/); // loaded
  await s(page, "missing-damaged-list", project);
  await page.getByRole("textbox", { name: "Search" }).fill(item.name);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("asset-count")).toHaveText("0 damaged · 1 missing");
  const row = (project === "phone" ? page.locator("ul li") : page.locator("tbody tr")).filter({ hasText: item.name });
  await expect(row).toContainText("Missing");
  await expect(row).toContainText("reported by Test volunteer (fictional)");
  await s(page, "missing-damaged-search", project);
  await row.getByRole("link").first().click();

  // Mark found.
  await actions.getByRole("link", { name: "Mark found" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mark found" })).toBeVisible();
  await fillReport(page, "Test: found in the store room");
  await s(page, "mark-found", project);
  await page.getByRole("button", { name: "Mark found" }).click();
  await expect(page.getByTestId("status").first()).toHaveText("Good");

  // Send for disposal: nothing changes until a different admin approves.
  await actions.getByRole("link", { name: "Dispose" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dispose of this asset" })).toBeVisible();
  await page.getByLabel("Recycled").check();
  await fillReport(page, "Test disposal: made-up, no longer needed");
  await s(page, "dispose", project);
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Disposal sent." })).toBeVisible();
  await expect(page.getByTestId("status").first()).toHaveText("Good");
  await expect(page.getByTestId("asset-actions")).toHaveCount(0);
  await expect(page.getByText("A disposal of this asset is waiting for approval")).toBeVisible();
  await expect(events.locator("li").first()).toContainText("Waiting for approval");
  await s(page, "item-moves-and-reports", project);

  // The same admin cannot approve it.
  await page.goto("/assets/approvals");
  const mine = page.getByTestId("pending-disposal").filter({ hasText: item.name });
  await expect(mine).toContainText("a different admin must decide on it");
  await expect(mine.getByRole("button", { name: "Approve disposal" })).toHaveCount(0);
  await mine.screenshot({ path: `docs/screens/slice-06-disposal-own-${project}.png`, caret: "initial" });

  // A different admin approves it.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expectSignInPage(page);
  await signInAs(page, second, "/assets/approvals");
  const theirs = page.getByTestId("pending-disposal").filter({ hasText: item.name });
  await expect(theirs).toContainText("sent by Test Centre Admin");
  await expect(theirs.getByTestId("disposal-route")).toHaveText("How it leaves: Recycled");
  await s(page, "disposals-waiting", project);
  await theirs.getByRole("button", { name: "Reject" }).click();
  await expect(theirs.getByTestId("form-error")).toContainText("Write why you are rejecting it");
  await theirs.screenshot({ path: `docs/screens/slice-06-disposal-one-${project}.png`, caret: "initial" });
  await theirs.getByRole("button", { name: "Approve disposal" }).click();
  await confirmSheet(page);
  await expect(page.getByRole("status").filter({ hasText: "Disposal approved." })).toBeVisible();
  await expect(page.getByTestId("pending-disposal").filter({ hasText: item.name })).toHaveCount(0);

  await page.goto(`/items/${item.id}`);
  await expect(page.getByTestId("status").first()).toHaveText("Disposed");
  await expect(page.getByTestId("asset-actions")).toHaveCount(0);
  await expect(page.getByText("This asset has been disposed of.")).toBeVisible();
  await expect(page.getByTestId("asset-events")).toContainText(`Approved by ${second.displayName}`);
  await s(page, "item-disposed", project);
});

test("consumables have no asset buttons; finance sees nothing on the missing and damaged list", async ({ page }) => {
  const db = master();
  const { data: consumable } = await db.from("items").select("id").eq("kind", "consumable").limit(1).single();
  await signInAs(page, centre, `/items/${consumable!.id}`);
  await expect(page.getByRole("link", { name: "Count this shelf" })).toBeVisible();
  await expect(page.getByTestId("asset-actions")).toHaveCount(0);
  await page.goto(`/items/${consumable!.id}/asset/damage`);
  await expect(page.getByRole("heading", { level: 1, name: "Report damage" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expectSignInPage(page);

  await signInAs(page, seedAdmin("finance"), "/assets");
  await expect(page.getByTestId("asset-count")).toHaveText("Nothing is damaged or missing here.");
});
