// Phase 3, slice P3.1 in a real browser, on a PC-sized and a phone-sized
// window: the Prayer times month grid (made-up sample times this month; type
// a day in, a wrong order is refused naming the day and keeps the typing, a
// correction), and the Slot types screen (starting list, add, move, switch
// off). Finance sees a note. Every screen is saved to docs/screens/.
// Typed-in test months are in 2000-2009 (PC) and 2010-2019 (phone), before
// the app existed, so they never mix with the sample times.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { fullDayLabel, isFriday, monthDays, monthTitle } from "../../src/lib/rota/rules";
import { todayInDublin } from "../../src/lib/vetting/rules";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p3-1");

function master() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function freeTestMonth(project: string): Promise<string> {
  const from = project === "phone" ? 2010 : 2000;
  for (let tries = 0; tries < 50; tries++) {
    const month = `${from + Math.floor(Math.random() * 10)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}`;
    const days = monthDays(month);
    const { count, error } = await master()
      .from("prayer_times")
      .select("id", { count: "exact", head: true })
      .gte("prayer_date", days[0])
      .lte("prayer_date", days.at(-1)!);
    if (error) throw error;
    if (!count) return month;
  }
  throw new Error("No free test month left. Run npm run db:reset.");
}

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

async function typeDay(page: Page, date: string, times: Record<string, string>) {
  const label = fullDayLabel(date);
  const names: Record<string, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha", jumuah_1: "Jumu'ah 1", jumuah_2: "Jumu'ah 2" };
  for (const [k, v] of Object.entries(times)) await page.getByLabel(`${names[k]} on ${label}`, { exact: true }).fill(v);
}

const WINTER = { fajr: "06:45", dhuhr: "12:20", asr: "13:55", maghrib: "16:20", isha: "18:05" };

test("this month shows the made-up sample times, clearly marked", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/rota/prayer-times");
  await expectCurrentMenuLink(page, "Prayer times");
  await expect(page.getByRole("heading", { level: 1, name: "Prayer times" })).toBeVisible();
  await expect(page.getByTestId("month-title")).toHaveText(monthTitle(todayInDublin().slice(0, 7)));
  await expect(page.getByTestId("sample-note")).toContainText("sample times");
  await expect(page.getByTestId("days-entered")).toHaveText("Every day of this month is entered.");
  const today = page.locator(`[data-testid="prayer-day"][data-date="${todayInDublin()}"]`);
  await expect(today).toContainText("Today");
  await expect(today.getByLabel(/^Fajr on /)).not.toHaveValue("");
  await s(page, "prayer-times", project);
});

