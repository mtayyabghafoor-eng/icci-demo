// Slice P4.3 in a real browser: looking a book up from its ISBN, on a
// PC-sized and a phone-sized window. The website asks a pretend Open
// Library on this computer (tests/e2e/fake-open-library.mjs), which knows
// only made-up books, so nothing is sent to any real outside website.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { FAKE_PREFIX } from "./fake-open-library.mjs";
import { newTestLabel, shot, signInWithEmailCode } from "./helpers";

const operator = seedAdmin("library_operator");
const SLICE = "p4-3";

/** A fresh made-up ISBN starting with the given digits, with a correct check digit. */
function isbnStarting(prefix: string): string {
  const body = (prefix + String(Math.floor(Math.random() * 1e9)).padStart(9, "0")).slice(0, 12);
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

async function lookUp(page: Page, label: string, isbn: string) {
  await page.goto(`/l/${label}`);
  await expect(page).toHaveURL(new RegExp(`/library/new\\?label=${label}$`));
  await page.getByRole("textbox", { name: "ISBN" }).fill(isbn);
  await page.getByRole("button", { name: "Look up" }).click();
}

test.beforeEach(async ({ page }) => {
  await signInWithEmailCode(page, operator.email);
});

test("a book found on Open Library fills in the details to check, then is added", async ({ page }, info) => {
  const project = info.project.name;
  const label = await newTestLabel();
  const isbn = isbnStarting(FAKE_PREFIX.FOUND);

  await page.goto(`/l/${label}`);
  await expect(page.getByRole("button", { name: "Look up" })).toBeVisible();
  await expect(page.getByRole("link", { name: "No ISBN? Type the details" })).toBeVisible();
  await shot(page, "isbn-step", project, SLICE);

  await lookUp(page, label, `${isbn.slice(0, 3)}-${isbn.slice(3)}`);
  await expect(page.getByTestId("lookup-result")).toHaveText(/Found on Open Library/);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("The Patient Gardener: A Made-Up Story");
  await expect(page.getByRole("textbox", { name: "Author (optional)" })).toHaveValue("Test Author Looked-Up");
  await expect(page.getByRole("textbox", { name: "ISBN" })).toHaveValue(isbn);
  await expect(page.getByRole("textbox", { name: "Publisher" })).toHaveValue("Test Press (made up)");
  await expect(page.getByRole("textbox", { name: "Year" })).toHaveValue("1998");
  await expect(page.getByRole("textbox", { name: "Label number" })).toHaveValue(label);
  await shot(page, "looked-up", project, SLICE);

  // Every detail can still be changed before saving.
  await page.getByRole("textbox", { name: "Title" }).fill(`Test run ${Date.now()} ${project} The Patient Gardener`);
  await page.getByText("English", { exact: true }).click();
  await page.getByRole("button", { name: "Add the book" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Book added/);
  await expect(page.getByTestId("book-source")).toHaveText("Open Library, checked when added");
  await expect(page.getByTestId("book-isbn")).toHaveText(`${isbn.slice(0, 3)}-${isbn.slice(3)}`);

  // The same ISBN again: offered "Add another copy of this book" straight away.
  const label2 = await newTestLabel();
  await lookUp(page, label2, isbn);
  await expect(page.getByTestId("already-have")).toContainText("is already in the library");
  await shot(page, "already-have", project, SLICE);
  await page.getByRole("link", { name: "Add another copy of this book" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a Copy" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Label number" })).toHaveValue(label2);
  await page.getByRole("button", { name: "Add the copy" }).click();
  await expect(page.getByTestId("copy-row")).toHaveCount(2);
});

test("not found: the form opens with the ISBN filled in, to type the rest", async ({ page }, info) => {
  const label = await newTestLabel();
  const isbn = isbnStarting(FAKE_PREFIX.NOT_FOUND);
  await lookUp(page, label, isbn);
  await expect(page.getByTestId("lookup-result")).toHaveText(/does not have this ISBN/);
  await expect(page.getByRole("textbox", { name: "ISBN" })).toHaveValue(isbn);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("");
  await shot(page, "not-found", info.project.name, SLICE);
  await page.getByRole("textbox", { name: "Title" }).fill(`Test run ${Date.now()} typed after not found`);
  await page.getByText("Other", { exact: true }).click();
  await page.getByRole("button", { name: "Add the book" }).click();
  await expect(page.getByTestId("book-source")).toHaveText("Typed by hand");
});

test("a slow book list: the website stops waiting after 5 seconds", async ({ page }) => {
  const label = await newTestLabel();
  const started = Date.now();
  await lookUp(page, label, isbnStarting(FAKE_PREFIX.SLOW));
  await expect(page.getByTestId("lookup-result")).toHaveText(/did not answer in time/);
  expect(Date.now() - started).toBeLessThan(8000);
  await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
});

test("a mistyped ISBN is explained and nothing is looked up", async ({ page }, info) => {
  const label = await newTestLabel();
  const good = isbnStarting(FAKE_PREFIX.FOUND);
  await lookUp(page, label, good.slice(0, 12) + ((Number(good[12]) + 1) % 10));
  await expect(page.getByTestId("form-error")).toHaveText(/That ISBN does not look right/);
  await expect(page.getByTestId("lookup-result")).toHaveCount(0);
  await shot(page, "isbn-wrong", info.project.name, SLICE);
});
