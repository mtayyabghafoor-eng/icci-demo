// Round D7 in a real browser: a policy version read as a flip book, in
// English (left to right) and in Arabic (right to left), with the PDF
// handed over by this website only to a signed-in admin.
import { expect, test } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");

test("a policy reads as a book in English and in Arabic", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await page.goto("/policies");
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await page.getByRole("link", { name: "Test policy: Safeguarding children" }).first().click();
  await page.getByRole("link", { name: "Read as a book" }).first().click();

  const book = page.getByTestId("flip-book");
  await expect(book).toHaveAttribute("data-dir", "ltr");
  await expect(book).toHaveAttribute("data-pages", "6");
  await expect(page.getByTestId("flip-page-line")).toHaveText(phone ? "Page 1 of 6" : "Page 1 of 6");
  await expect(book.getByRole("img", { name: "Page 1 of 6" })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByTestId("flip-page-line")).toHaveText(phone ? "Page 2 of 6" : "Pages 2 and 3 of 6");
  await shot(page, "policy-book-english", info.project.name, "d7");

  // Arabic: right to left. In a two-page view page 2 is on the right.
  await page.getByTestId("book-languages").getByRole("link", { name: "العربية" }).click();
  await expect(book).toHaveAttribute("data-dir", "rtl");
  await expect(book.getByRole("img", { name: "Page 1 of 6" })).toBeVisible();
  await page.keyboard.press("ArrowLeft"); // in Arabic the left arrow goes on
  await expect(page.getByTestId("flip-page-line")).toHaveText(phone ? "Page 2 of 6" : "Pages 2 and 3 of 6");
  if (!phone) {
    const two = await book.getByRole("img", { name: "Page 2 of 6" }).boundingBox();
    const three = await book.getByRole("img", { name: "Page 3 of 6" }).boundingBox();
    expect(two!.x).toBeGreaterThan(three!.x);
  }
  await shot(page, "policy-book-arabic", info.project.name, "d7");
});

test("the book zooms in so small print can be read, and fits again", async ({ page }, info) => {
  await page.goto("/policies");
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await page.getByRole("link", { name: "Test policy: Safeguarding children" }).first().click();
  await page.getByRole("link", { name: "Read as a book" }).first().click();
  const book = page.getByTestId("flip-book");
  const view = page.getByTestId("flip-viewport");
  await expect(book.getByRole("img", { name: "Page 1 of 6" })).toBeVisible();
  const before = (await book.getByRole("img", { name: "Page 1 of 6" }).boundingBox())!;

  // The + button: 150%, then 200%; the page is drawn twice as large.
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("zoom-level")).toHaveText("200%");
  await expect(view).toHaveAttribute("data-zoom", "2");
  const after = (await book.getByRole("img", { name: "Page 1 of 6" }).boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width * 1.9);
  // The page can be moved around: the viewport scrolls.
  expect(await view.evaluate((v) => v.scrollWidth > v.clientWidth)).toBe(true);
  // Sharper: the picture is redrawn with more dots once the zoom settles.
  await expect
    .poll(() => book.getByRole("img", { name: "Page 1 of 6" }).evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThanOrEqual(Math.min(2000, Math.round(after.width)));
  // A window-sized picture: the whole-page kind stretches the window, and the book with it.
  await view.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `docs/screens/slice-d8-policy-book-zoomed-${info.project.name}.png`, scale: "css", caret: "initial" });

  // A tap while zoomed does not turn the page.
  await view.click({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(500);
  await expect(page.getByTestId("flip-page-line")).toHaveText("Page 1 of 6");

  // Fit page brings back the whole page; the keyboard zooms too.
  await page.getByRole("button", { name: "Fit page" }).click();
  await expect(view).toHaveAttribute("data-zoom", "1");
  await page.keyboard.press("+");
  await expect(page.getByTestId("zoom-level")).toHaveText("150%");
  await page.keyboard.press("0");
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");

  // A double-click zooms in on that spot; another zooms out.
  await view.dblclick({ position: { x: 60, y: 60 } });
  await expect(view).toHaveAttribute("data-zoom", "2.5");
  await view.dblclick({ position: { x: 60, y: 60 } });
  await expect(view).toHaveAttribute("data-zoom", "1");
  await expect(page.getByTestId("flip-page-line")).toHaveText("Page 1 of 6");
});

test("on a phone the book page fills the screen's width", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "Phone only.");
  await page.goto("/policies");
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await page.getByRole("link", { name: "Test policy: Safeguarding children" }).first().click();
  await page.getByRole("link", { name: "Read as a book" }).first().click();
  const img = page.getByTestId("flip-book").getByRole("img", { name: "Page 1 of 6" });
  await expect(img).toBeVisible();
  const box = (await img.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.width).toBeGreaterThan(width * 0.8);
});

test("the policy PDF is never handed to a signed-out visitor", async ({ request }) => {
  const r = await request.get("/policies/00000000-0000-4000-8000-000000000000/versions/00000000-0000-4000-8000-000000000000/pdf", { maxRedirects: 0 });
  expect([302, 303, 307, 401]).toContain(r.status());
  expect(r.headers()["content-type"] ?? "").not.toContain("application/pdf");
});

test("a manual or other PDF document reads as a book too", async ({ page }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const master = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { data } = await master.from("asset_documents").select("id").like("file_path", "%.pdf").eq("hidden", false).limit(1).maybeSingle();
  test.skip(!data, "No PDF document in the made-up data.");
  await page.goto(`/documents/${data!.id}/book`);
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page.getByTestId("flip-book")).toHaveAttribute("data-dir", "ltr");
  await expect(page.getByTestId("flip-book").getByRole("img", { name: /^Page 1 of \d+$/ })).toBeVisible();
  await page.getByRole("link", { name: "Right to left (Arabic)" }).click();
  await expect(page.getByTestId("flip-book")).toHaveAttribute("data-dir", "rtl");
});
