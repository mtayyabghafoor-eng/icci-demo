// Phase 3, slice P3.3 in a real browser, on a PC-sized and a phone-sized
// window: this week's made-up rota (published once by the seed, then one
// name changed), publishing a new week with the warnings tick, changing one
// name and publishing again (exactly that slot is "Changed" on the one-page
// rota), today's rota and its Home card, and Finance's note. Every screen is
// saved to docs/screens/. Test weeks are far ahead (2050-2059 on a PC,
// 2040-2049 on a phone) so they never mix with other tests.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { weekStartOf } from "../../src/lib/rota/week";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p3-3");

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

async function newTestPerson(label: string) {
  const db = master();
  const [role, section] = await Promise.all([
    db.from("person_roles").select("id").eq("name", "Board member").single(),
    db.from("sections").select("id").eq("name", "Volunteers").single(),
  ]);
  const full_name = `Test run ${Date.now()} ${label}`;
  const { data, error } = await db.from("people").insert({ full_name, person_role_id: role.data!.id, section_id: section.data!.id }).select("id").single();
  if (error) throw error;
  return { id: data.id as string, full_name };
}

/** Puts a person on the week's Monday Fajr slot with the master key (as the screen would: a replacing entry). */
async function putOnFajr(monday: string, personId: string) {
  const db = master();
  const { data: week } = await db.from("rota_weeks").select("id").eq("week_start", monday).single();
  const { data: fajr } = await db.from("rota_slot_types").select("id").eq("name", "Fajr").single();
  const { data: slot, error } = await db
    .from("rota_entries")
    .select("id")
    .eq("week_id", week!.id)
    .eq("assignment_date", monday)
    .eq("slot_type_id", fajr!.id)
    .limit(1)
    .single();
  if (error) throw error;
  const ins = await db
    .from("rota_assignments")
    .insert({ week_id: week!.id, assignment_date: monday, slot_type_id: fajr!.id, person_id: personId, replaces_id: slot.id });
  if (ins.error) throw ins.error;
}

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

/** Only what is on screen: Next.js keeps the previous screen, hidden, for the Back button. */
const shown = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const changedSlots = (page: Page) => shown(page, "slot-changed");

test("this week's made-up rota says when it was published and marks the changed slot", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/rota");
  await expect(shown(page, "published-line")).toContainText(/^Published .+ by /);
  await expect(page.getByRole("link", { name: "Publish again" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Print the published rota" })).toBeVisible();
  await s(page, "rota-week-published", project);

  await page.getByRole("link", { name: "Print the published rota" }).click();
  await expect(page).toHaveURL(/\/rota\/print\/\d+$/);
  await expect(shown(page, "rota-print")).toBeVisible();
  await expect(shown(page, "print-published")).toContainText("First publication of this week.");
  await expect(shown(page, "rota-print")).not.toContainText(/\+353|@/);
  await s(page, "rota-print-first", project);

  // "Save as PDF": the whole made-up week fits on one A4 landscape page.
  if (project === "desktop") {
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, path: "docs/screens/slice-p3-3-rota-sample.pdf" });
    const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(1);
    const size = pdf.toString("latin1").match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/);
    expect(Number(size![1])).toBeGreaterThan(Number(size![2])); // wider than tall: landscape
    await page.emulateMedia({ media: "screen" });
  }
});

test("publish a week with warnings, change one name, publish again: exactly that slot is Changed", async ({ page }, info) => {
  const project = info.project.name;
  const monday = await freeMonday(project === "phone" ? 2040 : 2050, 10);
  const first = await newTestPerson(`${project} Rotafirst`);
  const second = await newTestPerson(`${project} Rotasecond`);

  await signInAs(page, centre, `/rota?week=${monday}`);
  await page.getByRole("button", { name: /^Start this week.s rota$/ }).click();
  await expect(shown(page, "notice")).toContainText("Week started");
  await putOnFajr(monday, first.id);

  await page.getByRole("link", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/rota/publish\\?week=${monday}$`));
  await expect(shown(page, "publish-summary")).toContainText("Not published yet");
  // No prayer times are entered that far ahead, so every prayer slot warns.
  await expect(shown(page, "publish-warnings").getByText("No prayer time entered for this day").first()).toBeVisible();
  const tick = page.getByRole("checkbox", { name: /I have seen the warnings/ });
  await expect(tick).toBeVisible();
  await s(page, "rota-publish", project);
  await tick.check();
  await page.getByRole("button", { name: "Publish and print" }).click();

  await expect(page).toHaveURL(/\/rota\/print\/\d+\?new=1$/);
  await expect(shown(page, "notice")).toContainText("Published.");
  await expect(shown(page, "print-published")).toContainText("First publication of this week.");
  await expect(shown(page, "rota-print")).toContainText(`${first.full_name} (Board member)`);
  await expect(page.locator('[data-testid="print-entry"][data-changed="yes"]').filter({ visible: true })).toHaveCount(0);

  // Change one name after publishing.
  await putOnFajr(monday, second.id);
  await page.goto(`/rota?week=${monday}`);
  await expect(shown(page, "published-line")).toContainText("Since it was last published: 1 slot added or changed.");
  await expect(changedSlots(page)).toHaveCount(1);
  await expect(shown(page, "rota-slot").filter({ has: page.getByTestId("slot-changed") })).toContainText(second.full_name);
  await s(page, "rota-week-changed", project);

  await page.getByRole("link", { name: "Publish again" }).click();
  await expect(shown(page, "publish-summary")).toContainText("1 slot added or changed");
  await page.getByRole("checkbox", { name: /I have seen the warnings/ }).check();
  await page.getByRole("button", { name: "Publish again and print" }).click();

  await expect(page).toHaveURL(/\/rota\/print\/\d+\?new=1$/);
  await expect(shown(page, "print-published")).toContainText("(version 2 of this week)");
  await expect(shown(page, "print-published")).toContainText("Changed since the version before: 1");
  const changed = page.locator('[data-testid="print-entry"][data-changed="yes"]').filter({ visible: true });
  await expect(changed).toHaveCount(1);
  await expect(changed).toContainText("Changed");
  await expect(changed).toContainText(`${second.full_name} (Board member)`);
  await s(page, "rota-print-changed", project);

  // Back on the week, nothing is waiting to be published.
  await page.goto(`/rota?week=${monday}`);
  await expect(shown(page, "published-line")).toContainText("(2 times). No changes since it was last published.");
  await expect(changedSlots(page)).toHaveCount(0);
});

test("today's rota opens from its Home card", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/");
  const card = page.getByRole("link", { name: /Today's rota: slots not filled/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/rota\/today$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today's Rota");
  await expect(shown(page, "today-summary")).toContainText(/^\d+ of \d+ slots filled/);
  await expect(shown(page, "today-slot").first()).toBeVisible();
  await s(page, "rota-today", project);
});

test("finance sees a note instead of publishing or printing", async ({ page }, info) => {
  await signInAs(page, finance, "/rota/publish");
  await expect(shown(page, "cannot-see-rota")).toBeVisible();
  const { data } = await master().from("rota_publications").select("id").limit(1).single();
  await page.goto(`/rota/print/${data!.id}`);
  await expect(shown(page, "cannot-see-rota")).toBeVisible();
  await expect(shown(page, "rota-print")).toHaveCount(0);
  await s(page, "rota-publish-finance", info.project.name);
});
