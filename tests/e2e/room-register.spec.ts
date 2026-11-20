// Slice P1.13 in a real browser, on a PC-sized and a phone-sized window:
// register a whole room. Start from the place page, then each new label needs
// only a name (kind and category are copied from the last item there, the
// place is fixed). A label scanned with the phone's own camera app comes back
// to the room screen while "registering here" is on in that browser. A label
// already on an item is explained. Finance and signed-out visitors get
// nothing. Screens are saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, newTestLabel, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p1-13");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });

test("register a room: scan, name, save, next; kind and category are copied", async ({ page }, info) => {
  const project = info.project.name;
  const db = master();
  const { data: room } = await db.from("locations").select("id, name").eq("name", "Test Room B1").single();
  const { data: last } = await db
    .from("items")
    .select("kind, category_id")
    .eq("location_id", room!.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const [first, second, used] = [await newTestLabel(), await newTestLabel(), "ICCI-000001"];

  await signInAs(page, centre, `/places/${room!.id}`);
  await page.getByRole("button", { name: "Register items in this room" }).click();
  await expect(page).toHaveURL(new RegExp(`/places/${room!.id}/register$`));
  await expect(page.getByRole("heading", { level: 1, name: "Register a Room" })).toBeVisible();
  await expect(visible(page, "room-place")).toContainText("Test Room B1");
  await expect(visible(page, "copied-details")).toContainText("copied from the last item");
  await s(page, "start", project);

  // First label typed in (or read by the camera inside the app): only a name.
  const name1 = `Test run ${Date.now().toString(36)} ${project} room chair`;
  await page.getByLabel("Label number").fill(first);
  await page.getByLabel("Name", { exact: true }).fill(name1);
  await page.getByRole("button", { name: "Save and scan the next" }).click();
  await expect(page.getByRole("status").filter({ visible: true })).toContainText(`${first} registered`);
  await expect(page.getByLabel("Label number")).toHaveValue("");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
  // Newest first; earlier items this admin saved here today may follow.
  await expect(visible(page, "registered-here").getByRole("listitem").first()).toContainText(name1);

  // Second label read by the phone's own camera app: it opens /l/<label>,
  // which comes back here with the number filled in.
  await page.goto(`/l/${second}`);
  await expect(page).toHaveURL(new RegExp(`/places/${room!.id}/register\\?label=${second}$`));
  await expect(page.getByLabel("Label number")).toHaveValue(second);
  const name2 = `Test run ${Date.now().toString(36)} ${project} room table`;
  await page.getByLabel("Name", { exact: true }).fill(name2);
  await page.getByRole("button", { name: "Save and scan the next" }).click();
  await expect(page.getByRole("status").filter({ visible: true })).toContainText(`${second} registered`);
  await expect(visible(page, "registered-here").getByRole("listitem").nth(0)).toContainText(name2);
  await expect(visible(page, "registered-here").getByRole("listitem").nth(1)).toContainText(name1);
  await s(page, "two-registered", project);

  // Both are in the room, with the copied kind and category.
  const { data: made } = await db.from("items").select("label_serial, location_id, kind, category_id").in("label_serial", [first, second]);
  expect(made).toHaveLength(2);
  for (const m of made!) {
    expect(m.location_id).toBe(room!.id);
    expect(m.kind).toBe(last!.kind);
    expect(m.category_id).toBe(last!.category_id);
  }

  // A label already on an item is explained, never registered twice.
  await page.goto(`/places/${room!.id}/register?label=${used}`);
  await expect(visible(page, "label-in-use")).toContainText(`${used} is already on`);
  await s(page, "label-in-use", project);

  // Finish: the phone camera app's labels open the normal pages again.
  await page.getByRole("button", { name: "Finish registering here" }).click();
  await expect(page).toHaveURL(new RegExp(`/places/${room!.id}$`));
  const third = await newTestLabel();
  await page.goto(`/l/${third}`);
  await expect(page).toHaveURL(new RegExp(`/items/new\\?label=${third}$`));
});

test("a shelf can register stock: the counted unit and minimum are asked when changing to consumable", async ({ page }) => {
  const db = master();
  const { data: shelf } = await db.from("locations").select("id").eq("name", "Test Shelf A1-1-1").single();
  const label = await newTestLabel();
  await signInAs(page, centre, `/places/${shelf!.id}/register`);
  await page.getByLabel("Label number").fill(label);
  await page.getByLabel("Name", { exact: true }).fill(`Test run ${Date.now().toString(36)} shelf soap`);
  await page.getByText("Change kind or category").click();
  await page.getByText("Consumable", { exact: true }).click();
  await page.getByLabel("Counted in (unit)").fill("bottle");
  await page.getByLabel("Minimum level").fill("4");
  await page.getByRole("button", { name: "Save and scan the next" }).click();
  await expect(page.getByRole("status").filter({ visible: true })).toContainText(`${label} registered`);
  const { data: item } = await db.from("items").select("kind, unit, minimum_level, location_id").eq("label_serial", label).single();
  expect(item).toMatchObject({ kind: "consumable", unit: "bottle", minimum_level: 4, location_id: shelf!.id });
});

test("finance cannot register a room", async ({ page }) => {
  const { data: room } = await master().from("locations").select("id").eq("name", "Test Room B1").single();
  await signInAs(page, finance, `/places/${room!.id}/register`);
  await expect(page.getByTestId("room-not-allowed")).toBeVisible();
  await expect(page.getByLabel("Label number")).toHaveCount(0);
});

test("a signed-out visitor sees only the sign-in page", async ({ page }) => {
  const { data: room } = await master().from("locations").select("id").eq("name", "Test Room B1").single();
  await page.goto(`/places/${room!.id}/register`);
  await expectSignInPage(page);
});
