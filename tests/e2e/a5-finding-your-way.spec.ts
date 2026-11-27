// Slice A5 in a real browser, on a PC-sized and a phone-sized window: Home's
// order and links, Back that remembers the list (with its filter), the Open
// label box taking a room code, the new menu lines, the tablet rail's
// dividers, and the library's desk tabs, call links and "due in 3 days".
// Screens saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ATTENTION_ORDER } from "@/lib/home/counters";
import { placeCode } from "@/lib/places/rules";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, mainMenu, openMenuGroups, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const s = (page: Page, name: string, project: string) => shot(page, name, project, "a5");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function signInAs(page: Page, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

test("Home: red before amber, people and safety first, each line opens its filtered list", async ({ page }, info) => {
  await signInAs(page, "/");
  // E1: the Urgent list keeps A5's order (people and safety first).
  const rows = page.getByRole("region", { name: "Urgent" }).locator("[data-tone]");
  await expect(rows.first()).toBeVisible();
  const seen = await rows.evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-testid")!.replace(/^counter-/, ""), tone: e.getAttribute("data-tone")! })));
  const key = (r: { id: string; tone: string }) => (r.tone === "red" ? 0 : 1) * 100 + ATTENTION_ORDER.indexOf(r.id);
  expect(seen.map(key)).toEqual([...seen.map(key)].sort((a, b) => a - b));

  // The vetting line (the seed has made-up people with expired vetting) opens only those people.
  const vetting = page.getByTestId("counter-vetting");
  await expect(vetting).toHaveAttribute("href", "/people/vetting?status=attention");
  // D1: low stock is a job (amber), never an alarm, and is counted once on Home.
  const low = page.getByTestId("counter-low-stock");
  if (await low.getAttribute("data-tone")) await expect(low).not.toHaveAttribute("data-tone", "red");
  await expect(page.getByTestId("headline-low-stock")).toHaveCount(0);
  await s(page, "home", info.project.name);

  await vetting.click();
  await expect(page).toHaveURL(/\/people\/vetting\?status=attention$/);
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("attention");
  for (const badge of await page.getByTestId("vetting-row").filter({ visible: true }).getByTestId("status").all()) {
    await expect(badge).toHaveText(/Expired|Not vetted|Due soon/);
  }
});

test("Back returns to the list you came from, with its filter, and names it", async ({ page }, info) => {
  await signInAs(page, "/people/vetting?status=attention");
  await page.getByTestId("vetting-row").filter({ visible: true }).first().locator("xpath=descendant-or-self::a").first().click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  const back = page.getByTestId("back-button");
  await expect(back).toHaveAccessibleName("Back to Garda vetting");
  await expect(back).toHaveAttribute("href", "/people/vetting?status=attention");
  if (!isPhone(page)) await expect(back).toContainText("to Garda vetting");
  await s(page, "back-to-vetting", info.project.name);
  await back.click();
  await expect(page).toHaveURL(/\/people\/vetting\?status=attention$/);

  // Home forgets it: a person opened afterwards goes back to People.
  await page.goto("/");
  await page.goto("/people");
  await page.goto("/");
  await expect(page.getByTestId("greeting")).toBeVisible(); // Home has had its moment to forget
  const { data } = await master().from("people").select("id").eq("active", true).limit(1).single();
  await page.goto(`/people/${data!.id}`);
  await expect(page.getByTestId("back-button")).toHaveAttribute("href", "/people");
});

test("the Open label box opens a room by its code; the menu has the two new lines", async ({ page }, info) => {
  test.skip(isPhone(page), "The Open label box and the sidebar are on a PC and tablet only.");
  const { data: room } = await master().from("locations").select("id, code").eq("name", "Test Room A1").single();
  await signInAs(page, "/");
  // D8: the one search box still opens a typed place code straight away.
  await page.getByTestId("search-box").fill(placeCode(room!.code));
  await page.getByTestId("search-box").press("Enter");
  await expect(page).toHaveURL(new RegExp(`/places/${room!.id}$`));

  const menu = await mainMenu(page);
  await openMenuGroups(menu);
  await expect(menu.getByRole("link", { name: "Stock corrections waiting", exact: true })).toHaveAttribute("href", "/stock/approvals");
  await expect(menu.getByRole("link", { name: "Reminders", exact: true })).toHaveAttribute("href", "/reminders");

  // A tablet: thin lines between the icon groups.
  await page.setViewportSize({ width: 820, height: 1100 });
  await page.goto("/");
  await expect(page.getByTestId("greeting")).toBeVisible();
  await expect(page.getByTestId("sidebar").getByTestId("rail-divider").first()).toBeVisible();
  const line = await page.getByTestId("sidebar").getByTestId("rail-divider").first().evaluate((e) => getComputedStyle(e).borderTopWidth);
  expect(line).toBe("1px");
  await s(page, "tablet-rail", info.project.name);
});

test("library: the copy page has the desk tabs; due in 3 days keeps its filter; numbers can be tapped", async ({ page }, info) => {
  const db = master();
  const { data: copy } = await db.from("library_copies").select("id").limit(1).single();
  await signInAs(page, `/library/copies/${copy!.id}`);
  await expect(page.getByRole("navigation", { name: "Library desk" })).toBeVisible();

  await page.goto("/library/overview");
  const seeAll = page.getByTestId("overview-due-soon").getByRole("link", { name: /See/ });
  if (await seeAll.count()) await expect(seeAll).toHaveAttribute("href", "/library/on-loan?due=3");
  for (const phone of await page.getByTestId("contact-link").filter({ visible: true }).all()) {
    await expect(phone).toHaveAttribute("href", /^(tel:\+?[0-9]+|mailto:.+)$/);
  }
  await page.goto("/library/on-loan?due=3");
  await expect(page.getByTestId("due-soon-only")).toBeVisible();
  await s(page, "on-loan-due-soon", info.project.name);
  await page.getByRole("link", { name: "Show every book on loan" }).click();
  await expect(page).toHaveURL(/\/library\/on-loan$/);
});
