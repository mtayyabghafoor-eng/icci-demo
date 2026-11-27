// Phase 2, slice P2.4 in a real browser, on a PC-sized and a phone-sized
// window: record training (the expiry fills itself in from the type's usual
// length and can be changed or emptied), the person page, withdrawing a
// wrong entry, no recording your own training, the training list with its
// CSV, and the Training types screen. Finance sees a note.
// Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { addDays, addYears, todayInDublin } from "../../src/lib/vetting/rules";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot, showFilters, applyFilters } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p2-4");

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

test("record training with the usual expiry, then withdraw a wrong entry", async ({ page }, info) => {
  const project = info.project.name;
  const person = await newTestPerson(project);
  const doneOn = addDays(todayInDublin(), -10);

  await signInAs(page, centre, `/people/${person.id}`);
  const box = page.getByTestId("training");
  await expect(box.getByTestId("training-now")).toHaveText("No training recorded.");

  await box.getByRole("link", { name: "Record training" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Record training" })).toBeVisible();
  await page.getByLabel("Training", { exact: true }).selectOption({ label: "First aid" });
  await expect(page.getByText("Usually lasts 2 years.")).toBeVisible();
  await page.getByLabel("Date done").fill(doneOn);
  // Filled in automatically: First aid usually lasts 2 years.
  await expect(page.getByLabel("Expires on")).toHaveValue(addYears(doneOn, 2));
  await s(page, "record-training", project);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(new RegExp(`/people/${person.id}\\?done=training-recorded$`));
  await expect(page.getByTestId("notice")).toHaveText(/recorded/i);
  const now = box.getByTestId("training-now").getByRole("listitem");
  await expect(now).toHaveCount(1);
  await expect(now.first()).toContainText("First aid");
  await expect(now.first().getByTestId("status")).toHaveText("Valid");
  await s(page, "person-training", project);

  // That was wrong: withdraw it with a reason.
  const history = page.getByTestId("training-history").getByRole("listitem");
  await history.first().getByText("Withdraw this entry").click();
  await history.first().getByLabel("Why is it wrong?").fill("Test: entered for the wrong person");
  await history.first().getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/withdrawn/i);
  await expect(box.getByTestId("training-now")).toHaveText("No training recorded.");
  await expect(history.first()).toContainText("Withdrawn");
  await expect(history.first()).toContainText("Test: entered for the wrong person");
  await s(page, "person-training-withdrawn", project);

  // Training that does not expire: empty the expiry box.
  await box.getByRole("link", { name: "Record training" }).click();
  await page.getByLabel("Training", { exact: true }).selectOption({ label: "Manual handling" });
  await page.getByLabel("Date done").fill(doneOn);
  await expect(page.getByLabel("Expires on")).toHaveValue(addYears(doneOn, 3));
  await page.getByLabel("Expires on").fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/recorded/i);
  await expect(box.getByTestId("training-now").getByRole("listitem").first().getByTestId("status")).toHaveText("No expiry");
});

test("a future date is refused on the form", async ({ page }, info) => {
  const person = await newTestPerson(info.project.name);
  await signInAs(page, centre, `/people/${person.id}/training`);
  await page.getByLabel("Training", { exact: true }).selectOption({ label: "Fire safety" });
  await page.getByLabel("Date done").fill(addDays(todayInDublin(), 3));
  await page.getByRole("button", { name: "Save" }).click();
  // The browser refuses it (today at the latest); the database refuses it too.
  const valid = await page.getByLabel("Date done").evaluate((el) => (el as HTMLInputElement).checkValidity());
  expect(valid).toBe(false);
  await expect(page).toHaveURL(new RegExp(`/people/${person.id}/training$`));
  const { count } = await master().from("training_records").select("id", { count: "exact", head: true }).eq("person_id", person.id);
  expect(count).toBe(0);
});

test("nobody can record their own training", async ({ page }) => {
  const mine = await ownPersonId(centre.email);
  await signInAs(page, centre, `/people/${mine}`);
  const box = page.getByTestId("training");
  await expect(box).toContainText("This is you");
  await expect(box.getByRole("link", { name: "Record training" })).toHaveCount(0);
  await page.goto(`/people/${mine}/training`);
  await expect(page.getByTestId("own-training")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});

test("the training list, worst first, with filters and a CSV", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/people/training");
  await expect(page.getByRole("heading", { level: 1, name: "Training" })).toBeVisible();
  await expectCurrentMenuLink(page, "Training");
  const rows = page.getByTestId("training-row").filter({ visible: true });
  await expect(rows.first()).toBeVisible();
  // Worst first: the seed has expired training, so the first row is expired.
  await expect(rows.first().getByTestId("status")).toHaveText("Expired");
  await s(page, "training-list", project);

  await showFilters(page);
  await page.locator('select[name="type"]').selectOption({ label: "First aid" });
  await page.locator('select[name="status"]').selectOption({ label: "Due soon" });
  await applyFilters(page);
  await expect(page).toHaveURL(/status=due/);
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allInnerTexts()) {
    expect(text).toContain("Due soon");
    expect(text).toContain("First aid");
  }
  await s(page, "training-list-due", project);

  const csv = await page.request.get("/people/training/csv?status=expired");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toMatch(/icci-training-\d{4}-\d{2}-\d{2}\.csv/);
  const text = await csv.text();
  expect(text).toContain("Name,Role,Section,Training,Status,Done on,Expires on");
  expect(text).toContain(",Expired,");
  expect(text).not.toContain(",Valid,");
});

test("training types: add one, change its usual length, switch it off", async ({ page }, info) => {
  const project = info.project.name;
  const name = `Test run ${Date.now()} ${project} course`;
  await signInAs(page, centre, "/people/training/types");
  await expect(page.getByRole("heading", { level: 1, name: "Training types" })).toBeVisible();
  await expect(page.getByTestId("training-types")).toContainText("Fire safety");
  await s(page, "training-types", project);

  const add = page.getByRole("form", { name: "Add a training type" });
  await add.getByLabel("Name").fill(name);
  await add.getByLabel("Usual length (years)").fill("4");
  await add.getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/added/i);
  const card = page.getByTestId("training-type").filter({ hasText: name });
  await expect(card).toContainText("Usually lasts 4 years");

  // Training that does not expire: empty the usual length.
  await card.getByText("Change name or usual length").click();
  const edit = card.getByRole("form");
  await edit.getByLabel("Usual length (years)").fill("");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/saved/i);
  await expect(card).toContainText("No usual expiry");

  await card.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/switched off/i);
  await expect(page.getByTestId("training-types")).not.toContainText(name);
  await page.getByText(/^Switched off \(/).click();
  await expect(page.getByTestId("training-types-off")).toContainText(name);
  // No longer offered when recording training.
  const person = await newTestPerson(project);
  await page.goto(`/people/${person.id}/training`);
  await expect(page.getByLabel("Training", { exact: true }).locator("option", { hasText: name })).toHaveCount(0);
});

test("finance sees a note instead of training, and gets no CSV", async ({ page }, info) => {
  await signInAs(page, finance, "/people/training");
  await expect(page.getByTestId("cannot-see-people")).toBeVisible();
  expect((await page.request.get("/people/training/csv")).status()).toBe(403);
  await page.goto("/people/training/types");
  await expect(page.getByTestId("cannot-see-people")).toBeVisible();
  await s(page, "training-finance", info.project.name);
});
