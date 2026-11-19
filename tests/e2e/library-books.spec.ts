// Slice P4.2 in a real browser: books and copies, on a PC-sized and a
// phone-sized window. The Library Operator scans a new label, adds a book
// (Arabic), scans it again, adds a second copy of the same book, finds it
// in the Library list and corrects a detail. Admins are offered "Add a book
// instead" on an unused label; Finance sees "cannot see".
import { expect, test } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, mainMenu, newTestLabel, shot, signInWithEmailCode } from "./helpers";

const operator = seedAdmin("library_operator");
const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const SLICE = "p4-2";

/** A made-up ISBN with a correct check digit. */
function randomIsbn(): string {
  const body = "979" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

test("the Library Operator adds a book from a scanned label, then a second copy", async ({ page }, info) => {
  const project = info.project.name;
  const stamp = `${Date.now()} ${project}`;
  const title = `Test run ${stamp} حديقة القصص`;
  const isbn = randomIsbn();
  await signInWithEmailCode(page, operator.email);

  // The menu: Home and the library only.
  const menu = await mainMenu(page);
  await expect(menu.getByRole("link")).toHaveText(["Home", "Library", "Add a book", "Lend", "Return", "Borrowers", "On loan", "Overdue", "Most borrowed", "Lost and withdrawn"]);
  const close = page.getByRole("button", { name: "Close the menu" });
  if (await close.isVisible()) await close.click();
  if (project === "phone") {
    await expect(page.getByTestId("bottom-bar").getByRole("link")).toHaveText(["Home", "Library", "Scan"]);
  }

  // Scanning a new label opens "Add a book" with the number filled in.
  const label = await newTestLabel();
  await page.goto(`/l/${label}`);
  await expect(page).toHaveURL(new RegExp(`/library/new\\?label=${label}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Add a Book" })).toBeVisible();
  // P4.3: the ISBN comes first; this book is typed by hand.
  await page.getByRole("link", { name: "No ISBN? Type the details" }).click();
  await expect(page.getByRole("textbox", { name: "Label number" })).toHaveValue(label);
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("textbox", { name: "Author (optional)" }).fill("تجريبي يوسف المثال");
  await page.getByText("Arabic", { exact: true }).click();
  await page.getByText("ISBN, publisher and year (optional)").click();
  await page.getByRole("textbox", { name: "ISBN" }).fill(`${isbn.slice(0, 3)}-${isbn.slice(3)}`);
  await shot(page, "add-book", project, SLICE);

  // A mistyped ISBN is explained before anything is saved.
  await page.getByRole("textbox", { name: "ISBN" }).fill(isbn.slice(0, 12) + ((Number(isbn[12]) + 1) % 10));
  await page.getByRole("button", { name: "Add the book" }).click();
  await expect(page.getByTestId("form-error")).toHaveText(/That ISBN does not look right/);
  // Nothing typed is lost.
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(title);
  await expect(page.getByRole("radio", { name: "Arabic" })).toBeChecked();
  await shot(page, "add-book-wrong-isbn", project, SLICE);
  await page.getByRole("textbox", { name: "ISBN" }).fill(isbn);
  await page.getByRole("button", { name: "Add the book" }).click();

  await expect(page.getByTestId("notice")).toHaveText(/Book added, with its first copy/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByTestId("book-isbn")).toHaveText(`${isbn.slice(0, 3)}-${isbn.slice(3)}`);
  await expect(page.getByTestId("copy-row")).toHaveCount(1);
  const bookUrl = page.url().replace(/\?.*$/, "");
  await shot(page, "book", project, SLICE);

  // Scanning the same label again opens the copy.
  await page.goto(`/l/${label}`);
  await expect(page).toHaveURL(/\/library\/copies\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("copy-label")).toHaveText(label);
  await expect(page.getByTestId("copy-status")).toHaveText("Available");
  await page.getByRole("textbox", { name: "Note about this copy" }).fill("Test: donated (made up)");
  await page.getByRole("button", { name: "Save the note" }).click();
  await expect(page.getByTestId("notice")).toHaveText("Note saved.");
  await shot(page, "copy", project, SLICE);

  // A second copy: scan its new label, "Another copy of a book we have", find, pick, add.
  const label2 = await newTestLabel();
  await page.goto(`/l/${label2}`);
  await page.getByRole("link", { name: "Another copy of a book we have" }).click();
  await page.getByRole("textbox", { name: /Find the book/ }).fill(`Test run ${stamp}`);
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByTestId("pick-book")).toHaveCount(1);
  await shot(page, "another-copy-find", project, SLICE);
  await page.getByTestId("pick-book").click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a Copy" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Label number" })).toHaveValue(label2);
  await page.getByRole("button", { name: "Add the copy" }).click();
  await expect(page.getByTestId("notice")).toHaveText("Copy added.");
  await expect(page.getByTestId("copy-row")).toHaveCount(2);

  // The same ISBN cannot become a second book record.
  const label3 = await newTestLabel();
  await page.goto(`/library/new?label=${label3}&manual=1`);
  await page.getByRole("textbox", { name: "Title" }).fill(`Test run ${stamp} duplicate`);
  await page.getByText("English", { exact: true }).click();
  await page.getByText("ISBN, publisher and year (optional)").click();
  await page.getByRole("textbox", { name: "ISBN" }).fill(isbn);
  await page.getByRole("button", { name: "Add the book" }).click();
  await expect(page.getByTestId("form-error")).toHaveText(/already in the library/);

  // The Library list finds it by title and by ISBN.
  await page.goto("/library");
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await page.getByRole("searchbox").or(page.getByPlaceholder("Title, author or ISBN")).first().fill(isbn.slice(-6));
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("book-row").filter({ visible: true })).toHaveCount(1);
  await expect(page.getByTestId("book-count")).toHaveText(/1 book matching/);
  await page.goto("/library");
  await expect(page.getByTestId("book-row").filter({ visible: true }).first()).toBeVisible();
  await shot(page, "library-list", project, SLICE);

  // Correct the details.
  await page.goto(`${bookUrl}/edit`);
  await page.getByRole("textbox", { name: "Author (optional)" }).fill("تجريبي مريم المثال");
  await shot(page, "correct-book", project, SLICE);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Changes saved/);
  await expect(page.getByTestId("book-author")).toHaveText("تجريبي مريم المثال");
});

test("the Library Operator scanning an item's label is told it is not a book", async ({ page }) => {
  await signInWithEmailCode(page, operator.email);
  // ICCI-000001 is a made-up seed item.
  await page.goto("/l/ICCI-000001");
  await expect(page).toHaveURL(/\/labels\/unknown\?number=ICCI-000001&reason=item$/);
  await expect(page.getByTestId("label-on-item")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the library" })).toBeVisible();
  // And cannot open the item itself.
  await page.goto("/items");
  await expect(page.getByTestId("item-count")).toHaveText("No items match.");
});

test("an admin scanning an unused label can add a book instead of an item", async ({ page }, info) => {
  const label = await newTestLabel();
  await page.goto(`/l/${label}`);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page).toHaveURL(new RegExp(`/items/new\\?label=${label}$`));
  await page.getByRole("link", { name: "Add a book instead" }).click();
  await expect(page).toHaveURL(new RegExp(`/library/new\\?label=${label}$`));
  await expect(page.getByText(`Label ${label} is free.`)).toBeVisible();
  await shot(page, "admin-add-book", info.project.name, SLICE);
});

test("Finance cannot see the library", async ({ page }) => {
  await page.goto("/library");
  await completeSignIn(page, finance.email, testAuthenticatorSecret(finance.email));
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByTestId("cannot-see-library")).toBeVisible();
  const menu = await mainMenu(page);
  await expect(menu.getByRole("link", { name: "Library", exact: true })).toHaveCount(0);
});
