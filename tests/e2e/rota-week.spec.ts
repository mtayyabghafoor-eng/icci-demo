// Phase 3, slice P3.2 in a real browser, on a PC-sized and a phone-sized
// window: this week's made-up rota with its warnings, starting a new week,
// adding a shift, picking a person (vetting shown, "already on" that day),
// taking them off, a locked past week, and Finance's note. Every screen is
// saved to docs/screens/. New test weeks are far ahead (2080-2089 on a PC,
// 2070-2079 on a phone), so they never mix with the made-up weeks; past
// weeks are recorded with the master key in 2020-2023.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { fullDayLabel } from "../../src/lib/rota/rules";
import { weekStartOf, weekTitle } from "../../src/lib/rota/week";
import { addDays, todayInDublin } from "../../src/lib/vetting/rules";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p3-2");

function master() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function freeMonday(fromYear: number, years: number): Promise<string> {
  for (let tries = 0; tries < 50; tries++) {
    const d = new Date(Date.UTC(fromYear, 0, 1) + Math.floor(Math.random() * years * 365) * 86_400_000);
    const monday = weekStartOf(d.toISOString().slice(0, 10));
    const { count } = await master().from("rota_weeks").select("id", { count: "exact", head: true }).eq("week_start", monday);
    if (!count) return monday;
  }
  throw new Error("No free test week found. Run npm run db:reset.");
}

async function newTestPerson(project: string) {
  const db = master();
  const [role, section] = await Promise.all([
    db.from("person_roles").select("id").eq("name", "Volunteer").single(),
    db.from("sections").select("id").eq("name", "Volunteers").single(),
  ]);
  const full_name = `Test run ${Date.now()} ${project} Rotaperson`;
  const { error } = await db.from("people").insert({ full_name, person_role_id: role.data!.id, section_id: section.data!.id });
  if (error) throw error;
  return full_name;
}

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

/** The slots shown on this screen size (the PC grid and the phone list are separate). */
const slots = (page: Page) => page.getByTestId("rota-slot").filter({ visible: true });

test("this week's made-up rota shows filled and empty slots, and its warnings in words", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/rota");
  await expectCurrentMenuLink(page, "Rota week");
  await expect(page.getByTestId("week-title")).toHaveText(weekTitle(weekStartOf(todayInDublin())));
  await expect(page.getByTestId("week-summary")).toContainText(/\d+ of \d+ slots filled · 3 warnings/);
  await expect(slots(page).filter({ hasText: "Not filled yet" }).first()).toBeVisible();
  await expect(page.getByTestId("slot-warning").filter({ visible: true }).filter({ hasText: "Garda vetting expired before this day" })).toHaveCount(1);
  await expect(page.getByTestId("slot-warning").filter({ visible: true }).filter({ hasText: /^Also on Reception at 10:00–16:00 that day$/ })).toHaveCount(1);
  await expect(page.getByTestId("slot-warning").filter({ visible: true }).filter({ hasText: /^Also on Dhuhr at \d\d:\d\d that day$/ })).toHaveCount(1);
  await s(page, "rota-week", project);
});

test("start a week, add a shift, put someone on it, then take them off", async ({ page }, info) => {
  const project = info.project.name;
  const monday = await freeMonday(project === "phone" ? 2070 : 2080, 10);
  const wednesday = addDays(monday, 2);
  const person = await newTestPerson(project);

  await signInAs(page, centre, `/rota?week=${monday}`);
  await expect(page.getByText("This week has no rota yet.")).toBeVisible();
  await s(page, "rota-week-empty", project);
  await page.getByRole("button", { name: /^Start this week.s rota$/ }).click();
  await expect(page.getByTestId("notice")).toContainText("Week started");
  await expect(page.getByTestId("week-summary")).toContainText(/^0 of \d+ slots filled/);
  // No prayer times are entered that far ahead: each prayer slot says so.
  await expect(slots(page).first()).toContainText("No prayer time entered for this day");

  await page.getByRole("link", { name: "Add a slot" }).click();
  const form = page.getByRole("form", { name: "Add a slot" });
  await form.getByLabel("Day").selectOption(wednesday);
  await form.getByLabel("Slot").selectOption({ label: "Security (Shifts)" });
  await form.getByLabel("Start time").fill("09:00");
  await form.getByLabel("End time").fill("13:00");
  await s(page, "rota-add-slot", project);
  await form.getByRole("button", { name: "Add the slot" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Slot added/);

  const security = () => slots(page).filter({ hasText: "09:00–13:00" });
  await security().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Security, ${fullDayLabel(wednesday)}`);
  await page.getByRole("search", { name: "Search people" }).getByLabel("Name").fill(person);
  await page.getByRole("button", { name: "Search" }).click();
  const row = page.getByTestId("picker-person").filter({ hasText: person });
  await expect(row).toContainText("Not vetted");
  await s(page, "rota-pick-person", project);
  await row.getByRole("button", { name: `Put ${person} on this slot` }).click();

  await expect(page.getByTestId("notice")).toHaveText(/on the slot/);
  await expect(security()).toContainText(person);
  await expect(security()).toContainText("Garda vetting needed, none on record");
  await s(page, "rota-week-assigned", project);

  // On another slot that day, the picker says they are already on Security.
  await slots(page).filter({ hasText: "Not filled yet" }).and(page.locator(`[data-date="${wednesday}"]`)).first().click();
  await page.getByRole("search", { name: "Search people" }).getByLabel("Name").fill(person);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("picker-busy")).toHaveText("Already on: Security 09:00–13:00");
  await page.goBack();
  await page.goBack();

  await page.goto(`/rota?week=${monday}`);
  await security().click();
  await page.getByRole("button", { name: `Take ${person} off this slot` }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Taken off/);
  await expect(security()).toContainText("Not filled yet");
});

test("a week that has ended is locked", async ({ page }, info) => {
  const project = info.project.name;
  const monday = await freeMonday(2020, 4);
  const { error } = await master().from("rota_weeks").insert({ week_start: monday });
  if (error) throw error;
  await signInAs(page, centre, `/rota?week=${monday}`);
  await expect(page.getByText("Ended: locked")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add a slot" })).toHaveCount(0);
  await slots(page).first().click();
  await expect(page.getByText("this slot can no longer be changed")).toBeVisible();
  await expect(page.getByTestId("person-picker")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Remove this slot/ })).toHaveCount(0);
  await s(page, "rota-slot-locked", project);
});

test("finance sees a note instead of the rota", async ({ page }, info) => {
  await signInAs(page, finance, "/rota");
  await expect(page.getByTestId("cannot-see-rota")).toBeVisible();
  await page.goto("/rota/add");
  await expect(page.getByTestId("cannot-see-rota")).toBeVisible();
  await s(page, "rota-finance", info.project.name);
});
