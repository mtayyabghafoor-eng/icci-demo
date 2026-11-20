// Slice P1.12 in a real browser, on a PC-sized and a phone-sized window: add
// a building, room, store room and shelf; rename; print place labels (14 per
// A4, QR holds only /p/PL-0001); scanning a place label opens its page; a
// place that still holds things cannot be switched off; Finance and
// signed-out visitors see nothing. Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, mainMenu, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p1-12");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

async function addInside(page: Page, button: RegExp, name: string) {
  await page.getByRole("link", { name: button }).click();
  await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill(name);
  await page.getByRole("button", { name: /^Add / }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByRole("status").filter({ visible: true })).toContainText("Place added");
}

test("add a building, room, store room and shelf; rename; print place labels", async ({ page }, info) => {
  const project = info.project.name;
  const stamp = `Test run ${Date.now().toString(36)} ${project}`;

  await signInAs(page, centre, "/places");
  await expect(page.getByRole("heading", { level: 1, name: "Places" })).toBeVisible();
  await expectCurrentMenuLink(page, "Places");
  await expect(page.getByTestId("places-tree")).toContainText("Test Building A");
  await expect(page.getByTestId("place-row").first()).toHaveAttribute("data-code", /^PL-\d{4,}$/);
  await s(page, "places-list", project);

  await page.getByRole("link", { name: "Add a building" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a Building" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill(`${stamp} building`);
  await s(page, "add-building", project);
  await page.getByRole("button", { name: "Add building" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${stamp} building` })).toBeVisible();
  await expect(page.getByTestId("place-code").filter({ visible: true })).toHaveText(/^PL-\d{4,}$/);

  await addInside(page, /Add a room/, `${stamp} room`);
  await addInside(page, /Add a store room/, `${stamp} store`);
  const storeUrl = page.url();
  await addInside(page, /Add a shelf/, "Shelf B3");
  // A shelf has nothing inside it.
  await expect(page.getByRole("main").getByRole("link", { name: /Add a / }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByTestId("nothing-here").filter({ visible: true })).toBeVisible();
  await s(page, "shelf-page", project);

  // Rename: the number stays the same.
  const code = await page.getByTestId("place-code").filter({ visible: true }).innerText();
  await page.getByRole("link", { name: "Rename" }).click();
  await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill("Shelf B3 (Qurans)");
  await s(page, "rename", project);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Shelf B3 (Qurans)" })).toBeVisible();
  await expect(page.getByTestId("place-code").filter({ visible: true })).toHaveText(code);

  // The same name twice in one store room is refused in plain words.
  await page.goto(storeUrl);
  await page.getByRole("link", { name: /Add a shelf/ }).click();
  await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill("shelf b3 (qurans)");
  await page.getByRole("button", { name: "Add shelf" }).click();
  await expect(page.getByTestId("form-error").filter({ visible: true })).toContainText("already a place called that");

  // Labels for the store room and the shelf inside it.
  await page.goto(storeUrl);
  await expect(page.getByTestId("places-inside").filter({ visible: true })).toContainText("Shelf B3 (Qurans)");
  await s(page, "store-room-page", project);
  await page.getByRole("main").getByRole("link", { name: "Print labels" }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Place Labels" })).toBeVisible();
  await expect(page.getByTestId("place-label-count")).toContainText("2 labels on 1 A4 sheet of 14");
  const labels = page.getByTestId("place-label");
  await expect(labels).toHaveCount(2);
  await expect(labels.nth(1)).toContainText("Shelf B3 (Qurans)");
  await expect(labels.nth(1)).toContainText(code);
  await expect(labels.nth(1)).toContainText(`${stamp} building › ${stamp} room › ${stamp} store`);
  await expect(labels.nth(1)).toContainText("TEST LABEL");
  await expect(labels.nth(1)).toHaveAttribute("data-link", new RegExp(`^https?://[^/]+/p/${code}$`));
  await expect(page.getByRole("img", { name: `QR code for ${code}` })).toBeVisible();
  await s(page, "place-labels", project);

  // Only this store room, after two used spaces.
  await page.getByLabel("Which labels").selectOption({ label: "Only this store room" });
  await page.getByLabel(/Skip the first spaces/).fill("2");
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page.getByTestId("place-label")).toHaveCount(1);
  await expect(page.locator(".label-cell").nth(2)).toHaveAttribute("data-testid", "place-label");

  await page.emulateMedia({ media: "print" });
  await s(page, "place-labels-on-paper", project);
  await page.emulateMedia({ media: "screen" });
});

test("scanning a place label opens its page; Register an item here fills in the place", async ({ page }, info) => {
  const project = info.project.name;
  const { data: shelf } = await master().from("locations").select("id, code, name").eq("name", "Test Shelf A1-1-2").single();
  const code = `PL-${String(shelf!.code).padStart(4, "0")}`;

  await signInAs(page, centre, `/p/${code}`);
  await expect(page).toHaveURL(new RegExp(`/places/${shelf!.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Test Shelf A1-1-2" })).toBeVisible();
  await expect(page.getByTestId("items-here").filter({ visible: true }).getByRole("listitem").first()).toBeVisible();
  await expectCurrentMenuLink(page, "Places");
  await s(page, "scanned-shelf", project);

  await page.getByRole("link", { name: "Register an item here" }).click();
  await expect(page).toHaveURL(new RegExp(`/items/new\\?location=${shelf!.id}$`));

  // A typed lower-case number works too; an unknown number does not.
  await page.goto(`/p/${code.toLowerCase()}`);
  await expect(page).toHaveURL(new RegExp(`/places/${shelf!.id}$`));
  await page.goto("/p/PL-9999999");
  await expect(page.getByRole("heading", { level: 1, name: "Label Not Recognised" })).toBeVisible();
});

test("a place that still holds things cannot be switched off; an empty one can, and back on", async ({ page }, info) => {
  const project = info.project.name;
  const db = master();
  const { data: full } = await db.from("locations").select("id").eq("name", "Test Room A1").single();

  await signInAs(page, centre, `/places/${full!.id}`);
  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByTestId("form-error").filter({ visible: true })).toContainText(/places inside it first|still holds/);
  await s(page, "switch-off-refused", project);

  // An empty shelf made for this test.
  const { data: store } = await db.from("locations").select("id").eq("name", "Test Store Room A2-1").single();
  await page.goto(`/places/new?inside=${store!.id}`);
  await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill(`Test run ${Date.now().toString(36)} ${project} empty shelf`);
  await page.getByRole("button", { name: "Add shelf" }).click();
  await expect(page.getByRole("status").filter({ visible: true })).toContainText("Place added");
  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByRole("status").filter({ visible: true })).toContainText("Switched off");
  await expect(page.getByTestId("status").filter({ visible: true })).toContainText("Switched off");
  await expect(page.getByRole("link", { name: "Register an item here" }).filter({ visible: true })).toHaveCount(0);
  await s(page, "switched-off", project);
  await page.getByRole("button", { name: "Switch back on" }).click();
  await expect(page.getByRole("status").filter({ visible: true })).toContainText("Switched back on");
});

test("finance sees no places, and a place label tells finance nothing", async ({ page }) => {
  const { data: shelf } = await master().from("locations").select("code").eq("name", "Test Shelf A1-1-1").single();
  const code = `PL-${String(shelf!.code).padStart(4, "0")}`;
  await signInAs(page, finance, "/places");
  await expect(page.getByTestId("places-not-allowed")).toBeVisible();
  await expect((await mainMenu(page)).getByRole("link", { name: "Places", exact: true })).toHaveCount(0);
  await page.goto(`/p/${code}`);
  await expect(page.getByRole("heading", { level: 1, name: "Label Not Recognised" })).toBeVisible();
});

test("a signed-out visitor scanning a place label sees only the sign-in page", async ({ page }) => {
  await page.goto("/p/PL-0001");
  await expectSignInPage(page);
  await page.goto("/places");
  await expectSignInPage(page);
});
