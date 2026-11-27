// Slice E9 in a real browser, on a PC-sized and a phone-sized window: Arabic
// text reads right-to-left everywhere. An Arabic item name and an Arabic
// place name are typed, saved, and read right-to-left both in the box and on
// the page; an email box stays left-to-right. Names are made up and marked
// as a test (تجريبي). Screens saved to docs/screens/.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { apiAs, completeSignIn, expectSignInPage, newTestLabel, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const direction = (l: Locator) => l.evaluate((el) => getComputedStyle(el).direction);

async function signInAs(page: Page, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

test("an Arabic item name and place name read right-to-left in the box and on the page", async ({ page }, info) => {
  const db = master();
  const [cat, loc] = await Promise.all([
    db.from("item_categories").select("id").eq("name", "Other furniture").single(),
    db.from("locations").select("id").eq("name", "Test Room A1").single(),
  ]);
  const { data: item, error } = await (await apiAs(centre.email))
    .from("items")
    .insert({ label_serial: await newTestLabel(), kind: "fixed_asset", name: `Test run ${Date.now()} ${info.project.name} E9`, category_id: cat.data!.id, location_id: loc.data!.id, condition: "good" })
    .select("id")
    .single();
  if (error) throw error;
  const itemName = `كرسي تجريبي ${Date.now() % 100000}`;

  await signInAs(page, `/items/${item.id}/edit`);
  const nameBox = page.getByRole("textbox", { name: "Name" });
  await nameBox.fill(itemName);
  expect(await direction(nameBox)).toBe("rtl");
  await page.getByTestId("save-bar").filter({ visible: true }).getByRole("button").first().click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}`));
  const title = page.getByRole("heading", { level: 1, name: itemName });
  await expect(title).toBeVisible();
  expect(await direction(title)).toBe("rtl");
  await shot(page, "arabic-item", info.project.name, "e9");

  // A made-up place, renamed in Arabic.
  const { data: place, error: pe } = await db.from("locations").insert({ name: `Test run ${Date.now()} ${info.project.name} E9 room`, kind: "building" }).select("id").single();
  if (pe) throw pe;
  const placeName = `قاعة تجريبية ${Date.now() % 100000}`;
  await page.goto(`/places/${place.id}/edit`);
  const placeBox = page.locator("#name");
  await placeBox.fill(placeName);
  expect(await direction(placeBox)).toBe("rtl");
  await page.getByTestId("save-bar").filter({ visible: true }).getByRole("button").first().click();
  const placeTitle = page.getByRole("heading", { level: 1 }).filter({ hasText: placeName });
  await expect(placeTitle).toBeVisible();
  expect(await direction(placeTitle)).toBe("rtl");
  await shot(page, "arabic-place", info.project.name, "e9");
  // Put the test place away again (switched off, never deleted).
  await db.from("locations").update({ active: false }).eq("id", place.id);
});

test("an email box stays left-to-right; an empty text box starts left-to-right", async ({ page }) => {
  await signInAs(page, "/companies/new");
  expect(await direction(page.getByRole("textbox", { name: /Email/ }))).toBe("ltr");
  expect(await direction(page.getByRole("textbox", { name: "Name" }))).toBe("ltr");
  expect(await page.getByRole("textbox", { name: "Name" }).getAttribute("dir")).toBe("auto");
});
