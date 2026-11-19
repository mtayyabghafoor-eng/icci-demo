// Step-by-step screenshots of each workflow, for the Centre's admins to
// approve. Made-up seed data only. Forms are filled in to show the step but
// NOT saved, except a stocktake of Test Room A1 (started and two labels
// scanned, never sent). If one step fails, it is noted and the rest go on.
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { enterCode, enterPassword, expectSignInPage, mainMenu } from "../e2e/helpers";

const centre = seedAdmin("centre_admin");
const second = SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!;
const finance = seedAdmin("finance");
const failed: string[] = [];

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
async function itemId(label: string) {
  const { data, error } = await db().from("items").select("id").eq("label_serial", label).single();
  if (error) throw error;
  return data.id as string;
}

async function snap(page: Page, name: string, project: string) {
  // Wait until the page itself has drawn (not the "Checking your sign-in" screen).
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.getByText(/^(Loading|Opening|Working out|Checking)/)).toHaveCount(0);
  await page.waitForTimeout(500);
  // One screen at a time, exactly as the admin would see it.
  await page.screenshot({
    path: `docs/screens/walkthrough/${name}-${project}.png`,
    scale: "css",
    mask: [page.getByTestId("setup-key")],
    caret: "initial",
  });
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await test.step(name, fn);
  } catch (e) {
    failed.push(`${name}: ${(e as Error).message.split("\n")[0]}`);
  }
}

async function signIn(page: Page, who: { email: string }, to = "/", project?: string) {
  await page.goto(to);
  await expectSignInPage(page);
  if (project) await snap(page, "01-sign-in", project);
  await enterPassword(page, who.email);
  if (project) {
    await expect(page.getByLabel("6-digit code")).toBeVisible({ timeout: 30_000 });
    await snap(page, "02-code", project);
  }
  await enterCode(page, testAuthenticatorSecret(who.email));
}
async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).first().click();
  await expectSignInPage(page);
}

test.afterAll(() => {
  if (failed.length) console.log(`\nSTEPS THAT FAILED (${failed.length}):\n- ${failed.join("\n- ")}`);
  else console.log("\nEvery step worked.");
});

