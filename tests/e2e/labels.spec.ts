// Slice 7 in a real browser, on a PC-sized and a phone-sized window: print a
// new sheet of 21 labels, skip spaces on a part-used sheet, see what goes on
// paper, print a sheet again, and check finance cannot print.
// Every screen is saved to docs/screens/.
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
/** Screenshot once the page has finished loading (no "Loading…" left). */
async function s(page: Page, name: string, project: string) {
  await expect(page.getByText(/^Loading/)).toHaveCount(0);
  await shot(page, name, project, "07");
}

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

const numberOf = (serial: string) => Number(serial.slice(5));
const serialOf = (n: number) => `ICCI-${String(n).padStart(6, "0")}`;

test("print a new sheet of 21 labels, skip spaces, and print it again", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/labels");
  await expect(page.getByRole("heading", { level: 1, name: "Print labels" })).toBeVisible();
  await expectCurrentMenuLink(page, "Print labels");
  const next = (await page.getByTestId("next-serial").textContent())!.trim();
  await s(page, "print-labels", project);

  // Create and print 21 (the default: one sheet).
  await expect(page.getByLabel("How many labels?")).toHaveValue("21");
  await page.getByRole("button", { name: "Create and print" }).click();
  await expect(page).toHaveURL(/\/labels\/sheet\/\d+\?new=1$/);
  const sheetUrl = page.url().replace(/\?.*$/, "");
  await expect(page.getByText("21 new label numbers created.")).toBeVisible();
  await expect(page.getByTestId("sheet-range")).toHaveText(`${next} to ${serialOf(numberOf(next) + 20)}`);
  const labels = page.getByTestId("label");
  await expect(labels).toHaveCount(21);
  await expect(labels.first()).toHaveAttribute("data-serial", next);
  // The QR code holds only the link with the number.
  await expect(labels.first()).toHaveAttribute("data-link", `http://localhost:3000/l/${next}`);
  await expect(labels.first().getByText("TEST LABEL")).toBeVisible();
  await expect(page.getByRole("img", { name: `QR code for ${next}` })).toBeVisible();
  await s(page, "label-sheet", project);

  // A part-used sheet: skip the first 5 spaces, so it needs two sheets.
  await page.getByLabel("Skip the first spaces").fill("5");
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page).toHaveURL(/skip=5/);
  await expect(page.locator("section.label-sheet")).toHaveCount(2);
  const firstSheet = page.locator("section.label-sheet").first();
  await expect(firstSheet.locator(".label-cell").nth(4)).not.toHaveAttribute("data-serial");
  await expect(firstSheet.locator(".label-cell").nth(5)).toHaveAttribute("data-serial", next);
  await s(page, "label-sheet-skip", project);

  // What goes on paper: only the labels, no menu, no buttons.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  // On paper the sheet starts exactly at the page corner: no stray margins.
  const box = await page.locator("section.label-sheet").first().boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0 });
  // 210 mm wide at 96 dots per inch.
  expect(box!.width).toBeCloseTo((210 / 25.4) * 96, 0);
  await s(page, "label-sheet-on-paper", project);
  if (project === "desktop") {
    // A real A4 print file: two pages for 21 labels after skipping 5.
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(2);
    writeFileSync(info.outputPath("label-sheet.pdf"), pdf);
  }
  await page.emulateMedia({ media: "screen" });

  // Print it again from the list: same numbers, no new labels.
  const sheetId = sheetUrl.split("/").pop();
  await page.goto("/labels");
  await expect(page.getByTestId("next-serial")).toHaveText(serialOf(numberOf(next) + 21));
  const row = page.getByTestId("print-runs").locator("li", { hasText: `Sheet ${sheetId}` }).first();
  await expect(row).toContainText(`${next} to ${serialOf(numberOf(next) + 20)}`);
  await row.getByRole("button", { name: "Print again" }).click();
  await expect(page).toHaveURL(/\/labels\/sheet\/\d+$/);
  expect(page.url()).not.toBe(sheetUrl);
  await expect(page.getByText(`reprint of sheet ${sheetId}`)).toBeVisible();
  await expect(page.getByTestId("label").first()).toHaveAttribute("data-serial", next);
  await page.goto("/labels");
  await expect(page.getByTestId("next-serial")).toHaveText(serialOf(numberOf(next) + 21));
  await expect(page.getByTestId("print-runs").locator("li").first()).toContainText(`reprint of sheet ${sheetId}`);
  await s(page, "print-labels-after-reprint", project);
});

test("finance cannot print labels", async ({ page }, info) => {
  await signInAs(page, finance, "/labels");
  await expect(page.getByTestId("cannot-print")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create and print" })).toHaveCount(0);
  await s(page, "print-labels-finance", info.project.name);
});

test("a signed-out visitor opening a label sheet sees only the sign-in page", async ({ page }) => {
  await page.goto("/labels/sheet/1");
  await expectSignInPage(page);
});
