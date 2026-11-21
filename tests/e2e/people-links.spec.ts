// Phase 2, slice P2.2 in a real browser, on a PC-sized and a phone-sized
// window: "Reported by" is picked from the people directory (starting with
// you, if your account is linked), "Someone else" lets you type a name, the
// item history links to the person, the person page lists what they
// reported, and a Super Admin links and unlinks an admin account.
// Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, newTestLabel, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const superAdmin = seedAdmin("super_admin");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p2-2");

function master() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function newTestAsset(project: string) {
  const db = master();
  const [cat, loc] = await Promise.all([
    db.from("item_categories").select("id").eq("name", "Other furniture").single(),
    db.from("locations").select("id").eq("name", "Test Room A1").single(),
  ]);
  const name = `Test run ${Date.now()} ${project} bench`;
  const { data, error } = await db
    .from("items")
    .insert({ label_serial: await newTestLabel(), kind: "fixed_asset", name, category_id: cat.data!.id, location_id: loc.data!.id, condition: "good", value_cents: 9000 })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, name };
}

async function newTestPerson(project: string) {
  const db = master();
  const [role, section] = await Promise.all([
    db.from("person_roles").select("id").eq("name", "Staff").single(),
    db.from("sections").select("id").eq("name", "Administration").single(),
  ]);
  const full_name = `Test run ${Date.now()} ${project} Placeholder`;
  const { data, error } = await db.from("people").insert({ full_name, person_role_id: role.data!.id, section_id: section.data!.id }).select("id").single();
  if (error) throw error;
  return { id: data.id as string, full_name };
}

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

test("report damage picked from the directory, linked in the history and on the person page", async ({ page }, info) => {
  const project = info.project.name;
  const item = await newTestAsset(project);

  await signInAs(page, centre, `/items/${item.id}/asset/damage`);
  // Starts with you, because your account is linked to your person record.
  const who = page.getByLabel("Reported by");
  await expect(who.locator("option:checked")).toHaveText("Test Centre Admin (you)");
  await page.getByLabel("Note").fill("Test: one leg is loose (made-up)");
  await s(page, "report-damage-picker", project);

  // "Someone else" opens a box to type a name; switching back hides it.
  await who.selectOption({ label: "Someone else (type the name)" });
  await expect(page.getByLabel("Their name")).toBeVisible();
  await s(page, "report-someone-else", project);
  await who.selectOption({ label: "Test Centre Admin (you)" });
  await expect(page.getByLabel("Their name")).toHaveCount(0);

  await page.getByRole("button", { name: "Report damage" }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}\\?done=`));
  const history = page.getByTestId("asset-events");
  await expect(history.getByRole("link", { name: "Test Centre Admin" })).toBeVisible();
  await s(page, "item-history-person-link", project);

  // The person page lists what they reported.
  await history.getByRole("link", { name: "Test Centre Admin" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Test Centre Admin" })).toBeVisible();
  const reported = page.getByTestId("reported-entries");
  await expect(reported).toContainText(item.name);
  await expect(reported).toContainText("Reported damaged");
  // A Centre Admin sees the link but cannot change it.
  await expect(page.getByTestId("admin-account")).toContainText("Test Centre Admin");
  await expect(page.getByRole("button", { name: /link/i })).toHaveCount(0);
  await s(page, "person-reported-entries", project);
});

test("a Super Admin links an admin account to a person, and removes it; never their own", async ({ page }, info) => {
  const project = info.project.name;
  const person = await newTestPerson(project);

  await signInAs(page, superAdmin, `/people/${person.id}`);
  const box = page.getByTestId("admin-account");
  await expect(box).toContainText("Not linked to an admin account");
  const choose = box.getByLabel("Admin account");
  await expect(choose.locator("option", { hasText: "Test Super Admin" })).toBeDisabled();
  await expect(choose.locator("option", { hasText: "Test Centre Admin" })).toBeDisabled();
  await choose.selectOption({ label: "Test Finance Officer (Finance)" });
  await s(page, "person-link-account", project);
  await box.getByRole("button", { name: "Link this account" }).click();

  await expect(page.getByTestId("notice")).toHaveText(/linked/i);
  await expect(box).toContainText("Linked to Test Finance Officer");
  await s(page, "person-linked", project);

  await box.getByRole("button", { name: "Remove the link" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/removed/i);
  await expect(box).toContainText("Not linked to an admin account");
});
