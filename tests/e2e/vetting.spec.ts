// Phase 2, slice P2.3 in a real browser, on a PC-sized and a phone-sized
// window: record Garda vetting (the expiry fills itself in as 3 years later
// and can be changed), the person page history, withdrawing a wrong entry,
// no recording your own vetting, the vetting list with its CSV, the People
// list chip and filter, and the home page counter. Finance sees a note.
// Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { addDays, addYears, todayInDublin } from "../../src/lib/vetting/rules";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot, showFilters } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p2-3");

function master() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function newTestPerson(project: string) {
  const db = master();
  const [role, section] = await Promise.all([
    db.from("person_roles").select("id").eq("name", "Volunteer").single(),
    db.from("sections").select("id").eq("name", "Volunteers").single(),
  ]);
  const full_name = `Test run ${Date.now()} ${project} Madeup`;
  const { data, error } = await db.from("people").insert({ full_name, person_role_id: role.data!.id, section_id: section.data!.id }).select("id").single();
  if (error) throw error;
  return { id: data.id as string, full_name };
}

async function ownPersonId(email: string) {
  const db = master();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email)!.id;
  const { data, error } = await db.from("people").select("id").eq("app_user_id", userId).single();
  if (error) throw new Error(`${email} is not linked to a person (run npm run db:seed)`);
  return data.id as string;
}

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

test("record vetting with the 3-year expiry, then withdraw a wrong entry", async ({ page }, info) => {
  const project = info.project.name;
  const person = await newTestPerson(project);
  const vettedOn = addDays(todayInDublin(), -10);

  await signInAs(page, centre, `/people/${person.id}`);
  const box = page.getByTestId("vetting");
  await expect(box.getByTestId("vetting-status")).toHaveText("Not vetted");
  await expect(box).toContainText("Nothing on record");
  await s(page, "person-not-vetted", project);

  await box.getByRole("link", { name: "Record vetting" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Record vetting" })).toBeVisible();
  await page.getByLabel("Vetted", { exact: true }).check();
  await page.getByLabel("Date", { exact: true }).fill(vettedOn);
  // Filled in automatically: 3 years after the vetted date.
  await expect(page.getByLabel("Expires on")).toHaveValue(addYears(vettedOn, 3));
  await s(page, "record-vetting", project);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(new RegExp(`/people/${person.id}\\?done=vetting-recorded$`));
  await expect(page.getByTestId("notice")).toHaveText(/recorded/i);
  await expect(box.getByTestId("vetting-status")).toHaveText("Valid");
  const history = page.getByTestId("vetting-history").getByRole("listitem");
  await expect(history).toHaveCount(1);
  await s(page, "person-vetted", project);

  // That was wrong: withdraw it with a reason.
  await history.first().getByText("Withdraw this entry").click();
  await history.first().getByLabel("Why is it wrong?").fill("Test: entered for the wrong person");
  await history.first().getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/withdrawn/i);
  await expect(box.getByTestId("vetting-status")).toHaveText("Not vetted");
  // Both stay in the history: the withdrawn one is marked so.
  await expect(history.first()).toContainText("Withdrawn");
  await expect(history.first()).toContainText("Test: entered for the wrong person");
  await s(page, "person-withdrawn", project);

  // A different expiry for this person (5 years), and "applied" has no expiry box.
  await box.getByRole("link", { name: "Record vetting" }).click();
  await page.getByLabel("Applied for vetting").check();
  await expect(page.getByLabel("Expires on")).toBeHidden();
  await page.getByLabel("Vetted", { exact: true }).check();
  await page.getByLabel("Date", { exact: true }).fill(vettedOn);
  await page.getByLabel("Expires on").fill(addYears(vettedOn, 5));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/recorded/i);
  await expect(page.getByTestId("vetting-history").getByRole("listitem")).toHaveCount(2);
});

test("a future date is refused on the form", async ({ page }, info) => {
  const person = await newTestPerson(info.project.name);
  await signInAs(page, centre, `/people/${person.id}/vetting`);
  await page.getByLabel("Applied for vetting").check();
  await page.getByLabel("Date", { exact: true }).fill(addDays(todayInDublin(), 3));
  await page.getByRole("button", { name: "Save" }).click();
  // The browser itself refuses it (the box allows today at the latest), so
  // nothing is sent; the database refuses it too (tests/db/vetting.test.ts).
  const valid = await page.getByLabel("Date", { exact: true }).evaluate((el) => (el as HTMLInputElement).checkValidity());
  expect(valid).toBe(false);
  await expect(page).toHaveURL(new RegExp(`/people/${person.id}/vetting$`));
  const { count } = await master().from("vetting_records").select("id", { count: "exact", head: true }).eq("person_id", person.id);
  expect(count).toBe(0);
});

test("nobody can record their own vetting", async ({ page }, info) => {
  const mine = await ownPersonId(centre.email);
  await signInAs(page, centre, `/people/${mine}`);
  const box = page.getByTestId("vetting");
  await expect(box).toContainText("This is you");
  await expect(box.getByRole("link", { name: "Record vetting" })).toHaveCount(0);
  await s(page, "own-vetting", info.project.name);
  // Going to the form directly does not help.
  await page.goto(`/people/${mine}/vetting`);
  await expect(page.getByTestId("own-vetting")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});

test("the vetting list, worst first, with a CSV; the People list chip; the home counter", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/people/vetting");
  await expect(page.getByRole("heading", { level: 1, name: "Garda vetting" })).toBeVisible();
  await expectCurrentMenuLink(page, "Garda vetting");
  const rows = page.getByTestId("vetting-row").filter({ visible: true });
  await expect(rows.first()).toBeVisible();
  // Worst first: the first row is expired or not vetted (the seed has both).
  await expect(rows.first().getByTestId("status")).toHaveText(/Expired|Not vetted/);
  await s(page, "vetting-list", project);

  // Filter: only "due soon".
  await showFilters(page);
  await page.getByLabel("Status").selectOption({ label: "Due soon" });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/status=due/);
  for (const text of await rows.allInnerTexts()) expect(text).toContain("Due soon");

  // The CSV.
  const csv = await page.request.get("/people/vetting/csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toMatch(/icci-garda-vetting-\d{4}-\d{2}-\d{2}\.csv/);
  expect(await csv.text()).toContain("Name,Role,Section,Status,Vetted on,Expires on,Re-vetting applied on");

  // The People list shows a vetting chip and can filter by it.
  await page.goto("/people?vetting=expired");
  const people = page.getByTestId("person-row").filter({ visible: true });
  await expect(people.first()).toBeVisible();
  for (const text of await people.allInnerTexts()) expect(text).toContain("Expired");
  await s(page, "people-list-expired", project);

  // The home page counter opens the vetting list.
  await page.goto("/");
  const counter = page.getByTestId("counter-vetting");
  await expect(counter).toContainText("Garda vetting");
  await expect(counter.getByTestId("count")).toHaveText(/^[1-9]\d*$/);
  await s(page, "home", project);
  await counter.click();
  await expect(page).toHaveURL(/\/people\/vetting$/);
});

test("finance sees a note instead of vetting, and gets no CSV", async ({ page }, info) => {
  await signInAs(page, finance, "/people/vetting");
  await expect(page.getByTestId("cannot-see-people")).toBeVisible();
  expect((await page.request.get("/people/vetting/csv")).status()).toBe(403);
  await s(page, "vetting-finance", info.project.name);
});
