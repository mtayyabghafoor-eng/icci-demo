// Phase 2, slice P2.9 in a real browser, on a PC-sized and a phone-sized
// window: a renewal due in 3 days is picked up by "Run today's reminders"
// (7-day reminder, recorded only on the development database); running
// again finds nothing new; a Centre Admin sees the history without the
// buttons; Finance sees a note; and the daily timer's address refuses
// anyone without its key. Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { addDays, todayInDublin } from "../../src/lib/vetting/rules";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const superAdmin = seedAdmin("super_admin");
const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p2-9");

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

test("run today's reminders: a renewal due in 3 days gets its 7-day reminder, once", async ({ page }, info) => {
  const project = info.project.name;
  const title = `Test run ${Date.now()} ${project} gas certificate`;

  await signInAs(page, superAdmin, "/renewals/new");
  await page.getByLabel("What needs renewing").fill(title);
  await page.getByLabel("Category").selectOption("Certificate");
  await page.getByLabel("Due date").fill(addDays(todayInDublin(), 3));
  await page.getByRole("button", { name: "Add renewal" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Renewal added/);

  await page.goto("/renewals");
  await page.getByRole("link", { name: "Email reminders" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Email reminders" })).toBeVisible();
  await expect(page.getByTestId("email-service")).toHaveText(/Not set up yet/);
  await expect(page.getByRole("button", { name: "Send a test email" })).toBeDisabled();
  await s(page, "reminders-setup", project);

  await page.getByRole("button", { name: /Run today.s reminders/ }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Reminders run\. The emails are listed below/);
  const latest = page.getByTestId("reminder-run").first();
  await expect(latest.getByTestId("reminded-item").filter({ hasText: title })).toHaveText(new RegExp(`^Due within 7 days: ${title} \\(Certificate\\)`));
  // Development: made-up data, so every email is recorded only, never sent.
  const emails = latest.getByTestId("reminder-email");
  await expect(emails.filter({ hasText: "Test Super Admin" })).toContainText("Recorded only");
  await expect(emails.first()).toContainText("Development: made-up data");
  await expect(emails.filter({ hasText: /Finance/ })).toHaveCount(0);
  await s(page, "reminders-ran", project);

  // Again the same day: nothing new.
  await page.getByRole("button", { name: /Run today.s reminders/ }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Nothing new has reached 60, 30 or 7 days/);
  await expect(page.getByTestId("reminder-run").first().getByTestId("run-quiet")).toBeVisible();
  await s(page, "reminders-quiet", project);
});

test("a Centre Admin sees what was sent, without the buttons", async ({ page }, info) => {
  await signInAs(page, centre, "/reminders");
  await expect(page.getByTestId("reminder-history")).toBeVisible();
  await expect(page.getByRole("button", { name: /Run today.s reminders/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send a test email" })).toHaveCount(0);
  await s(page, "reminders-centre-admin", info.project.name);
});

test("finance sees a note instead of the reminders", async ({ page }, info) => {
  await signInAs(page, finance, "/reminders");
  await expect(page.getByTestId("cannot-see-reminders")).toBeVisible();
  await s(page, "reminders-finance", info.project.name);
});

test("the daily timer's address refuses anyone without its key", async ({ request }, info) => {
  test.skip(info.project.name !== "desktop", "the timer's address is checked once, not per window size");
  expect((await request.get("/api/reminders/daily", { maxRedirects: 0 })).status()).toBe(401);
  expect((await request.get("/api/reminders/daily", { headers: { Authorization: `Bearer ${"0".repeat(64)}` }, maxRedirects: 0 })).status()).toBe(401);
  // Nothing under it is opened up: that still needs signing in.
  expect((await request.get("/api/reminders/daily/more", { maxRedirects: 0 })).status()).toBe(307);

  const key = process.env.CRON_SECRET;
  expect(key, "CRON_SECRET in .env.local (npm run setup:reminder-key)").toBeTruthy();
  const ok = await request.get("/api/reminders/daily", { headers: { Authorization: `Bearer ${key}` }, maxRedirects: 0 });
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body).toMatchObject({ run_on: todayInDublin(), emails: { sent: 0, failed: 0 } });
  // Counts only: no titles or addresses in the answer.
  expect(JSON.stringify(body)).not.toMatch(/@|Test run/);
});
