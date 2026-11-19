// Phase 3, slice P3.4 in a real browser, on a PC-sized and a phone-sized
// window: the four templates, editing a template's slots (on a test template
// of its own, so the four real ones are never changed by a test), using the
// Normal week and an Eid template on a new week, the refusal on a week that
// already has people on it, funeral on call with its phone number on
// Today's rota, and Finance's note. Every screen is saved to docs/screens/.
// Test weeks are far ahead (2060-2064 on a PC, 2065-2069 on a phone).
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { fullDayLabel } from "../../src/lib/rota/rules";
import { weekStartOf } from "../../src/lib/rota/week";
import { addDays, todayInDublin } from "../../src/lib/vetting/rules";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p3-4");

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

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

/** Only what is on screen: Next.js keeps the previous screen, hidden, for the Back button. */
const shown = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

test("the four templates; Normal week has funeral on call every day", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/rota/templates");
  await expectCurrentMenuLink(page, "Templates");
  const cards = shown(page, "template-card");
  for (const name of ["Normal week", "Ramadan", "Eid al-Fitr", "Eid al-Adha"]) await expect(cards.filter({ has: page.getByRole("heading", { name, exact: true }) })).toHaveCount(1);
  await expect(cards.filter({ has: page.getByRole("heading", { name: "Eid al-Fitr", exact: true }) })).toContainText("One day (Eid)");
  await s(page, "rota-templates", project);

  await page.getByRole("link", { name: "Normal week", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal week");
  await expect(shown(page, "template-slot").filter({ hasText: "Funeral on call, All day" })).toHaveCount(7);
  await s(page, "rota-template-normal", project);

  await page.goto(`/rota/templates`);
  await page.getByRole("link", { name: "Eid al-Fitr", exact: true }).click();
  await expect(shown(page, "template-days")).toContainText("On the day of Eid");
  await expect(shown(page, "template-slot").filter({ hasText: "Eid prayer" })).toHaveCount(1);
  await s(page, "rota-template-eid", project);
});

test("add slots to a template for several days at once, then switch one off", async ({ page }, info) => {
  const project = info.project.name;
  const { data: t, error } = await master()
    .from("rota_templates")
    .insert({ name: `Test run ${Date.now()} ${project} template`, kind: "week", description: "A test template." })
    .select("id")
    .single();
  if (error) throw error;
  await signInAs(page, centre, `/rota/templates/${t.id}`);
  const form = page.getByRole("form", { name: "Add a template slot" });
  await form.getByLabel("Day").selectOption("weekdays");
  await form.getByLabel("Slot").selectOption({ label: "Security (Shifts)" });
  await form.getByLabel("Start time").fill("18:00");
  await form.getByLabel("End time").fill("22:00");
  await form.getByLabel("How many people").fill("2");
  await form.getByRole("button", { name: "Add to the template" }).click();
  await expect(shown(page, "notice")).toContainText("5 slots added to the template.");
  await expect(shown(page, "template-slot").filter({ hasText: "Security, 18:00–22:00, 2 people" })).toHaveCount(5);

  await page.getByRole("button", { name: "Switch off: Friday, Security, 18:00–22:00, 2 people" }).click();
  await expect(shown(page, "notice")).toContainText("Switched off.");
  await expect(shown(page, "template-days").getByTestId("template-slot")).toHaveCount(4);
  await expect(page.getByText("Switched off (1)")).toBeVisible();
  await s(page, "rota-template-edit", project);
});

test("fill a new week from the Normal week, then add Eid on one day", async ({ page }, info) => {
  const project = info.project.name;
  const monday = await freeMonday(project === "phone" ? 2065 : 2060, 5);
  await signInAs(page, centre, `/rota?week=${monday}`);
  await page.getByRole("button", { name: /^Start this week.s rota$/ }).click();
  await expect(shown(page, "notice")).toContainText("Use a template");
  const before = await shown(page, "rota-slot").count();

  await page.getByRole("link", { name: "Use a template" }).click();
  await expect(page).toHaveURL(new RegExp(`/rota/use-template\\?week=${monday}$`));
  await expect(shown(page, "use-template-card").filter({ hasText: "Normal week" })).toHaveCount(1);
  await s(page, "rota-use-template", project);
  await page.getByRole("button", { name: "Use Normal week" }).click();

  await expect(page).toHaveURL(new RegExp(`/rota\\?week=${monday}&done=template&count=\\d+$`));
  const added = Number(new URL(page.url()).searchParams.get("count"));
  expect(added).toBeGreaterThan(20);
  await expect(shown(page, "notice")).toContainText(`Template used: ${added} empty slots added.`);
  await expect(shown(page, "rota-slot")).toHaveCount(before + added);
  await expect(shown(page, "rota-slot").filter({ hasText: "All day" })).toHaveCount(7); // funeral on call, every day
  await s(page, "rota-week-from-template", project);

  // A second week template is refused; an Eid day can go on top.
  await page.getByRole("link", { name: "Use a template" }).click();
  await expect(shown(page, "template-uses")).toContainText("Already used on this week: Normal week.");
  await expect(shown(page, "use-template-card").filter({ hasText: "Ramadan" })).toContainText("this week already has the Normal week template");
  const eid = shown(page, "use-template-card").filter({ hasText: "Eid al-Fitr" });
  const wednesday = addDays(monday, 2);
  await eid.getByLabel("Which day is Eid?").selectOption(wednesday);
  await eid.getByRole("button", { name: "Use Eid al-Fitr" }).click();
  await expect(shown(page, "notice")).toContainText("Template used: 8 empty slots added.");
  const eidSlot = page.locator(`[data-testid="rota-slot"][data-date="${wednesday}"]`).filter({ visible: true }).filter({ hasText: "08:30–09:30" });
  await expect(eidSlot).toHaveCount(1);
  await expect(eidSlot).toHaveAttribute("aria-label", new RegExp(`^Eid prayer on ${fullDayLabel(wednesday)}`));
});

test("a week with people on it cannot use a template", async ({ page }, info) => {
  const thisWeek = weekStartOf(todayInDublin());
  await signInAs(page, centre, `/rota?week=${thisWeek}`);
  await expect(page.getByRole("link", { name: "Publish again" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Use a template" })).toHaveCount(0);
  await page.goto(`/rota/use-template?week=${thisWeek}`);
  await expect(shown(page, "template-blocked")).toContainText("People are already on this week");
  await expect(page.getByRole("button", { name: /^Use / })).toHaveCount(0);
  await s(page, "rota-use-template-blocked", info.project.name);
});

test("today's rota shows who is on funeral call, with their phone number", async ({ page }, info) => {
  await signInAs(page, centre, "/rota/today");
  const onCall = shown(page, "on-call-today");
  await expect(onCall).toBeVisible();
  await expect(onCall).toContainText("Funeral on call");
  await expect(onCall).toContainText(/All day/);
  // The seed puts someone with a made-up phone number on call, except on Mondays, Thursdays and Sundays.
  if (!/Nobody on call yet/.test((await onCall.textContent()) ?? "")) await expect(shown(page, "on-call-phone").first()).toBeVisible();
  await s(page, "rota-today-on-call", info.project.name);
});

test("finance sees a note instead of the templates", async ({ page }, info) => {
  await signInAs(page, finance, "/rota/templates");
  await expect(shown(page, "cannot-see-rota")).toBeVisible();
  await expect(shown(page, "template-list")).toHaveCount(0);
  const { data } = await master().from("rota_templates").select("id").eq("name", "Normal week").single();
  await page.goto(`/rota/templates/${data!.id}`);
  await expect(shown(page, "cannot-see-rota")).toBeVisible();
  await expect(shown(page, "template-slot")).toHaveCount(0);
  await s(page, "rota-templates-finance", info.project.name);
});
