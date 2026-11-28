// The flip book fills the screen (owner, 27 Nov 2026: "like a minute
// document; full screen does not cover the screen; zoom makes one part
// bigger only"). On a PC the book takes the whole width and the rest of the
// screen's height; zoom makes the whole page bigger, evenly; "One page" and
// "Fit width" make a page as wide as the room; full screen uses the whole
// screen. Screens saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage } from "./helpers";

const centre = seedAdmin("centre_admin");

async function openBook(page: Page) {
  await page.goto("/policies");
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await page.getByRole("link", { name: "Test policy: Safeguarding children" }).first().click();
  await page.getByRole("link", { name: "Read as a book" }).first().click();
  await expect(page.getByTestId("flip-book").getByRole("img", { name: "Page 1 of 6" })).toBeVisible();
}

/** What the reader sees (no whole-page stitching, so the fixed bars sit where they are). */
const look = (page: Page, name: string, project: string) => page.screenshot({ path: `docs/screens/slice-e-fix-${name}-${project}.png`, scale: "css", caret: "initial" });

test("on a PC the book fills the screen, and zoom makes the whole page bigger", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "PC only.");
  await openBook(page);
  const view = page.getByTestId("flip-viewport");
  const win = page.viewportSize()!;
  const main = (await page.locator("#content > main").filter({ visible: true }).first().boundingBox())!;
  const box = (await view.boundingBox())!;
  // The whole width of the page area, and most of the screen's height, all of it on screen.
  expect(box.width).toBeGreaterThan(main.width * 0.85);
  expect(box.height).toBeGreaterThan(win.height * 0.6);
  expect(box.y + box.height).toBeLessThanOrEqual(win.height + 1);
  const cover = (await page.getByRole("img", { name: "Page 1 of 6" }).boundingBox())!;
  expect(cover.height).toBeGreaterThan(box.height * 0.95);
  await look(page, "book-pc", info.project.name);

  // Zoom: the page grows evenly in both directions; the book area stays the same size.
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(view).toHaveAttribute("data-zoom", "2");
  const big = (await page.getByRole("img", { name: "Page 1 of 6" }).boundingBox())!;
  expect(big.width / cover.width).toBeCloseTo(2, 1);
  expect(big.height / cover.height).toBeCloseTo(2, 1);
  const after = (await view.boundingBox())!;
  expect(Math.abs(after.height - box.height)).toBeLessThan(2);
  await look(page, "book-pc-zoomed", info.project.name);

  // One page: a single page, larger than in the two-page view.
  await page.getByRole("button", { name: "Fit page" }).click();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByTestId("flip-page-line")).toHaveText("Pages 2 and 3 of 6");
  const two = (await page.getByRole("img", { name: "Page 2 of 6" }).boundingBox())!;
  await page.getByTestId("pages-switch").click();
  await expect(page.getByTestId("flip-page-line")).toHaveText("Page 2 of 6");
  // Fit width: the page is as wide as the book area.
  await page.getByTestId("fit-width").click();
  const one = (await page.getByRole("img", { name: "Page 2 of 6" }).boundingBox())!;
  expect(one.width).toBeGreaterThan(two.width * 1.5);
  expect(one.width).toBeGreaterThan(box.width * 0.95);
  await look(page, "book-pc-one-page", info.project.name);
});

test("full screen uses the whole screen", async ({ page }, info) => {
  await openBook(page);
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.getByRole("button", { name: "Leave full screen" })).toBeVisible();
  const win = page.viewportSize()!;
  const view = (await page.getByTestId("flip-viewport").boundingBox())!;
  expect(view.width).toBeGreaterThan(win.width * 0.9);
  if (info.project.name === "desktop") expect(view.height).toBeGreaterThan(win.height * 0.7);
  expect(view.y + view.height).toBeLessThanOrEqual(win.height + 1);
  await look(page, "book-full-screen", info.project.name);
});
