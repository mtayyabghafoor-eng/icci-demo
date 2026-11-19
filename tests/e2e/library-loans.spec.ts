// Slice P4.4 in a real browser: borrowers, lend and return, on a PC-sized
// and a phone-sized window. The Library Operator scans a book, lends it to
// a new borrower, moves the due date, returns it, cancels a mistaken
// return, lends it again to the same borrower found by name, corrects the
// borrower's details and switches them off once the book is back. The seed's
// overdue loan and the 3-book limit are shown; Finance sees "cannot see".
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { SEED_BORROWERS, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, mainMenu, newTestLabel, shot, signInWithEmailCode } from "./helpers";

const operator = seedAdmin("library_operator");
const finance = seedAdmin("finance");
const SLICE = "p4-4";

function masterKey() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A made-up book with one copy on a new label. */
async function newCopy(title: string): Promise<string> {
  const db = masterKey();
  const label = await newTestLabel();
  const { data: book, error } = await db.from("library_books").insert({ title, author: "Test Author (made up)", language: "en" }).select("id").single();
  if (error) throw new Error(error.message);
  const { error: cError } = await db.from("library_copies").insert({ book_id: book.id, label_serial: label });
  if (cError) throw new Error(cError.message);
  return label;
}

async function borrowerId(name: string): Promise<string> {
  const { data, error } = await masterKey().from("library_borrowers").select("id").eq("full_name", name).single();
  if (error) throw new Error(error.message);
  return data.id;
}

