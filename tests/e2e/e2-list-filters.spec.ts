// Slice E2 in a real browser, on a PC-sized and a phone-sized window: the
// filter boxes of every list fit their words and stay inside their card; on
// a PC the lists update by themselves, so there is no Search or Show button;
// on a phone two or more drop-downs fold behind "More filters". The Items
// list shows short places and says which kind of status it shows; badges
// that every row would repeat are gone. Screens saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const s = (page: Page, name: string, project: string) => shot(page, name, project, "e2");

// Every list with a filter card. "fold" says whether a phone folds its drop-downs.
const LISTS = [
  { path: "/items", fold: true },
  { path: "/people", fold: true },
  { path: "/assets", fold: true },
  { path: "/assets/not-seen", fold: true },
  { path: "/assets/register", fold: false },
  { path: "/people/training", fold: true },
  { path: "/people/vetting", fold: true },
  { path: "/policies/grid", fold: true },
  { path: "/renewals", fold: true },
  { path: "/tickets", fold: true },
];

async function signInAt(page: Page, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

test("every filter box fits its words, and the buttons follow the E2 rules", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAt(page, LISTS[0].path);
  for (const list of LISTS) {
    await page.goto(list.path);
    const form = page.locator("form.list-filters").first();
    await expect(form).toBeVisible();
    const submit = form.locator('button[type="submit"]');
    const fold = page.getByRole("button", { name: /^(More|Fewer) filters/ });
    const selects = form.locator("select");
    if (isPhone(page)) {
      // Phone: the Search or Show button stays; two or more drop-downs fold.
      await expect(submit, list.path).toBeVisible();
      if (list.fold) {
        await expect(fold, list.path).toBeVisible();
        await expect(selects.first(), list.path).toBeHidden();
        await fold.click();
      } else {
        await expect(fold, list.path).toHaveCount(0);
      }
      await expect(selects.first(), list.path).toBeVisible();
    } else {
      // PC: the list updates by itself, so no Search or Show button.
      await expect(submit, list.path).toBeHidden();
      await expect(fold, list.path).toBeHidden();
    }
    // No box is cut off: each is inside the card and wide enough for its words.
    const problems = await form.evaluate((f) => {
      const card = f.getBoundingClientRect();
      const ctx = document.createElement("canvas").getContext("2d")!;
      const out: string[] = [];
      for (const el of Array.from(f.querySelectorAll<HTMLElement>("select, input:not([type=hidden]):not([type=checkbox])"))) {
        const box = el.getBoundingClientRect();
        if (box.width === 0) continue;
        const name = el.getAttribute("name");
        if (box.right > card.right + 0.5 || box.left < card.left - 0.5) out.push(`${name} runs past the card`);
        if (el instanceof HTMLSelectElement) {
          const css = getComputedStyle(el);
          ctx.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
          const words = ctx.measureText(el.selectedOptions[0]?.text ?? "").width;
          // Room for the words, the left padding and the arrow.
          if (el.clientWidth < words + parseFloat(css.paddingLeft) + 30) out.push(`${name} is too narrow (${el.clientWidth}px for ${Math.ceil(words)}px of words)`);
        }
      }
      return out;
    });
    expect(problems, list.path).toEqual([]);
  }
});

test("on a PC a search runs on Enter and a tick box updates the list", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "PC only: a phone keeps its Search button");
  await signInAt(page, "/items");
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("chair");
  await page.getByRole("textbox", { name: "Search", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/items\?q=chair/);
  await page.goto("/people/vetting");
  await page.getByRole("checkbox", { name: /do not need vetting/ }).check();
  await expect(page).toHaveURL(/all=yes/);
  await expect(page.getByRole("checkbox", { name: /do not need vetting/ })).toBeChecked();
});

test("Garda vetting folds its drop-downs on a phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "Phone only");
  await signInAt(page, "/people/vetting");
  await expect(page.getByRole("button", { name: "More filters" })).toBeVisible();
  await expect(page.getByLabel("Section")).toBeHidden();
  await s(page, "vetting-folded", info.project.name);
  await page.getByRole("button", { name: "More filters" }).click();
  await expect(page.getByLabel("Section")).toBeVisible();
  await s(page, "vetting-unfolded", info.project.name);
});

test("Items: short places, the kind of status, and 'No items match' said once", async ({ page }, info) => {
  await signInAt(page, "/items");
  await expect(page.getByTestId("item-count")).toBeVisible();
  const table = !isPhone(page);
  if (table) {
    await expect(page.locator("table.list-table tbody tr").first()).toBeVisible();
    expect(await page.getByTestId("place").filter({ visible: true }).count()).toBeGreaterThan(0);
    for (const cell of await page.getByTestId("place").filter({ visible: true }).all()) {
      const shown = (await cell.textContent())!.split(" › ").length;
      expect(shown).toBeLessThanOrEqual(2);
      expect(await cell.getAttribute("title")).toContain(await cell.textContent());
    }
  }
  const statuses = await page.getByTestId("item-status").filter({ visible: true }).allTextContents();
  expect(statuses.length).toBeGreaterThan(0);
  for (const t of statuses) expect(t).toMatch(/^(Stock|Condition): /);
  await s(page, "items-list", info.project.name);

  // Nothing matches: the empty card says so, the count line does not repeat it.
  await page.goto("/items?q=zzqqxx-nothing");
  await expect(page.getByTestId("empty-list")).toContainText("No items match");
  await expect(page.getByText(/No items match/).filter({ visible: true })).toHaveCount(1);
});

test("badges every row would repeat are gone", async ({ page }, info) => {
  await signInAt(page, "/people");
  // "Active only" is the filter, so no row says Active.
  const people = page.getByTestId("person-row").filter({ visible: true });
  await expect(people.first()).toBeVisible();
  await expect(people.getByText("Active", { exact: true })).toHaveCount(0);
  // Everyone is the mixed list, so there each person says Active or Switched off.
  await page.goto("/people?show=all");
  const everyone = page.getByTestId("person-row").filter({ visible: true });
  await expect(everyone.first()).toBeVisible();
  await expect(everyone.first().getByText(/^(Active|Switched off)$/)).toBeVisible();
  // "Switched off only" already says it, so no row repeats it.
  await page.goto("/people?show=off");
  const off = page.getByTestId("person-row").filter({ visible: true });
  if (await off.count()) await expect(off.getByText("Switched off", { exact: true })).toHaveCount(0);

  // Tickets: no red "Open" badge on every open ticket.
  await page.goto("/tickets?status=open");
  const tickets = page.getByTestId("ticket-row").filter({ visible: true });
  if (await tickets.count()) {
    await expect(tickets.getByTestId("status").filter({ hasText: /^Open$/ })).toHaveCount(0);
  }
  await s(page, "tickets-list", info.project.name);

  // Expenses waiting: no "Waiting" pill on every waiting claim.
  await page.goto("/expenses");
  const claims = page.getByTestId("claim-row");
  if (await claims.count()) await expect(claims.getByText("Waiting", { exact: true })).toHaveCount(0);
});
