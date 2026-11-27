// Slice E8 in a real browser, on a PC-sized and a phone-sized window: the
// library desk and small phone fixes. Lend has +7 and +14 day buttons and a
// Cancel on the first step; the desk tabs wrap (no sideways scrolling); the
// weekly count says "rolls", not "roll"; the label box hint fits; table
// headings are sentence case. Screens saved to docs/screens/.
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, newTestLabel, shot, signInWithEmailCode } from "./helpers";

const operator = seedAdmin("library_operator");
const centre = seedAdmin("centre_admin");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

function dublinDay(offset: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

test("lend: Cancel on the first step, and +7 or +14 days in one tap", async ({ page }, info) => {
  const db = master();
  const { data: book, error } = await db.from("library_books").insert({ title: `Test run ${Date.now()} ${info.project.name} E8 book`, author: "Test Author (made up)", language: "en" }).select("id").single();
  if (error) throw error;
  const { data: copy } = await db.from("library_copies").insert({ book_id: book.id, label_serial: await newTestLabel() }).select("id").single();

  await signInWithEmailCode(page, operator.email);
  await page.goto(`/library/copies/${copy!.id}/lend`);
  await expect(page.getByRole("heading", { level: 1, name: "Lend a Book" })).toBeVisible();
  await expect(page.getByTestId("lend-cancel")).toHaveAttribute("href", `/library/copies/${copy!.id}`);
  await shot(page, "lend-step-1", info.project.name, "e8");

  await page.getByRole("link", { name: "New borrower" }).click();
  const due = page.getByLabel("Due back");
  await expect(due).toHaveValue(dublinDay(21));
  await page.getByTestId("due-plus-7").click();
  await expect(due).toHaveValue(dublinDay(28));
  await page.getByTestId("due-plus-14").click();
  await expect(due).toHaveValue(dublinDay(42));
  await shot(page, "lend-due-buttons", info.project.name, "e8");
});

test("the library desk tabs wrap, so the open tab is in view without scrolling", async ({ page }, info) => {
  await signInWithEmailCode(page, operator.email);
  await page.goto("/library/lost");
  const nav = page.getByRole("navigation", { name: "Library desk" });
  const open = nav.locator('[aria-current="page"]');
  await expect(open).toHaveText("Lost and withdrawn");
  await expect(open).toBeInViewport({ ratio: 1 });
  // Nothing hidden off to the side.
  expect(await nav.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  await shot(page, "desk-tabs", info.project.name, "e8");
});

test("the weekly count names units in the plural; table headings are sentence case", async ({ page }, info) => {
  await signInAs(page, centre, "/stock/count");
  await page.getByTestId("count-rooms").getByRole("link", { name: /^Test Store Room B1-1(?!d)/ }).click();
  await expect(page.locator('input[name^="qty:"]').first()).toBeVisible();
  // The unit beside the box reads as after a number ("rolls", "boxes").
  const unitText = await page.locator("li").filter({ has: page.locator('input[name^="qty:"]') }).first().locator("span.min-w-14").textContent();
  expect(unitText?.trim()).toMatch(/s$/);
  await shot(page, "weekly-count", info.project.name, "e8");

  await page.goto("/items");
  const th = page.locator(".list-table th").first();
  if (await th.isVisible()) expect(await th.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
});

test("the label box on the Scan page shows its whole hint", async ({ page }, info) => {
  await signInAs(page, centre, "/scan");
  const box = page.getByRole("search", { name: "Find a label" }).getByRole("textbox");
  await expect(box).toHaveAttribute("placeholder", "e.g. ICCI-000123");
  // The hint fits inside the box.
  expect(await box.evaluate((el: HTMLInputElement) => {
    const c = document.createElement("canvas").getContext("2d")!;
    const s = getComputedStyle(el);
    c.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    return c.measureText(el.placeholder).width < el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
  })).toBe(true);
  await shot(page, "scan", info.project.name, "e8");
});
