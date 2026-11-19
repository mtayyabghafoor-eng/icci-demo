// Phase 2, slice P2.7 in a real browser, on a PC-sized and a phone-sized
// window: register a vehicle on a labelled asset, record motor tax (valid
// until fills itself in a year later), withdraw a wrong entry, mark "NCT not
// needed yet", the vehicles list worst first, the asset page link, and
// Finance's note. Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { addDays, addYears, todayInDublin } from "../../src/lib/vetting/rules";
import { apiAs, completeSignIn, expectCurrentMenuLink, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p2-7");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

/** A new labelled asset in the "Vehicles" category, registered as an admin would. */
async function newVehicleAsset(project: string) {
  const c = await apiAs(centre.email);
  const { data: run, error: runError } = await c.rpc("print_new_labels", { p_count: 1 });
  if (runError) throw runError;
  const label = `ICCI-${String((run as { first_number: number }).first_number).padStart(6, "0")}`;
  const db = master();
  const [cat, place] = await Promise.all([
    db.from("item_categories").select("id").eq("name", "Vehicles").single(),
    db.from("locations").select("id").eq("name", "Test Building B").single(),
  ]);
  const name = `Test run ${Date.now()} ${project} van`;
  const { data, error } = await c
    .from("items")
    .insert({ label_serial: label, kind: "fixed_asset", name, category_id: cat.data!.id, location_id: place.data!.id, condition: "good" })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, name, label };
}

test("register a vehicle, record and withdraw motor tax, NCT not needed yet", async ({ page }, info) => {
  const project = info.project.name;
  const asset = await newVehicleAsset(project);
  const registration = `TR ${Date.now().toString(36).toUpperCase()}`;

  await signInAs(page, centre, "/vehicles/new");
  await expect(page.getByRole("heading", { level: 1, name: "Register a vehicle" })).toBeVisible();
  await expectCurrentMenuLink(page, "Vehicles");
  await page.getByLabel("Asset", { exact: true }).selectOption({ label: `${asset.name} (${asset.label})` });
  await page.getByLabel("Registration").fill(registration.toLowerCase());
  await page.getByLabel(/Make and model/).fill("Test Van (made up)");
  await page.getByLabel("Keeper").selectOption({ label: "Test Hamza Example" });
  await s(page, "register-vehicle", project);
  await page.getByRole("button", { name: "Register vehicle" }).click();

  await expect(page.getByTestId("notice")).toHaveText(/Vehicle registered/);
  await expect(page.getByRole("heading", { level: 1, name: registration })).toBeVisible();
  await expect(page.getByTestId("keeper")).toHaveText("Test Hamza Example");
  for (const kind of ["tax", "insurance", "nct"]) await expect(page.getByTestId(`date-${kind}`).getByTestId("status")).toHaveText("Not recorded");

  // Record motor tax.
  await page.getByRole("link", { name: "Record motor tax renewal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Record a renewal" })).toBeVisible();
  await expect(page.getByLabel("What was renewed")).toHaveValue("tax");
  const renewedOn = addDays(todayInDublin(), -3);
  await page.getByLabel("Renewed on").fill(renewedOn);
  await expect(page.getByLabel("Valid until")).toHaveValue(addYears(renewedOn, 1));
  await s(page, "record-renewal", project);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Renewal recorded/);
  await expect(page.getByTestId("date-tax").getByTestId("status")).toHaveText("Valid");
  await s(page, "vehicle-page", project);

  // That was wrong: withdraw it.
  const entry = page.getByTestId("renewal-history").getByRole("listitem").first();
  await entry.getByText("Withdraw this entry").click();
  await entry.getByLabel("Why is it wrong?").fill("Test: wrong vehicle");
  await entry.getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/withdrawn/i);
  await expect(page.getByTestId("date-tax").getByTestId("status")).toHaveText("Not recorded");
  await expect(entry).toContainText("Test: wrong vehicle");

  // A newer car: NCT not needed yet.
  await page.getByRole("link", { name: "Change details" }).click();
  await page.getByRole("checkbox", { name: /NCT not needed yet/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Changes saved/);
  await expect(page.getByTestId("date-nct").getByTestId("status")).toHaveText("Not needed yet");
  await s(page, "vehicle-withdrawn-nct-not-needed", project);

  // The asset's own page points to the vehicle page.
  await page.goto(`/items/${asset.id}`);
  await expect(page.getByTestId("item-vehicle")).toContainText(registration);
});

test("the vehicles list, worst first", async ({ page }, info) => {
  await signInAs(page, centre, "/vehicles");
  await expect(page.getByRole("heading", { level: 1, name: "Vehicles" })).toBeVisible();
  const rows = page.getByTestId("vehicle-row").filter({ visible: true });
  // The seed's van has expired motor tax, so it is first.
  await expect(rows.first()).toContainText("TEST-VAN-1");
  await expect(rows.first().getByTestId("date-tax").getByTestId("status")).toHaveText("Expired");
  const car = rows.filter({ hasText: "TEST-CAR-1" });
  await expect(car.getByTestId("date-nct").getByTestId("status")).toHaveText("Not needed yet");
  await expect(car.getByTestId("date-insurance").getByTestId("status")).toHaveText("Due soon");
  await s(page, "vehicles-list", info.project.name);
});

test("finance sees a note instead of vehicles", async ({ page }, info) => {
  await signInAs(page, finance, "/vehicles");
  await expect(page.getByTestId("cannot-see-vehicles")).toBeVisible();
  await page.goto("/vehicles/new");
  await expect(page.getByTestId("cannot-see-vehicles")).toBeVisible();
  await s(page, "vehicles-finance", info.project.name);
});
