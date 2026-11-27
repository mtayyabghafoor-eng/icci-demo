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
