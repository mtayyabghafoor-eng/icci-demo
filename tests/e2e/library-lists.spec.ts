// Slice P4.5 in a real browser, on a PC-sized and a phone-sized window.
// The Library Operator marks a copy lost and found, loses a book that is on
// loan, withdraws one for good, and reads the On loan, Overdue, Most
// borrowed and Lost lists. Admins can download a CSV; the Library Operator
// and Finance cannot. Home shows the "Library books overdue" card.
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, newTestLabel, shot, signInWithEmailCode } from "./helpers";

const operator = seedAdmin("library_operator");
const admin = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const SLICE = "p4-5";

function masterKey() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A made-up book with one copy on a new label. */
async function newCopy(title: string): Promise<{ label: string; copy: string }> {
  const db = masterKey();
  const label = await newTestLabel();
  const { data: book, error } = await db.from("library_books").insert({ title, author: "Test Author (made up)", language: "en" }).select("id").single();
  if (error) throw new Error(error.message);
  const { data: copy, error: cError } = await db.from("library_copies").insert({ book_id: book.id, label_serial: label }).select("id").single();
  if (cError) throw new Error(cError.message);
  return { label, copy: copy.id };
}

async function lendTo(copy: string, name: string) {
  const db = masterKey();
  const { data: person, error } = await db
    .from("library_borrowers")
    .insert({ full_name: name, contact_kind: "phone", contact: "+353 00 000 0888" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { error: lError } = await db.from("library_loans").insert({ copy_id: copy, borrower_id: person.id });
  if (lError) throw new Error(lError.message);
}

test("the Library Operator marks copies lost, found and withdrawn", async ({ page }, info) => {
  const project = info.project.name;
  const stamp = `${Date.now()} ${project}`;
  const lostBook = await newCopy(`Test run ${stamp} The Misplaced Atlas`);
  const lentBook = await newCopy(`Test run ${stamp} The Borrowed Lamp`);
  const gone = await newCopy(`Test run ${stamp} The Worn Out Reader`);
  await lendTo(lentBook.copy, `Test run ${stamp} Borrower`);
  await signInWithEmailCode(page, operator.email);

  // Lost, then found.
  await page.goto(`/library/copies/${lostBook.copy}`);
  await expect(page.getByTestId("copy-status")).toHaveText("Available");
  await page.getByText("Lost or no longer wanted?").click();
  await shot(page, "copy-mark-options", project, SLICE);
  await page.getByRole("button", { name: "Mark this copy lost" }).click();
  await expect(page.getByTestId("notice").filter({ visible: true })).toHaveText(/Marked lost/);
  await expect(page.getByTestId("copy-status")).toHaveText("Lost");
  await expect(page.getByTestId("copy-flag")).toHaveText(/cannot be lent unless it is found/);
  await expect(page.getByRole("link", { name: "Lend this book" })).toHaveCount(0);
  await shot(page, "copy-lost", project, SLICE);

  // It shows on the Lost and withdrawn list.
  await page.goto("/library/lost");
  await expect(page.getByRole("heading", { level: 1, name: "Lost and withdrawn" })).toBeVisible();
  await expect(page.getByTestId("flagged-row").filter({ hasText: "The Misplaced Atlas" })).toBeVisible();
  await shot(page, "lost-list", project, SLICE);

  await page.goto(`/library/copies/${lostBook.copy}`);
  await page.getByRole("button", { name: "Mark this copy found" }).click();
  await expect(page.getByTestId("notice").filter({ visible: true })).toHaveText(/Found/);
  await expect(page.getByTestId("copy-status")).toHaveText("Available");

  // A book on loan that is lost: the loan ends with it.
  await page.goto(`/library/copies/${lentBook.copy}`);
  await expect(page.getByTestId("copy-status")).toHaveText("On loan");
  await page.getByText("Lost or no longer wanted?").click();
  await page.getByRole("button", { name: "Mark this copy lost" }).click();
  await expect(page.getByTestId("copy-status")).toHaveText("Lost");
  await expect(page.getByTestId("loan-row")).toHaveCount(1);
  await expect(page.getByTestId("loan-row").getByText("Lost", { exact: true })).toBeVisible();

  // Withdrawn for good: no way back.
  await page.goto(`/library/copies/${gone.copy}`);
  await page.getByText("Lost or no longer wanted?").click();
  await page.getByRole("button", { name: "Withdraw this copy for good" }).click();
  await expect(page.getByTestId("copy-status")).toHaveText("Withdrawn");
  await expect(page.getByTestId("copy-flag")).toHaveText(/cannot be undone/);
  await expect(page.getByRole("button", { name: /found/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Lend this book" })).toHaveCount(0);
  await shot(page, "copy-withdrawn", project, SLICE);
});

test("the lists, the Home card, and no download for the Library Operator", async ({ page }, info) => {
  const project = info.project.name;
  await signInWithEmailCode(page, operator.email);

  // Home: library cards only. The seed has overdue books, so the card is red.
  await page.goto("/");
  const card = page.getByTestId("counter-library-overdue");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Library books overdue");
  await expect(page.getByTestId("counter-low-stock")).toHaveCount(0);
  await shot(page, "operator-home", project, SLICE);

  // Overdue: most overdue first, with the contact to phone.
  await page.goto("/library/overdue");
  await expect(page.getByRole("heading", { level: 1, name: "Overdue" })).toBeVisible();
  await expect(page.getByTestId("list-count")).toHaveText(/books?$/);
  const rows = page.getByTestId("loan-list-row").filter({ visible: true });
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(5);
  await expect(rows.first()).toContainText("25 days");
  await shot(page, "overdue-list", project, SLICE);

  // On loan: soonest due first, includes the overdue ones.
  await page.goto("/library/on-loan");
  await expect(page.getByRole("heading", { level: 1, name: "On loan" })).toBeVisible();
  await expect(page.getByTestId("list-count")).toHaveText(/books?$/);
  await expect(page.getByTestId("loan-list-row").filter({ visible: true }).first()).toBeVisible();
  expect(await page.getByTestId("loan-list-row").filter({ visible: true }).count()).toBeGreaterThanOrEqual(13);
  await shot(page, "on-loan-list", project, SLICE);

  // Most borrowed: the last 12 months by default; a period can be chosen.
  await page.goto("/library/most-borrowed");
  await expect(page.getByRole("heading", { level: 1, name: "Most borrowed" })).toBeVisible();
  await expect(page.getByTestId("borrowed-row").first()).toBeVisible();
  await shot(page, "most-borrowed", project, SLICE);
  await page.goto("/library/most-borrowed?period=custom&from=2001-01-01&to=2001-12-31");
  await expect(page.getByTestId("list-count")).toHaveText(/No book was lent in this period/);

  // No CSV button for the Library Operator, and the address itself refuses.
  for (const path of ["on-loan", "overdue", "most-borrowed", "lost"]) {
    await page.goto(`/library/${path}`);
    await expect(page.getByTestId("csv-link")).toHaveCount(0);
    const res = await page.request.get(`/library/${path}/csv`);
    expect(res.status()).toBe(403);
  }
});

test("a Centre Admin sees the Home card and downloads the lists", async ({ page }, info) => {
  const project = info.project.name;
  await page.goto("/library/overdue");
  await completeSignIn(page, admin.email, testAuthenticatorSecret(admin.email));
  await expect(page.getByRole("heading", { level: 1, name: "Overdue" })).toBeVisible();
  await expect(page.getByTestId("csv-link")).toBeVisible();
  await shot(page, "overdue-admin", project, SLICE);

  const res = await page.request.get("/library/overdue/csv");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toMatch(/icci-library-overdue-\d{4}-\d{2}-\d{2}\.csv/);
  const body = await res.text();
  expect(body).toContain("Label,Title,Author,Borrower,Contact,Lent,Due,Days overdue");
  expect(body.trim().split("\r\n").length).toBeGreaterThanOrEqual(6);

  for (const path of ["on-loan", "most-borrowed", "lost"]) {
    const r = await page.request.get(`/library/${path}/csv`);
    expect(r.status()).toBe(200);
  }

  await page.goto("/");
  await expect(page.getByTestId("counter-library-overdue")).toBeVisible();
  await shot(page, "admin-home-library", project, SLICE);
});

test("Finance cannot see the lists or download them", async ({ page }) => {
  await page.goto("/library/overdue");
  await completeSignIn(page, finance.email, testAuthenticatorSecret(finance.email));
  await expect(page.getByTestId("cannot-see-library")).toBeVisible();
  for (const path of ["on-loan", "most-borrowed", "lost"]) {
    await page.goto(`/library/${path}`);
    await expect(page.getByTestId("cannot-see-library")).toBeVisible();
  }
  for (const path of ["on-loan", "overdue", "most-borrowed", "lost"]) {
    expect((await page.request.get(`/library/${path}/csv`)).status()).toBe(403);
  }
});
