// Slices P5.5 and P5.6 in a real browser, on a PC-sized and a phone-sized
// window: the monthly export page and its CSV file, the printable receipts
// pack, and the Board report (draft for an open month, a final copy for a
// month that is over, both copies kept). Every screen is saved to
// docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, confirmSheet, expectSignInPage, shot, signInWithEmailCode } from "./helpers";

const financeB = SEED_ADMINS.find((a) => a.email.startsWith("finance.two"))!;
const centre = seedAdmin("centre_admin");
const library = seedAdmin("library_operator");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p5-5");

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

const thisMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" }).slice(0, 7);
const lastMonth = () => {
  const [y, m] = thisMonth().split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

test("Finance sees this month's file, downloads the CSV and opens the receipts pack", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, financeB, "/expenses/export");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly Export" })).toBeVisible();
  // The seed approves its claims today, so this month has some.
  await expect(page.getByTestId("export-claims")).not.toHaveText("0");
  await expect(page.getByTestId("export-by-fund")).toContainText("Total");
  await s(page, "monthly-export", project);

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download the CSV file" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`icci-expenses-${thisMonth()}.csv`);
  const text = await (await file.createReadStream()).toArray().then((parts) => Buffer.concat(parts).toString("utf8"));
  expect(text).toContain("Part 1: Claims approved this month");
  expect(text).toContain("EXP-");

  await page.getByRole("link", { name: /Receipts pack/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Receipts Pack");
  await expect(page.getByTestId("pack-claim").first()).toBeVisible();
  await expect(page.getByTestId("pack-claim").first().locator("img")).toHaveCount(1);
  await s(page, "receipts-pack", project);
});

test("the Board report is a draft while the month is open, and a final copy once it is over", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, `/board-report?month=${thisMonth()}`);
  await expect(page.getByTestId("report-status")).toContainText("Draft");
  await expect(page.getByTestId("copy-note")).toContainText("not over yet");
  await expect(page.getByTestId("spend-total")).toContainText("€");
  await expect(page.getByTestId("board-report")).toContainText(`As at`);
  await s(page, "board-report-draft", project);

  await page.goto(`/board-report?month=${lastMonth()}`);
  await page.getByTestId("make-final-copy").click();
  await confirmSheet(page);
  await expect(page.getByTestId("notice").filter({ visible: true })).toContainText("Final copy made");
  await expect(page.getByTestId("report-status").filter({ visible: true })).toContainText("Final copy");
  await expect(page.getByTestId("copies").filter({ visible: true })).toBeVisible();
  await s(page, "board-report-final", project);
});

test("the Library Operator cannot see the monthly export or the Board report", async ({ page }) => {
  await signInWithEmailCode(page, library.email);
  for (const path of ["/expenses/export", "/expenses/export/receipts", "/board-report"]) {
    await page.goto(path);
    await expect(page.getByTestId("cannot-see-expenses")).toBeVisible();
  }
  const res = await page.request.get(`/expenses/export/csv?month=${thisMonth()}`);
  expect(res.status()).toBeGreaterThanOrEqual(400);
});
