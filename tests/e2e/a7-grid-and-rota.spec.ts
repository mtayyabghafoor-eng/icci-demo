// Slice A7 in a real browser, on a PC-sized and a phone-sized window: a
// policy grid square opens Record sign-off with that person ticked and Save
// comes back to the grid; names and titles stay in view while scrolling; the
// rota's print page warns about changes not yet published; the template note;
// Today's rota shows warnings; "Also put this person on" other days.
// New test weeks are far ahead (2060-2064 on a PC, 2065-2069 on a phone).
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { weekStartOf } from "../../src/lib/rota/week";
import { todayInDublin } from "../../src/lib/vetting/rules";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "a7");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function signInAs(page: Page, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

async function newPerson(name: string, role: string, section: string) {
  const db = master();
  const [r, sec] = await Promise.all([
    db.from("person_roles").select("id").eq("name", role).single(),
    db.from("sections").select("id").eq("name", section).single(),
  ]);
  const { data, error } = await db.from("people").insert({ full_name: name, person_role_id: r.data!.id, section_id: sec.data!.id }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function freeMonday(fromYear: number): Promise<string> {
  for (let tries = 0; tries < 50; tries++) {
    const d = new Date(Date.UTC(fromYear, 0, 1) + Math.floor(Math.random() * 5 * 365) * 86_400_000);
    const monday = weekStartOf(d.toISOString().slice(0, 10));
    const { count } = await master().from("rota_weeks").select("id", { count: "exact", head: true }).eq("week_start", monday);
    if (!count) return monday;
  }
  throw new Error("No free test week found. Run npm run db:reset.");
}

test("a grid square opens Record sign-off with that person ticked; Save comes back to the grid", async ({ page }, info) => {
  const project = info.project.name;
  const name = `Test run ${Date.now()} ${project} Grid Cleaner`;
  const person = await newPerson(name, "Cleaner", "Maintenance");

  await signInAs(page, "/policies/grid?status=attention");
  const scroll = page.getByTestId("policy-grid-scroll");
  // The header row and the names column stay put while the grid scrolls.
  await expect(scroll.locator("thead th").first()).toHaveCSS("position", "sticky");
  await expect(scroll.locator('[data-testid="grid-person"] td').first()).toHaveCSS("position", "sticky");

  const row = page.getByTestId("grid-person").filter({ hasText: name });
  await row.scrollIntoViewIfNeeded();
  await s(page, "grid-squares", project);
  await row.getByTestId("grid-square-link").first().click();
  await expect(page).toHaveURL(new RegExp(`/sign-off\\?person=${person}&grid=status%3Dattention$`));
  await expect(page.getByRole("checkbox", { name })).toBeChecked();
  await expect(page.getByTestId("back-button")).toHaveAttribute("href", "/policies/grid?status=attention");
  await page.getByLabel("Date signed").fill(todayInDublin());
  await s(page, "signoff-ticked", project);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/policies\/grid\?status=attention$/);
  await expect(page.getByRole("status").filter({ hasText: "Sign-off recorded for 1 person." })).toBeVisible();
  // Signed: the Cleaner had one policy to sign, so they leave the "attention" grid.
  await expect(page.getByTestId("grid-person").filter({ hasText: name })).toHaveCount(0);
});

test("rota: the print page warns about unpublished changes; the template note; today's warnings", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, "/rota");
  // This made-up week is published and has one slot changed since.
  await expect(page.getByTestId("template-note")).toContainText("only offered while nobody is on the week yet");
  await page.getByRole("link", { name: "Print the published rota" }).click();
  await expect(page.getByTestId("unpublished-changes")).toContainText("not published yet");
  await expect(page.getByTestId("unpublished-changes").getByRole("link", { name: "Publish again" })).toBeVisible();
  await s(page, "print-unpublished-changes", project);

  await page.goto("/rota/today");
  const { count } = await master().from("rota_warnings").select("assignment_id", { count: "exact", head: true }).eq("assignment_date", todayInDublin());
  await expect(page.getByTestId("slot-warning")).toHaveCount(count ?? 0);
  if (count) await expect(page.getByTestId("today-summary")).toContainText(/warnings?/);
  await s(page, "today-warnings", project);
});

test("rota: put someone on a prayer, then on the same prayer on other days in one step", async ({ page }, info) => {
  const project = info.project.name;
  const monday = await freeMonday(project === "phone" ? 2065 : 2060);
  const name = `Test run ${Date.now()} ${project} Multiday`;
  await newPerson(name, "Volunteer", "Volunteers");

  await signInAs(page, `/rota?week=${monday}`);
  await page.getByRole("button", { name: /^Start this week.s rota$/ }).click();
  await expect(page.getByTestId("notice")).toContainText("Week started");
  // No prayer time that far ahead: the link to Prayer times is there.
  await expect(page.getByTestId("prayer-time-note").getByRole("link", { name: "Enter prayer times" })).toHaveAttribute("href", "/rota/prayer-times");

  const slot = page.getByTestId("rota-slot").filter({ visible: true }).and(page.locator(`[data-date="${monday}"]`)).first();
  await slot.click();
  await page.getByRole("search", { name: "Search people" }).getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: `Put ${name} on this slot` }).click();

  // The same prayer is empty on the other six days: offered in one step.
  await expect(page.getByTestId("notice")).toContainText(`${name} is on the slot`);
  const days = page.getByTestId("more-days").getByRole("checkbox");
  await expect(days).toHaveCount(6);
  await days.nth(0).check();
  await days.nth(1).check();
  await s(page, "also-put-on", project);
  await page.getByRole("button", { name: `Put ${name} on the ticked days` }).click();

  await expect(page).toHaveURL(new RegExp(`/rota\\?week=${monday}`));
  await expect(page.getByTestId("notice").filter({ visible: true })).toHaveText(/on 2 more days too/);
  await expect(page.getByTestId("rota-slot").filter({ visible: true }).filter({ hasText: name })).toHaveCount(3);
});