function dublinDay(offset: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function findByLabel(page: Page, path: "/library/lend" | "/library/return", label: string) {
  await page.goto(path);
  await page.getByRole("textbox", { name: "Label number" }).fill(label);
  await page.getByRole("button", { name: "Find the book" }).click();
}

test("the Library Operator lends, moves the due date, returns and lends again", async ({ page }, info) => {
  const project = info.project.name;
  const stamp = `${Date.now()} ${project}`;
  const label = await newCopy(`Test run ${stamp} The Patient Lantern`);
  const name = `Test run ${stamp} Borrower`;
  await signInWithEmailCode(page, operator.email);

  // Scanning the label opens the copy: Available, with "Lend this book".
  await page.goto(`/l/${label}`);
  await expect(page).toHaveURL(/\/library\/copies\/[0-9a-f-]{36}$/);
  const copyUrl = page.url();
  await expect(page.getByTestId("copy-status")).toHaveText("Available");
  await shot(page, "copy-available", project, SLICE);

  // Lend to someone new: name, one contact, due date filled in (21 days).
  await page.getByRole("link", { name: "Lend this book" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Lend a Book" })).toBeVisible();
  await page.getByRole("link", { name: "New borrower" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("radio", { name: "Phone" }).check();
  await page.getByRole("textbox", { name: "Phone number or email address" }).fill("call me");
  await expect(page.getByLabel("Due back")).toHaveValue(dublinDay(21));
  await page.getByRole("button", { name: "Add and lend the book" }).click();
  // A wrong phone number is explained; nothing typed is lost.
  await expect(page.getByTestId("form-error")).toHaveText(/phone number does not look right/);
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
  await page.getByRole("textbox", { name: "Phone number or email address" }).fill("+353 00 000 0777");
  await shot(page, "lend-new-borrower", project, SLICE);
  await page.getByRole("button", { name: "Add and lend the book" }).click();

  await expect(page.getByTestId("notice").filter({ visible: true })).toHaveText(/Lent/);
  await expect(page.getByTestId("copy-status")).toHaveText("On loan");
  await expect(page.getByTestId("loan-borrower")).toHaveText(name);
  await shot(page, "copy-on-loan", project, SLICE);

  // Move the due date.
  await page.getByText("Move the due date", { exact: true }).first().click();
  await page.getByLabel("New due date").fill(dublinDay(30));
  await page.getByRole("button", { name: "Move the due date" }).click();
  await expect(page.getByTestId("notice").filter({ visible: true })).toHaveText(/Due date moved/);

  // Return: one tap.
  await page.getByRole("button", { name: "Return this book" }).click();
  await expect(page.getByTestId("notice").filter({ visible: true })).toHaveText(/Returned on time/);
  await expect(page.getByTestId("copy-status")).toHaveText("Available");
  await shot(page, "copy-returned", project, SLICE);

  // Returned by mistake: the loan goes back on.
  await page.getByText("Returned by mistake?").click();
  await page.getByRole("button", { name: "Returned by mistake: still on loan" }).click();
  await expect(page.getByTestId("notice").filter({ visible: true })).toHaveText(/Return cancelled/);
  await expect(page.getByTestId("copy-status")).toHaveText("On loan");

  // Return it properly, typing the label on the Return screen.
  await findByLabel(page, "/library/return", label);
  await expect(page).toHaveURL(copyUrl);
  await page.getByRole("button", { name: "Return this book" }).click();
  await expect(page.getByTestId("copy-status")).toHaveText("Available");

  // Lend again to the same borrower, found by name from the Lend screen.
  await page.goto("/library/lend");
  await shot(page, "lend-start", project, SLICE);
  await findByLabel(page, "/library/lend", label);
  await expect(page).toHaveURL(/\/library\/copies\/[0-9a-f-]{36}\/lend$/);
  await page.getByPlaceholder("Borrower's name").fill(`Test run ${stamp}`);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("borrower-choice")).toHaveCount(1);
  await shot(page, "lend-pick", project, SLICE);
  await page.getByTestId("borrower-choice").click();
  await expect(page.getByTestId("picked-borrower")).toHaveText(name);
  await expect(page.getByTestId("books-out")).toHaveText("No books out.");
  await shot(page, "lend-confirm", project, SLICE);
  await page.getByRole("button", { name: "Lend the book" }).click();
  await expect(page.getByTestId("copy-status")).toHaveText("On loan");
  await expect(page.getByTestId("loan-row")).toHaveCount(2);

  // The borrower's page: one book out, one past loan; cannot be switched off yet.
  await page.getByTestId("loan-borrower").getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByTestId("out-row")).toHaveCount(1);
  await expect(page.getByTestId("past-row")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Switch off" })).toHaveCount(0);
  await shot(page, "borrower", project, SLICE);
  const borrowerUrl = page.url().replace(/\?.*$/, "");

  // Correct the details: email instead of phone.
  await page.getByRole("link", { name: "Correct the details" }).click();
  await page.getByRole("radio", { name: "Email" }).check();
  await page.getByRole("textbox", { name: "Phone number or email address" }).fill("Test.Borrower@ICCI-prototype.test");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice").filter({ visible: true })).toHaveText(/Changes saved/);
  await expect(page.getByTestId("borrower-contact")).toHaveText("test.borrower@icci-prototype.test");

  // Once the book is back, the borrower can be switched off.
  await findByLabel(page, "/library/return", label);
  await page.getByRole("button", { name: "Return this book" }).click();
  await expect(page.getByTestId("copy-status")).toHaveText("Available");
  await page.goto(borrowerUrl);
  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByTestId("notice").filter({ visible: true })).toHaveText(/Switched off/);

  // The Borrowers list.
  await page.goto("/library/borrowers");
  await expect(page.getByRole("heading", { level: 1, name: "Borrowers" })).toBeVisible();
  await expect(page.getByTestId("borrower-row").first()).toBeVisible();
  await shot(page, "borrowers", project, SLICE);
});

test("an overdue loan shows how late it is, and 3 books out is the limit", async ({ page }, info) => {
  const project = info.project.name;
  await signInWithEmailCode(page, operator.email);

  // The seed's most overdue borrower: 25 days late.
  const late = SEED_BORROWERS[12];
  await page.goto(`/library/borrowers/${await borrowerId(late.full_name)}`);
  await expect(page.getByTestId("out-row")).toHaveCount(1);
  await expect(page.getByTestId("out-row").getByTestId("status")).toHaveText("Overdue 25 days");
  await shot(page, "borrower-overdue", project, SLICE);
  await page.getByTestId("out-row").getByRole("link").click();
  await expect(page.getByTestId("copy-status")).toHaveText("Overdue 25 days");
  await shot(page, "copy-overdue", project, SLICE);

  // The seed borrower with 3 books out cannot take a fourth.
  const full = SEED_BORROWERS[23];
  const label = await newCopy(`Test run ${Date.now()} ${project} limit book`);
  await page.goto(`/l/${label}`);
  await expect(page).toHaveURL(/\/library\/copies\/[0-9a-f-]{36}$/);
  const copyUrl = page.url();
  await page.goto(`${copyUrl}/lend?borrower=${await borrowerId(full.full_name)}`);
  await expect(page.getByTestId("books-out")).toHaveText("3 of 3 books out:");
  await expect(page.getByTestId("cannot-lend")).toHaveText(/3 books out is the most allowed/);
  await expect(page.getByRole("button", { name: "Lend the book" })).toHaveCount(0);
  await shot(page, "lend-limit", project, SLICE);
});

test("Finance cannot see borrowers or lend", async ({ page }) => {
  await page.goto("/library/borrowers");
  await completeSignIn(page, finance.email, testAuthenticatorSecret(finance.email));
  await expect(page.getByTestId("cannot-see-library")).toBeVisible();
  await page.goto("/library/lend");
  await expect(page.getByTestId("cannot-see-library")).toBeVisible();
  const menu = await mainMenu(page);
  await expect(menu.getByRole("link", { name: "Borrowers" })).toHaveCount(0);
});