test("desktop walkthrough", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const p = "desktop";
  const kettle = await itemId("ICCI-000009");
  const soap = await itemId("ICCI-000152");

  await signIn(page, centre, "/", p);
  await step("home", async () => {
    await expect(page.getByTestId("greeting")).toBeVisible();
    await snap(page, "03-home", p);
  });

  // Inventory: finding items.
  await step("items list", async () => {
    await page.goto("/items");
    await expect(page.getByRole("heading", { level: 1, name: "Items" })).toBeVisible();
    await snap(page, "10-items-list", p);
  });
  await step("items search", async () => {
    await page.getByRole("textbox", { name: "Search", exact: true }).fill("kettle");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/kettle/);
    await snap(page, "11-items-search", p);
  });
  await step("asset detail", async () => {
    await page.goto(`/items/${kettle}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("kettle");
    await snap(page, "12-asset-detail", p);
  });

  // Registering a new item (not saved).
  await step("register step 1", async () => {
    await page.goto("/items/new");
    await expect(page.getByRole("heading", { level: 1, name: "Register an item" })).toBeVisible();
    await snap(page, "13-register-step-1", p);
    await page.getByRole("textbox", { name: "Label number", exact: true }).fill("ICCI-000290");
    await page.getByText("Fixed asset", { exact: true }).click().catch(() => undefined);
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Test projector 01");
    await snap(page, "14-register-step-1-filled", p);
    await page.getByRole("button", { name: "Next" }).click();
  });
  await step("register step 2", async () => {
    await expect(page.getByText(/Step 2 of/)).toBeVisible();
    await page.getByRole("combobox", { name: "Category", exact: true }).selectOption({ index: 1 });
    await page.getByRole("combobox", { name: "Location", exact: true }).selectOption({ label: "Test Building A › Test Room A1" });
    await snap(page, "15-register-step-2", p);
  });

  // Labels.
  await step("print labels", async () => {
    await page.goto("/labels");
    await expect(page.getByRole("heading", { level: 1, name: "Print labels" })).toBeVisible();
    await page.getByLabel("How many labels?").fill("21");
    await snap(page, "16-print-labels", p);
  });
  await step("label sheet", async () => {
    await page.goto("/labels/sheet/2");
    await snap(page, "17-label-sheet", p);
  });

  // Stock (consumables). Nothing saved.
  await step("stock list", async () => {
    await page.goto("/stock");
    await snap(page, "20-stock", p);
  });
  await step("consumable detail", async () => {
    await page.goto(`/items/${soap}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("soap");
    await snap(page, "22-consumable-detail", p);
  });
  await step("count shelf", async () => {
    await page.goto(`/items/${soap}`);
    await page.getByRole("link", { name: "Count this shelf" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Count this shelf" })).toBeVisible();
    await page.getByLabel("How many are on the shelf now?").fill("9");
    await snap(page, "23-count-shelf", p);
  });
  await step("add stock", async () => {
    await page.goto(`/items/${soap}`);
    await page.getByRole("link", { name: "Add stock" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Add stock" })).toBeVisible();
    await page.getByLabel("How many are you adding?").fill("6");
    await snap(page, "24-add-stock", p);
  });
  await step("correct an entry", async () => {
    await page.goto(`/items/${soap}`);
    await page.getByTestId("stock-entries").getByRole("link", { name: "Correct this entry" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Correct an entry" })).toBeVisible();
    await page.getByLabel("What should the number have been?").fill("7");
    await page.getByLabel("Reason").fill("Test: the delivery note said 7 packs");
    await snap(page, "25-correct-entry", p);
  });
  await step("weekly count", async () => {
    await page.goto("/stock/count");
    await expect(page.getByRole("heading", { level: 1, name: "Weekly count" })).toBeVisible();
    const store = page.getByLabel("Store room");
    if (await store.isVisible()) {
      await store.selectOption({ index: 1 });
      const open = page.getByRole("button", { name: /^Open/ }).first();
      if (await open.isVisible()) await open.click();
    }
    await snap(page, "26-weekly-count", p);
  });
  await step("stock approvals, own entries", async () => {
    await page.goto("/stock/approvals");
    await snap(page, "27-stock-approvals-own", p);
  });

  // Fixed assets. Nothing saved.
  await step("move", async () => {
    await page.goto(`/items/${kettle}`);
    await page.getByRole("link", { name: "Move" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Move this asset" })).toBeVisible();
    await page.getByRole("combobox", { name: "Where is it going?" }).selectOption({ index: 2 });
    await snap(page, "30-move", p);
  });
  await step("report damage", async () => {
    await page.goto(`/items/${kettle}`);
    await page.getByRole("link", { name: "Report damage" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Report damage" })).toBeVisible();
    await page.getByLabel("Note").fill("Test: the handle is loose").catch(() => undefined);
    await snap(page, "31-report-damage", p);
  });
  await step("mark missing", async () => {
    await page.goto(`/items/${kettle}`);
    await page.getByRole("link", { name: "Mark missing" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mark missing" })).toBeVisible();
    await snap(page, "32-mark-missing", p);
  });
  await step("dispose", async () => {
    await page.goto(`/items/${kettle}`);
    await page.getByRole("link", { name: "Dispose" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Dispose of this asset" })).toBeVisible();
    await snap(page, "33-dispose", p);
  });
  await step("missing and damaged", async () => {
    await page.goto("/assets");
    await expect(page.getByRole("heading", { level: 1, name: "Missing and damaged" })).toBeVisible();
    await snap(page, "34-missing-and-damaged", p);
  });
  await step("not seen", async () => {
    await page.goto("/assets/not-seen");
    await snap(page, "35-not-seen-12-months", p);
  });
  await step("asset register", async () => {
    await page.goto("/assets/register");
    await snap(page, "36-asset-register", p);
  });

  // Stocktake of Test Room A1: started, two labels scanned, never sent.
  let stocktakeUrl = "";
  await step("stocktake start", async () => {
    await page.goto("/stocktake");
    await expect(page.getByRole("heading", { level: 1, name: "Stocktake" })).toBeVisible();
    await page.getByLabel("Room").selectOption({ label: "Test Building A › Test Room A1" }).catch(() => undefined);
    await snap(page, "40-stocktake-start", p);
    // A stocktake of Test Room A1 may already be under way from an earlier run.
    const { data: loc } = await db().from("locations").select("id").eq("name", "Test Room A1").single();
    const { data: open } = await db().from("stocktakes").select("id").eq("location_id", loc!.id).eq("status", "open").maybeSingle();
    if (open) await page.goto(`/stocktake/${open.id}`);
    else await page.getByRole("button", { name: "Start the stocktake" }).click();
    await expect(page).toHaveURL(/\/stocktake\/\d+$/);
    stocktakeUrl = page.url();
    await snap(page, "41-stocktake-open", p);
  });
  await step("stocktake scan an asset", async () => {
    await page.goto(`${stocktakeUrl}/scan?label=ICCI-000051`);
    await snap(page, "42-stocktake-scan-asset", p);
    const seen = page.getByRole("button", { name: "Seen here" });
    if (await seen.isVisible()) await seen.click();
    await page.waitForTimeout(1500);
  });
  await step("stocktake count a shelf", async () => {
    await page.goto(`${stocktakeUrl}/scan?label=ICCI-000172`);
    const box = page.getByLabel("How many are on the shelf?");
    await expect(box).toBeVisible();
    await box.fill("11");
    await snap(page, "43-stocktake-count-shelf", p);
    const save = page.getByRole("button", { name: /^Save/ }).first();
    if (await save.isVisible()) await save.click();
    await page.waitForTimeout(1500);
  });
  await step("stocktake check and finish", async () => {
    await page.goto(stocktakeUrl);
    await page.getByRole("link", { name: "Check and finish" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Check and finish" })).toBeVisible();
    await snap(page, "44-stocktake-check-and-finish", p);
  });

  // People.
  await step("people", async () => {
    await page.goto("/people");
    await snap(page, "60-people", p);
    await page.locator("main a[href^='/people/'], #content a[href^='/people/']").filter({ visible: true }).filter({ hasNotText: /Add|vetting/i }).first().click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
    await snap(page, "61-person", p);
  });
  await step("vetting", async () => {
    await page.goto("/people/vetting");
    await snap(page, "62-garda-vetting", p);
  });
  await step("training", async () => {
    await page.goto("/people/training");
    await snap(page, "63-training", p);
    await page.goto("/people/training/types");
    await snap(page, "64-training-types", p);
  });

  // A different admin decides: nobody approves their own entry.
  await signOut(page);
  await signIn(page, second, "/stock/approvals");
  await step("stock approvals, other admin", async () => {
    await snap(page, "28-stock-approvals-other-admin", p);
  });
  await step("disposal approvals", async () => {
    await page.goto("/assets/approvals");
    await snap(page, "37-disposals-waiting", p);
  });
  await step("stocktake approval", async () => {
    const { data: loc } = await db().from("locations").select("id").eq("name", "Test Room B1").single();
    const { data: st } = await db()
      .from("stocktakes")
      .select("id")
      .eq("location_id", loc!.id)
      .eq("status", "submitted")
      .order("id")
      .limit(1)
      .single();
    await page.goto(`/stocktake/${st!.id}`);
    await snap(page, "45-stocktake-approval", p);
  });

  // Finance sees much less.
  await signOut(page);
  await signIn(page, finance, "/");
  await step("finance home", async () => {
    await snap(page, "70-finance-home", p);
  });
});

test("phone walkthrough", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  const p = "phone";
  const soap = await itemId("ICCI-000152");
  const { data: loc } = await db().from("locations").select("id").eq("name", "Test Room A1").single();
  const { data: open } = await db().from("stocktakes").select("id").eq("location_id", loc!.id).eq("status", "open").maybeSingle();
  const scanUrl = (label: string) => (open ? `/stocktake/${open.id}/scan?label=${label}` : `/l/${label}`);
  await signIn(page, centre, "/", p);
  await step("phone home", async () => {
    await expect(page.getByTestId("greeting")).toBeVisible();
    await snap(page, "03-home", p);
  });
  await step("phone menu", async () => {
    await mainMenu(page);
    await snap(page, "04-menu", p);
    await page.getByRole("button", { name: "Close the menu" }).click();
  });
  await step("phone items", async () => {
    await page.goto("/items");
    await snap(page, "10-items-list", p);
  });
  await step("phone scan page", async () => {
    await page.goto("/scan");
    await snap(page, "50-scan", p);
  });
  await step("phone count with plus and minus", async () => {
    await page.goto(`/items/${soap}`);
    await page.getByRole("link", { name: "Count this shelf" }).click();
    await page.getByRole("button", { name: "One more" }).click();
    await page.getByRole("button", { name: "One more" }).click();
    await snap(page, "23-count-shelf", p);
  });
  await step("phone stocktake scan", async () => {
    await page.goto(scanUrl("ICCI-000063"));
    await snap(page, "42-stocktake-scan-asset", p);
  });
  await step("phone stocktake shelf", async () => {
    await page.goto(scanUrl("ICCI-000186"));
    await snap(page, "43-stocktake-count-shelf", p);
  });
});
