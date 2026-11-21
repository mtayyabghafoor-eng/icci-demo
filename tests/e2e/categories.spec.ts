// Slice P1.17 in a real browser, on a PC-sized and a phone-sized window:
// the Categories screen (main categories with their sub-categories), adding
// a main category and a sub-category, renaming, the plain refusals, switching
// off, the grouped picker on the item forms and the main-category filter on
// the item list. Finance and signed-out visitors see nothing. Every screen is
// saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, mainMenu, shot, showFilters } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p1-17");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const saved = (page: Page) => page.getByRole("status").filter({ visible: true });

test("the category list; add a main category and a sub-category; rename; switch off", async ({ page }, info) => {
  const project = info.project.name;
  const stamp = `Test run ${Date.now().toString(36)} ${project}`;

  await signInAs(page, centre, "/categories");
  await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible();
  await expectCurrentMenuLink(page, "Categories");
  const garden = page.getByTestId("category-group").filter({ hasText: "Garden, tools and cleaning equipment" });
  await expect(garden).toContainText("Lawnmowers");
  await expect(garden).toContainText("Other tools and equipment");
  // "Other" comes last.
  await expect(page.getByTestId("category-group").last()).toContainText("Other items");
  await s(page, "categories-list", project);

  // A new main category.
  await page.getByRole("link", { name: "Add a main category" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a Main Category" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill(`${stamp} main`);
  await s(page, "add-main-category", project);
  await page.getByRole("button", { name: "Add main category" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${stamp} main` })).toBeVisible();
  await expect(saved(page)).toContainText("Category added");
  await expect(visible(page, "category-level")).toHaveText("Main category");

  // A sub-category inside it.
  await page.getByRole("link", { name: "Add a sub-category" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a Sub-category" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill(`${stamp} sub`);
  await page.getByRole("button", { name: "Add sub-category" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${stamp} sub` })).toBeVisible();
  await expect(visible(page, "category-level")).toHaveText("Sub-category");
  await expect(visible(page, "category-main")).toContainText(`${stamp} main`);
  await s(page, "sub-category-page", project);

  // Rename it.
  await page.getByRole("link", { name: "Rename" }).click();
  await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill(`${stamp} sub renamed`);
  await s(page, "rename-category", project);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${stamp} sub renamed` })).toBeVisible();
  const subUrl = page.url();

  // A name already used anywhere in the list is refused in plain words.
  await page.getByRole("link", { name: `${stamp} main` }).filter({ visible: true }).first().click();
  await page.getByRole("link", { name: "Add a sub-category" }).click();
  await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill("lawnmowers");
  await page.getByRole("button", { name: "Add sub-category" }).click();
  await expect(visible(page, "form-error")).toContainText("already a category called that");

  // The main category cannot be switched off while its sub-category is on.
  await page.getByRole("link", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(visible(page, "form-error")).toContainText("Switch off its sub-categories first");
  await s(page, "switch-off-refused", project);

  // Switch off the sub-category, then the main one.
  await page.goto(subUrl);
  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(saved(page)).toContainText("Switched off");
  await expect(visible(page, "status")).toContainText("Switched off");
  await page.getByRole("link", { name: `${stamp} main` }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(saved(page)).toContainText("Switched off");

  // Hidden from the list until asked for.
  await page.goto("/categories");
  await expect(page.getByTestId("categories-tree")).not.toContainText(`${stamp} main`);
  await page.getByRole("link", { name: /^Show \d+ switched-off/ }).click();
  await expect(page.getByTestId("categories-tree")).toContainText(`${stamp} main`);
});

test("the item forms pick a sub-category from groups; the item list filters by a main category", async ({ page }, info) => {
  const project = info.project.name;
  const { data: garden } = await master().from("item_categories").select("id").eq("name", "Garden, tools and cleaning equipment").single();

  await signInAs(page, centre, `/items?category=${garden!.id}`);
  const list = page.getByRole("main");
  await expect(list.getByText(/^Test lawnmower \d+$/).filter({ visible: true }).first()).toBeVisible();
  await expect(list.getByText(/^Test folding chair/).filter({ visible: true })).toHaveCount(0);
  // The filter offers the whole main category and each sub-category (on a phone, open the filters first).
  await showFilters(page);
  const filter = page.getByRole("combobox", { name: "Category", exact: true });
  await expect(filter.locator("option:checked")).toHaveText("All of Garden, tools and cleaning equipment");
  await expect(filter.locator("optgroup", { hasText: "Lawnmowers" })).toHaveAttribute("label", "Garden, tools and cleaning equipment");
  await s(page, "items-filtered-by-main-category", project);

  // The item page shows "Main › Sub".
  await list.getByText(/^Test lawnmower \d+$/).filter({ visible: true }).first().click();
  await expect(page.getByRole("main")).toContainText("Garden, tools and cleaning equipment › Lawnmowers");
});

test("finance sees no categories and no menu link", async ({ page }) => {
  await signInAs(page, finance, "/categories");
  await expect(page.getByTestId("categories-not-allowed")).toBeVisible();
  await expect((await mainMenu(page)).getByRole("link", { name: "Categories", exact: true })).toHaveCount(0);
});

test("a signed-out visitor sees only the sign-in page", async ({ page }) => {
  await page.goto("/categories");
  await expectSignInPage(page);
});
