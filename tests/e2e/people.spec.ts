// Phase 2, slice P2.1 in a real browser, on a PC-sized and a phone-sized
// window: the people list with search and filters, add a person (with the
// same-name warning), edit, switch off and back on. Finance sees a note.
// Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot, showFilters, applyFilters } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p2-1");

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

test("people list: search and filter", async ({ page }, info) => {
  await signInAs(page, centre, "/people");
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
  await expectCurrentMenuLink(page, "People");
  await expect(page.getByTestId("people-count")).toHaveText(/\d+ people/);
  await s(page, "people-list", info.project.name);

  // Filter by role: only imams are shown.
  await showFilters(page);
  await page.getByLabel("Role").selectOption({ label: "Imam" });
  await applyFilters(page);
  await expect(page).toHaveURL(/role=/);
  // Only the rows shown on this screen size (PC table or phone cards).
  const rows = page.getByTestId("person-row").filter({ visible: true });
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allInnerTexts()) expect(text).toContain("Imam");
  await s(page, "people-list-imams", info.project.name);

  // Switched-off people appear only when asked for. E2: that list does not
  // repeat "Switched off" on every row; Everyone (the mixed list) says it.
  await page.goto("/people?show=off");
  for (const text of await rows.allInnerTexts()) expect(text).not.toContain("Active");
  await page.goto("/people?show=all");
  for (const text of await rows.allInnerTexts()) expect(text).toMatch(/Active|Switched off/);
});

/** At least `n` people in the directory: switched-off made-up ones are added if needed. */
async function atLeastPeople(n: number) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { count } = await db.from("people").select("id", { count: "exact", head: true });
  const short = n - (count ?? 0);
  if (short <= 0) return;
  const role = (await db.from("person_roles").select("id").eq("name", "Volunteer").single()).data!.id;
  const section = (await db.from("sections").select("id").eq("name", "Volunteers").single()).data!.id;
  const rows = Array.from({ length: short }, (_, i) => ({ full_name: `Test run filler person ${Date.now()} ${i}`, person_role_id: role, section_id: section, active: false }));
  const { error } = await db.from("people").insert(rows);
  if (error) throw error;
}

test("people list: 50 at a time, with Previous and Next", async ({ page }, info) => {
  // "Everyone" includes switched-off people. Round C2: on a freshly reset
  // database the seed has fewer than 50, so made-up ones are added first.
  await atLeastPeople(75);
  await signInAs(page, centre, "/people?show=all");
  const count = page.getByTestId("people-count");
  await expect(count).toHaveText(/\d+ people/);
  const total = Number((await count.innerText()).replace(/\D/g, ""));
  expect(total).toBeGreaterThan(50);
  const rows = page.getByTestId("person-row").filter({ visible: true });
  await expect(rows).toHaveCount(50);
  const pages = page.getByRole("navigation", { name: "Pages" });
  await expect(pages).toContainText(`1 to 50 of ${total.toLocaleString("en-IE")}`);
  const firstOnPageOne = await rows.first().innerText();

  // Next keeps the filter and shows the next 50 (or fewer on the last page).
  await pages.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/show=all/);
  await expect(page).toHaveURL(/page=2/);
  await expect(pages).toContainText(`51 to ${Math.min(100, total).toLocaleString("en-IE")} of`);
  await expect(rows).toHaveCount(Math.min(50, total - 50));
  expect(await rows.first().innerText()).not.toBe(firstOnPageOne);
  await s(page, "people-list-page-2", info.project.name);

  // A page past the end shows the last page, not an empty list.
  await page.goto("/people?show=all&page=9999");
  await expect(rows.first()).toBeVisible();
  await expect(pages.getByRole("link", { name: "Next" })).toHaveCount(0);
});

test("add a person, see the same-name warning, edit, switch off and back on", async ({ page }, info) => {
  const project = info.project.name;
  const name = `Test run ${Date.now()} ${project} Sample`;

  await signInAs(page, centre, "/people/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add a person" })).toBeVisible();
  // Nothing is saved without the required boxes.
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/people\/new$/);

  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Role").selectOption({ label: "Volunteer" });
  await page.getByLabel("Section").selectOption({ label: "Volunteers" });
  await page.getByLabel("Phone").fill("+353 00 000 0777");
  await page.getByLabel("Start date").fill("2026-11-01");
  await s(page, "person-add", project);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByTestId("notice")).toHaveText(/added/i);
  await expect(page.getByTestId("person-status")).toHaveText("Active");
  await s(page, "person-detail", project);
  const firstUrl = page.url();

  // The same name again: a warning, not a refusal.
  await page.goto("/people/new");
  await page.getByLabel("Full name").fill(name.toLowerCase());
  await page.getByLabel("Role").selectOption({ label: "Volunteer" });
  await page.getByLabel("Section").selectOption({ label: "Volunteers" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("same-name-warning")).toContainText("already a person called");
  await s(page, "person-same-name", project);
  // "Yes, this is a different person" saves the second one; the database
  // keeps that answer (migration 0053).
  await page.getByRole("button", { name: "Yes, this is a different person: save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/added/i);
  expect(page.url()).not.toBe(firstUrl);
  await page.goto(firstUrl);

  // Edit the phone.
  await page.getByRole("link", { name: "Edit details" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit person" })).toBeVisible();
  await page.getByLabel("Phone").fill("not a phone");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("form-error")).toContainText(/phone/i);
  await page.getByLabel("Phone").fill("+353 00 000 0888");
  await s(page, "person-edit", project);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/saved/i);
  await expect(page.getByText("+353 00 000 0888")).toBeVisible();

  // Switch off, then back on.
  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByTestId("person-status")).toHaveText("Switched off");
  await s(page, "person-switched-off", project);
  await page.getByRole("button", { name: "Switch back on" }).click();
  await expect(page.getByTestId("person-status")).toHaveText("Active");
});

test("finance sees a note instead of the people directory", async ({ page }, info) => {
  await signInAs(page, finance, "/people");
  await expect(page.getByTestId("cannot-see-people")).toHaveText(/Only a Super Admin or Centre Admin/);
  await expect(page.getByTestId("person-row")).toHaveCount(0);
  await s(page, "people-finance", info.project.name);
});