test("type in a day, a wrong order is refused naming the day, then correct a time", async ({ page }, info) => {
  const project = info.project.name;
  const month = await freeTestMonth(project);
  const days = monthDays(month);
  const weekday = days.find((d) => !isFriday(d))!;
  const friday = days.find(isFriday)!;
  const other = days.find((d) => d !== weekday && !isFriday(d))!;

  await signInAs(page, centre, `/rota/prayer-times?month=${month}`);
  await expect(page.getByTestId("month-title")).toHaveText(monthTitle(month));
  await expect(page.getByTestId("days-entered")).toHaveText(`0 of ${days.length} days entered.`);
  // Jumu'ah boxes on Fridays only.
  await expect(page.getByLabel(`Jumu'ah 1 on ${fullDayLabel(friday)}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel(`Jumu'ah 1 on ${fullDayLabel(weekday)}`, { exact: true })).toHaveCount(0);

  await typeDay(page, weekday, WINTER);
  await typeDay(page, friday, { ...WINTER, jumuah_1: "13:00", jumuah_2: "14:00" });
  await page.getByRole("button", { name: "Save this month" }).first().click();
  await expect(page.getByTestId("notice")).toHaveText(/Saved: 2 days added, 0 days corrected/);
  await expect(page.getByTestId("days-entered")).toHaveText(`2 of ${days.length} days entered.`);

  // Asr before Dhuhr: refused, the day is named, and what was typed stays.
  await typeDay(page, other, { ...WINTER, asr: "11:30" });
  await page.getByRole("button", { name: "Save this month" }).first().click();
  await expect(page.getByTestId("form-error")).toContainText(`${fullDayLabel(other)}: Asr must be after Dhuhr.`);
  await expect(page.getByLabel(`Asr on ${fullDayLabel(other)}`, { exact: true })).toHaveValue("11:30");
  await expect(page.getByLabel(`Isha on ${fullDayLabel(other)}`, { exact: true })).toHaveValue("18:05");
  await s(page, "prayer-times-wrong-order", project);

  // Fix it and correct the earlier day's Isha in the same save.
  await typeDay(page, other, { asr: "14:00" });
  await typeDay(page, weekday, { isha: "18:15" });
  await page.getByRole("button", { name: "Save this month" }).first().click();
  await expect(page.getByTestId("notice")).toHaveText(/Saved: 1 day added, 1 day corrected/);
  await expect(page.getByLabel(`Isha on ${fullDayLabel(weekday)}`, { exact: true })).toHaveValue("18:15");
  await s(page, "prayer-times-saved", project);

  // A day already entered cannot be emptied.
  await page.getByLabel(`Fajr on ${fullDayLabel(weekday)}`, { exact: true }).fill("");
  for (const k of ["Dhuhr", "Asr", "Maghrib", "Isha"]) await page.getByLabel(`${k} on ${fullDayLabel(weekday)}`, { exact: true }).fill("");
  await page.getByRole("button", { name: "Save this month" }).first().click();
  await expect(page.getByTestId("form-error")).toContainText("corrected, but not removed");
});

test("slot types: the starting list, add one, move it up, switch it off", async ({ page }, info) => {
  const project = info.project.name;
  const name = `Test run ${Date.now()} ${project} car park`;
  await signInAs(page, centre, "/rota/slot-types");
  await expectCurrentMenuLink(page, "Slot types");
  await expect(page.getByRole("heading", { level: 1, name: "Slot types" })).toBeVisible();
  const prayers = page.getByTestId("slot-group-prayer");
  // The starting five come first (other test runs may add more after them).
  await expect(prayers.getByTestId("slot-name").first()).toHaveText("Fajr");
  expect((await prayers.getByTestId("slot-name").allTextContents()).slice(0, 5)).toEqual(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]);
  await expect(prayers.getByTestId("slot-type").first()).toContainText("Time from Prayer times: Fajr");
  const security = page.getByTestId("slot-type").filter({ hasText: "Security" });
  await expect(security).toContainText("Needs Garda vetting");
  await expect(page.getByTestId("slot-type").filter({ hasText: /^Cleaning/ })).toContainText("No vetting needed");
  await s(page, "slot-types", project);

  // A prayer slot asks which time it takes; a shift does not.
  const add = page.getByRole("form", { name: "Add a slot type" });
  await add.getByLabel("Group").selectOption("prayer");
  await expect(add.getByLabel("Prayer time it takes")).toBeVisible();
  await add.getByLabel("Group").selectOption("shift");
  await expect(add.getByLabel("Prayer time it takes")).toHaveCount(0);

  await add.getByLabel("Name").fill(name);
  await add.getByLabel("Needs Garda vetting").check();
  await add.getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/added at the end/i);
  const shifts = page.getByTestId("slot-group-shift").getByTestId("slot-name");
  await expect(shifts.last()).toHaveText(name);
  const card = page.getByTestId("slot-type").filter({ hasText: name });
  await expect(card).toContainText("Needs Garda vetting");
  await expect(card.getByRole("button", { name: `Move ${name} down` })).toBeDisabled();

  await card.getByRole("button", { name: `Move ${name} up` }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Order changed/);
  const order = await shifts.allTextContents();
  expect(order.indexOf(name)).toBe(order.length - 2);
  await s(page, "slot-types-added", project);

  // Untick vetting, then switch it off.
  await card.getByText("Change name or vetting").click();
  await card.getByRole("form").getByLabel("Needs Garda vetting").uncheck();
  await card.getByRole("form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Changes saved/);
  await expect(card).toContainText("No vetting needed");
  await card.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Switched off/);
  await expect(page.getByTestId("slot-group-shift")).not.toContainText(name);
  await page.getByText(/^Switched off \(/).click();
  await expect(page.getByTestId("slot-types-off")).toContainText(name);
});

test("finance sees a note instead of prayer times and slot types", async ({ page }, info) => {
  await signInAs(page, finance, "/rota/prayer-times");
  await expect(page.getByTestId("cannot-see-rota")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.goto("/rota/slot-types");
  await expect(page.getByTestId("cannot-see-rota")).toBeVisible();
  await s(page, "rota-finance", info.project.name);
});
