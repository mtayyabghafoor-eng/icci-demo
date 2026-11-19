// Slice 4 in a real browser, on a PC-sized and a phone-sized window:
// scan a new label, register an item, open it, edit it, see the history,
// search the list. Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, newTestLabel, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "04");

/** An obviously fake "photo": a green square with the words TEST PHOTO. */
async function fakePhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    const g = c.getContext("2d")!;
    g.fillStyle = "#006B54";
    g.fillRect(0, 0, 800, 600);
    g.fillStyle = "#FFFFFF";
    g.font = "bold 72px sans-serif";
    g.fillText("TEST PHOTO", 170, 320);
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

test("scan a new label, register, open, edit and see the history", async ({ page }, info) => {
  const project = info.project.name;
  const label = await newTestLabel();
  const name = `Test run ${Date.now()} ${project} lectern`;

  // Signed out: scanning shows only the sign-in page.
  await page.goto(`/l/${label}`);
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));

  // Signed in, the scan carries on to "Register an item" with the number filled in.
  await expect(page).toHaveURL(new RegExp(`/items/new\\?label=${label}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Register an item" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Label number", exact: true })).toHaveValue(label);
  await s(page, "register-step-1", project);

  // "Next" with nothing filled in stays on step 1.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 1 of 2")).toBeVisible();

  await page.getByText("Fixed asset", { exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Furniture" });
  await page.getByRole("combobox", { name: "Location", exact: true }).selectOption({ label: "Test Building A › Test Room A1" });
  await page.getByTestId("photo-input").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: await fakePhoto(page) });
  await expect(page.getByRole("img", { name: "Preview of the new photo" })).toBeVisible();
  await s(page, "register-step-2", project);
  await page.getByRole("button", { name: "Register item" }).click();

  // The new item.
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\?done=registered$/);
  const itemUrl = page.url().split("?")[0];
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Item registered" })).toBeVisible();
  await expect(page.getByTestId("status")).toHaveText("Good");
  await expect(page.getByRole("img", { name: `Photo of ${name}` })).toBeVisible();
  await expect(page.getByTestId("history")).toContainText("Registered");
  await expect(page.getByTestId("history")).toContainText(centre.displayName);
  await s(page, "item-detail", project);

  // Edit: the change and the original both show in the history.
  await page.getByRole("link", { name: "Edit details" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit details" })).toBeVisible();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(`${name} (oak)`);
  await page.getByRole("textbox", { name: "Value (euros)", exact: true }).fill("125.50");
  await s(page, "item-edit", project);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\?done=saved$/);
  const history = page.getByTestId("history");
  await expect(history).toContainText(`Name: ${name} → ${name} (oak)`);
  await expect(history).toContainText("Value: nothing → €125.50");
  await expect(history).toContainText("Registered");
  await s(page, "item-detail-history", project);

  // Scanning the same label again now opens the item.
  await page.goto(`/l/${label}`);
  await expect(page).toHaveURL(itemUrl);

  // A consumable has a third step: how it is counted.
  const label2 = await newTestLabel();
  await page.goto(`/l/${label2}`);
  await page.getByText("Consumable", { exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(`Test run ${Date.now()} ${project} hand gel`);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Cleaning supplies" });
  // Only store rooms and shelves are offered for a consumable.
  await expect(page.getByRole("combobox", { name: "Store room or shelf", exact: true }).locator("option", { hasText: /^Test Building A › Test Room A1$/ })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Store room or shelf", exact: true }).selectOption({ label: "Test Building A › Test Room A1 › Test Store Room A1-1 › Test Shelf A1-1-1" });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await page.getByRole("textbox", { name: "Counted in (unit)", exact: true }).fill("bottle");
  await page.getByRole("spinbutton", { name: "Minimum level" }).fill("4");
  await s(page, "register-step-3-consumable", project);
  await page.getByRole("button", { name: "Register item" }).click();
  await expect(page.getByTestId("status")).toHaveText("Not counted yet");

  // The list: everything, then a search.
  await page.goto("/items");
  await expect(page.getByRole("heading", { level: 1, name: "Items" })).toBeVisible();
  await expect(page.getByTestId("item-count")).toContainText(/\d+ items/);
  await s(page, "items-list", project);
  await page.getByRole("textbox", { name: "Search", exact: true }).fill(`${name} (oak)`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("item-count")).toHaveText("1 item");
  await s(page, "items-list-search", project);

  // A typed number that was never printed.
  await page.getByPlaceholder("Label number, e.g. ICCI-000123").fill("ICCI-999999");
  await page.getByRole("button", { name: "Open label" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Label not recognised" })).toBeVisible();
  await s(page, "label-unknown", project);

  // A label link with a stray "%" in it (audit fix 10) shows the same page,
  // not an error. (A link that is not a valid address at all, such as
  // "%E0%A4%A", is turned away by Next.js itself with "400 Bad Request".)
  await page.goto("/l/100%25");
  await expect(page.getByRole("heading", { level: 1, name: "Label not recognised" })).toBeVisible();
});
